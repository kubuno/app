//! Moteur de données dynamique — les « Things » de Bubble.
//!
//! Les types de données définis par l'utilisateur (dans la définition `.kbapp`)
//! n'ont PAS de table physique : leurs enregistrements vivent génériquement dans
//! `app.records` (colonne JSONB `data`). Ce module expose un CRUD + une recherche
//! par contraintes (filtre/tri/pagination) que le runtime de l'app consomme.

use axum::{
    extract::{Path, State},
    Json,
};
use serde_json::{json, Value};
use sqlx::QueryBuilder;
use uuid::Uuid;

use crate::{
    errors::{AppError, Result},
    middleware::AppUserExt,
    models::record::{Constraint, CreateRecordDto, Record, SearchQuery, UpdateRecordDto},
    state::AppState,
};

/// Vérifie que l'application appartient à l'utilisateur (sinon 404).
async fn assert_app_owner(state: &AppState, app_id: Uuid, owner: Uuid) -> Result<()> {
    let ok = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM app.apps WHERE id = $1 AND owner_id = $2)",
    )
    .bind(app_id).bind(owner)
    .fetch_one(&state.db).await?;
    if ok { Ok(()) } else { Err(AppError::NotFound("Application introuvable".into())) }
}

fn value_to_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

/// Applique une contrainte à la clause WHERE en cours (paramètres liés = sûr).
fn apply_constraint(qb: &mut QueryBuilder<sqlx::Postgres>, c: &Constraint) {
    let field = c.field.clone();
    match c.op.as_str() {
        "equals" => {
            qb.push(" AND data ->> ").push_bind(field).push(" = ").push_bind(value_to_text(&c.value));
        }
        "not_equals" => {
            qb.push(" AND data ->> ").push_bind(field).push(" IS DISTINCT FROM ").push_bind(value_to_text(&c.value));
        }
        "contains" => {
            qb.push(" AND data ->> ").push_bind(field).push(" ILIKE ").push_bind(format!("%{}%", value_to_text(&c.value)));
        }
        "greater_than" => {
            if let Some(n) = c.value.as_f64().or_else(|| value_to_text(&c.value).parse::<f64>().ok()) {
                qb.push(" AND (data ->> ").push_bind(field).push(")::numeric > ").push_bind(n);
            } else {
                qb.push(" AND data ->> ").push_bind(field).push(" > ").push_bind(value_to_text(&c.value));
            }
        }
        "less_than" => {
            if let Some(n) = c.value.as_f64().or_else(|| value_to_text(&c.value).parse::<f64>().ok()) {
                qb.push(" AND (data ->> ").push_bind(field).push(")::numeric < ").push_bind(n);
            } else {
                qb.push(" AND data ->> ").push_bind(field).push(" < ").push_bind(value_to_text(&c.value));
            }
        }
        "in" => {
            let arr: Vec<String> = match &c.value {
                Value::Array(a) => a.iter().map(value_to_text).collect(),
                other => vec![value_to_text(other)],
            };
            qb.push(" AND data ->> ").push_bind(field).push(" = ANY(").push_bind(arr).push(")");
        }
        "is_empty" => {
            qb.push(" AND (data ->> ").push_bind(field.clone()).push(" IS NULL OR data ->> ").push_bind(field).push(" = '')");
        }
        "is_not_empty" => {
            qb.push(" AND data ->> ").push_bind(field.clone()).push(" IS NOT NULL AND data ->> ").push_bind(field).push(" <> ''");
        }
        _ => { /* opérateur inconnu : ignoré */ }
    }
}

/// Résout une application PUBLIÉE par son slug → (app_id, owner_id). Garde pour
/// l'accès public anonyme (apps publiées uniquement, hors corbeille).
pub async fn resolve_published(state: &AppState, slug: &str) -> Result<(Uuid, Uuid)> {
    sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT id, owner_id FROM app.apps WHERE slug = $1 AND is_published = TRUE AND is_trashed = FALSE",
    )
    .bind(slug)
    .fetch_optional(&state.db).await?
    .ok_or_else(|| AppError::NotFound("Application introuvable".into()))
}

// ── Fonctions cœur (partagées par l'accès authentifié ET public) ─────────────
// `owner` = propriétaire de l'app ; les enregistrements vivent toujours sous lui.

async fn do_search(state: &AppState, app_id: Uuid, owner: Uuid, type_name: &str, q: &SearchQuery) -> Result<Value> {
    let mut qb: QueryBuilder<sqlx::Postgres> =
        QueryBuilder::new("SELECT * FROM app.records WHERE app_id = ");
    qb.push_bind(app_id).push(" AND owner_id = ").push_bind(owner).push(" AND type_name = ").push_bind(type_name.to_string());
    for c in &q.constraints { apply_constraint(&mut qb, c); }
    if let Some(txt) = q.search_text.as_ref().filter(|s| !s.trim().is_empty()) {
        qb.push(" AND data::text ILIKE ").push_bind(format!("%{}%", txt));
    }
    match q.sort_field.as_deref() {
        Some("_created_at") | None => { qb.push(" ORDER BY created_at"); }
        Some("_updated_at") => { qb.push(" ORDER BY updated_at"); }
        Some(f) => { qb.push(" ORDER BY data ->> ").push_bind(f.to_string()); }
    }
    qb.push(if q.sort_desc { " DESC" } else { " ASC" });
    let limit = q.limit.unwrap_or(200).clamp(1, 1000);
    let offset = q.offset.unwrap_or(0).max(0);
    qb.push(" LIMIT ").push_bind(limit).push(" OFFSET ").push_bind(offset);
    let rows = qb.build_query_as::<Record>().fetch_all(&state.db).await?;
    let results: Vec<Value> = rows.iter().map(|r| r.flatten()).collect();

    let mut cqb: QueryBuilder<sqlx::Postgres> =
        QueryBuilder::new("SELECT COUNT(*) FROM app.records WHERE app_id = ");
    cqb.push_bind(app_id).push(" AND owner_id = ").push_bind(owner).push(" AND type_name = ").push_bind(type_name.to_string());
    for c in &q.constraints { apply_constraint(&mut cqb, c); }
    if let Some(txt) = q.search_text.as_ref().filter(|s| !s.trim().is_empty()) {
        cqb.push(" AND data::text ILIKE ").push_bind(format!("%{}%", txt));
    }
    let count: i64 = cqb.build_query_scalar().fetch_one(&state.db).await?;
    Ok(json!({ "results": results, "count": count }))
}

async fn do_list(state: &AppState, app_id: Uuid, owner: Uuid, type_name: &str) -> Result<Value> {
    let rows = sqlx::query_as::<_, Record>(
        "SELECT * FROM app.records WHERE app_id = $1 AND owner_id = $2 AND type_name = $3 ORDER BY created_at DESC LIMIT 1000",
    )
    .bind(app_id).bind(owner).bind(type_name)
    .fetch_all(&state.db).await?;
    let results: Vec<Value> = rows.iter().map(|r| r.flatten()).collect();
    Ok(json!({ "results": results, "count": results.len() }))
}

async fn do_create(state: &AppState, app_id: Uuid, owner: Uuid, created_by: Option<Uuid>, type_name: &str, raw: Value) -> Result<Value> {
    let data = if raw.is_object() { raw } else { json!({}) };
    let rec = sqlx::query_as::<_, Record>(
        r#"INSERT INTO app.records (app_id, owner_id, type_name, created_by, data)
           VALUES ($1, $2, $3, $4, $5) RETURNING *"#,
    )
    .bind(app_id).bind(owner).bind(type_name).bind(created_by).bind(&data)
    .fetch_one(&state.db).await?;
    Ok(rec.flatten())
}

async fn do_update(state: &AppState, app_id: Uuid, owner: Uuid, rid: Uuid, raw: Value) -> Result<Value> {
    let patch = if raw.is_object() { raw } else { json!({}) };
    let rec = sqlx::query_as::<_, Record>(
        r#"UPDATE app.records SET data = data || $4
           WHERE id = $1 AND app_id = $2 AND owner_id = $3 RETURNING *"#,
    )
    .bind(rid).bind(app_id).bind(owner).bind(&patch)
    .fetch_optional(&state.db).await?
    .ok_or_else(|| AppError::NotFound("Enregistrement introuvable".into()))?;
    Ok(rec.flatten())
}

async fn do_delete(state: &AppState, app_id: Uuid, owner: Uuid, rid: Uuid) -> Result<Value> {
    let affected = sqlx::query("DELETE FROM app.records WHERE id = $1 AND app_id = $2 AND owner_id = $3")
        .bind(rid).bind(app_id).bind(owner)
        .execute(&state.db).await?.rows_affected();
    if affected == 0 { return Err(AppError::NotFound("Enregistrement introuvable".into())); }
    Ok(json!({ "deleted": true }))
}

// ── Handlers authentifiés (propriétaire) ─────────────────────────────────────

/// POST /apps/:app_id/data/:type/search — recherche par contraintes.
pub async fn search(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, type_name)): Path<(Uuid, String)>,
    Json(q): Json<SearchQuery>,
) -> Result<Json<Value>> {
    assert_app_owner(&state, app_id, user.id).await?;
    Ok(Json(do_search(&state, app_id, user.id, &type_name, &q).await?))
}

/// GET /apps/:app_id/data/:type — liste simple (tous les enregistrements du type).
pub async fn list(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, type_name)): Path<(Uuid, String)>,
) -> Result<Json<Value>> {
    assert_app_owner(&state, app_id, user.id).await?;
    Ok(Json(do_list(&state, app_id, user.id, &type_name).await?))
}

/// POST /apps/:app_id/data/:type — création d'un enregistrement.
pub async fn create(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, type_name)): Path<(Uuid, String)>,
    Json(dto): Json<CreateRecordDto>,
) -> Result<Json<Value>> {
    assert_app_owner(&state, app_id, user.id).await?;
    Ok(Json(do_create(&state, app_id, user.id, Some(user.id), &type_name, dto.data).await?))
}

// ── Handlers PUBLICS (app publiée, visiteur anonyme) ─────────────────────────

pub async fn public_search(
    State(state): State<AppState>,
    Path((slug, type_name)): Path<(String, String)>,
    Json(q): Json<SearchQuery>,
) -> Result<Json<Value>> {
    let (app_id, owner) = resolve_published(&state, &slug).await?;
    Ok(Json(do_search(&state, app_id, owner, &type_name, &q).await?))
}

pub async fn public_list(
    State(state): State<AppState>,
    Path((slug, type_name)): Path<(String, String)>,
) -> Result<Json<Value>> {
    let (app_id, owner) = resolve_published(&state, &slug).await?;
    Ok(Json(do_list(&state, app_id, owner, &type_name).await?))
}

pub async fn public_create(
    State(state): State<AppState>,
    Path((slug, type_name)): Path<(String, String)>,
    Json(dto): Json<CreateRecordDto>,
) -> Result<Json<Value>> {
    let (app_id, owner) = resolve_published(&state, &slug).await?;
    Ok(Json(do_create(&state, app_id, owner, None, &type_name, dto.data).await?))
}

pub async fn public_update(
    State(state): State<AppState>,
    Path((slug, _type_name, rid)): Path<(String, String, Uuid)>,
    Json(dto): Json<UpdateRecordDto>,
) -> Result<Json<Value>> {
    let (app_id, owner) = resolve_published(&state, &slug).await?;
    Ok(Json(do_update(&state, app_id, owner, rid, dto.data).await?))
}

pub async fn public_delete(
    State(state): State<AppState>,
    Path((slug, _type_name, rid)): Path<(String, String, Uuid)>,
) -> Result<Json<Value>> {
    let (app_id, owner) = resolve_published(&state, &slug).await?;
    Ok(Json(do_delete(&state, app_id, owner, rid).await?))
}

/// GET /apps/:app_id/data/:type/:rid
pub async fn get(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, _type_name, rid)): Path<(Uuid, String, Uuid)>,
) -> Result<Json<Value>> {
    let rec = sqlx::query_as::<_, Record>(
        "SELECT * FROM app.records WHERE id = $1 AND app_id = $2 AND owner_id = $3",
    )
    .bind(rid).bind(app_id).bind(user.id)
    .fetch_optional(&state.db).await?
    .ok_or_else(|| AppError::NotFound("Enregistrement introuvable".into()))?;
    Ok(Json(rec.flatten()))
}

/// PUT /apps/:app_id/data/:type/:rid — mise à jour partielle (fusion des champs).
pub async fn update(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, _type_name, rid)): Path<(Uuid, String, Uuid)>,
    Json(dto): Json<UpdateRecordDto>,
) -> Result<Json<Value>> {
    let patch = if dto.data.is_object() { dto.data } else { json!({}) };
    // Fusion JSONB côté SQL : data || patch (le patch écrase les clés existantes).
    let rec = sqlx::query_as::<_, Record>(
        r#"UPDATE app.records SET data = data || $4
           WHERE id = $1 AND app_id = $2 AND owner_id = $3 RETURNING *"#,
    )
    .bind(rid).bind(app_id).bind(user.id).bind(&patch)
    .fetch_optional(&state.db).await?
    .ok_or_else(|| AppError::NotFound("Enregistrement introuvable".into()))?;
    Ok(Json(rec.flatten()))
}

/// DELETE /apps/:app_id/data/:type/:rid
pub async fn delete(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, _type_name, rid)): Path<(Uuid, String, Uuid)>,
) -> Result<Json<Value>> {
    let affected = sqlx::query(
        "DELETE FROM app.records WHERE id = $1 AND app_id = $2 AND owner_id = $3",
    )
    .bind(rid).bind(app_id).bind(user.id)
    .execute(&state.db).await?
    .rows_affected();
    if affected == 0 {
        return Err(AppError::NotFound("Enregistrement introuvable".into()));
    }
    Ok(Json(json!({ "deleted": true })))
}

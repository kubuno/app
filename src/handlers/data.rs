//! Moteur de données dynamique — les « Things » de Bubble.
//!
//! Les types de données définis par l'utilisateur (dans la définition `.kbapp`)
//! n'ont PAS de table physique : leurs enregistrements vivent génériquement dans
//! `app.records` (colonne JSON `data`). Ce module expose un CRUD + une recherche
//! par contraintes (filtre/tri/pagination) que le runtime de l'app consomme.
//!
//! # Portable JSON access (the no-code engine's hard part)
//!
//! The filters address arbitrary top-level keys of the `data` object, and the
//! key comes from the caller. PostgreSQL's `data ->> key`, MySQL's
//! `JSON_UNQUOTE(JSON_EXTRACT(...))` and SQLite's `json_extract(...)` differ in
//! both spelling AND path syntax, so every access goes through [`push_json_text`]
//! / [`push_json_number`], which emit the right form for the running engine and
//! **bind the key as data** — never interpolate it. Dynamic filters are built
//! with [`DbQueryBuilder`] under `SqlSafeStr`: structure is `&'static` text,
//! every value (including the JSON key/path) is a placeholder.

use axum::{
    extract::{Path, State},
    Json,
};
use kubuno_db::dialect::{Backend, SqlType};
use kubuno_db::{params, DbQueryBuilder};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::{AppError, Result},
    middleware::AppUserExt,
    models::record::{Constraint, CreateRecordDto, Record, SearchQuery, UpdateRecordDto},
    state::AppState,
};

/// Vérifie que l'application appartient à l'utilisateur (sinon 404).
async fn assert_app_owner(state: &AppState, app_id: Uuid, owner: Uuid) -> Result<()> {
    let sql = format!(
        "SELECT {} FROM app.apps WHERE id = $1 AND owner_id = $2",
        state.db.backend().count_bigint("*")
    );
    let n = state
        .db
        .fetch_scalar::<i64>(&sql, params![app_id, owner])
        .await?;
    if n > 0 {
        Ok(())
    } else {
        Err(AppError::NotFound("Application introuvable".into()))
    }
}

fn value_to_text(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        Value::Bool(b) => b.to_string(),
        other => other.to_string(),
    }
}

/// The JSON path bind value for a single top-level `field`, in the spelling the
/// running engine's JSON functions expect: PostgreSQL binds the bare key (used
/// with `->>`), MySQL and SQLite bind a `$."key"` path (double-quoted so a key
/// with a dot stays a single member). The value is always a bound parameter.
fn json_path(backend: Backend, field: &str) -> String {
    match backend {
        Backend::Postgres => field.to_string(),
        Backend::MySql | Backend::Sqlite => {
            format!("$.\"{}\"", field.replace('"', "\\\""))
        }
    }
}

/// Pushes an "extract top-level `field` from `data`, as text" expression,
/// binding the key. Portable across the three engines.
fn push_json_text(qb: &mut DbQueryBuilder, field: &str) {
    let b = qb.backend();
    match b {
        Backend::Postgres => {
            qb.push("data ->> ").push_bind(field.to_string());
        }
        Backend::MySql => {
            qb.push("JSON_UNQUOTE(JSON_EXTRACT(data, ")
                .push_bind(json_path(b, field))
                .push("))");
        }
        Backend::Sqlite => {
            qb.push("json_extract(data, ")
                .push_bind(json_path(b, field))
                .push(")");
        }
    }
}

/// Same as [`push_json_text`], but the extracted value is cast to a floating
/// number for `>` / `<` comparisons.
fn push_json_number(qb: &mut DbQueryBuilder, field: &str) {
    let b = qb.backend();
    match b {
        Backend::Postgres => {
            qb.push("(data ->> ")
                .push_bind(field.to_string())
                .push(")::double precision");
        }
        Backend::MySql => {
            qb.push("CAST(JSON_UNQUOTE(JSON_EXTRACT(data, ")
                .push_bind(json_path(b, field))
                .push(")) AS DOUBLE)");
        }
        Backend::Sqlite => {
            qb.push("CAST(json_extract(data, ")
                .push_bind(json_path(b, field))
                .push(") AS REAL)");
        }
    }
}

/// Applique une contrainte à la clause WHERE en cours (valeurs liées = sûr).
fn apply_constraint(qb: &mut DbQueryBuilder, c: &Constraint) {
    match c.op.as_str() {
        "equals" => {
            qb.push(" AND ");
            push_json_text(qb, &c.field);
            qb.push(" = ").push_bind(value_to_text(&c.value));
        }
        "not_equals" => {
            // Null-safe "distinct from" — spelled three ways.
            qb.push(" AND ");
            match qb.backend() {
                Backend::Postgres => {
                    push_json_text(qb, &c.field);
                    qb.push(" IS DISTINCT FROM ").push_bind(value_to_text(&c.value));
                }
                Backend::Sqlite => {
                    push_json_text(qb, &c.field);
                    qb.push(" IS NOT ").push_bind(value_to_text(&c.value));
                }
                Backend::MySql => {
                    qb.push("NOT (");
                    push_json_text(qb, &c.field);
                    qb.push(" <=> ").push_bind(value_to_text(&c.value)).push(")");
                }
            }
        }
        "contains" => {
            qb.push(" AND LOWER(");
            push_json_text(qb, &c.field);
            qb.push(") LIKE LOWER(")
                .push_bind(format!("%{}%", value_to_text(&c.value)))
                .push(")");
        }
        "greater_than" => {
            qb.push(" AND ");
            if let Some(n) = c.value.as_f64().or_else(|| value_to_text(&c.value).parse::<f64>().ok()) {
                push_json_number(qb, &c.field);
                qb.push(" > ").push_bind(n);
            } else {
                push_json_text(qb, &c.field);
                qb.push(" > ").push_bind(value_to_text(&c.value));
            }
        }
        "less_than" => {
            qb.push(" AND ");
            if let Some(n) = c.value.as_f64().or_else(|| value_to_text(&c.value).parse::<f64>().ok()) {
                push_json_number(qb, &c.field);
                qb.push(" < ").push_bind(n);
            } else {
                push_json_text(qb, &c.field);
                qb.push(" < ").push_bind(value_to_text(&c.value));
            }
        }
        "in" => {
            let arr: Vec<String> = match &c.value {
                Value::Array(a) => a.iter().map(value_to_text).collect(),
                other => vec![value_to_text(other)],
            };
            qb.push(" AND ");
            push_json_text(qb, &c.field);
            qb.push_in(arr);
        }
        "is_empty" => {
            qb.push(" AND (");
            push_json_text(qb, &c.field);
            qb.push(" IS NULL OR ");
            push_json_text(qb, &c.field);
            qb.push(" = '')");
        }
        "is_not_empty" => {
            qb.push(" AND ");
            push_json_text(qb, &c.field);
            qb.push(" IS NOT NULL AND ");
            push_json_text(qb, &c.field);
            qb.push(" <> ''");
        }
        _ => { /* opérateur inconnu : ignoré */ }
    }
}

/// Emits `app_id = ? AND owner_id = ? AND type_name = ?` plus every constraint
/// and the free-text filter — the WHERE body shared by the search and its count.
fn push_scope_and_filters(
    qb: &mut DbQueryBuilder,
    app_id: Uuid,
    owner: Uuid,
    type_name: &str,
    q: &SearchQuery,
) {
    qb.push("app_id = ")
        .push_bind(app_id)
        .push(" AND owner_id = ")
        .push_bind(owner)
        .push(" AND type_name = ")
        .push_bind(type_name.to_string());
    for c in &q.constraints {
        apply_constraint(qb, c);
    }
    if let Some(txt) = q.search_text.as_ref().filter(|s| !s.trim().is_empty()) {
        let data_as_text = qb.backend().cast("data", SqlType::Text);
        qb.push(" AND LOWER(")
            .push(data_as_text)
            .push(") LIKE LOWER(")
            .push_bind(format!("%{}%", txt))
            .push(")");
    }
}

/// Instance policy: an administrator may require every visitor of a published
/// app to hold an account. Checked on every auth-less entry point, BEFORE the
/// slug is looked up, so the answer does not depend on whether the app exists.
pub fn assert_anonymous_access_allowed(state: &AppState) -> Result<()> {
    if state.instance().require_signin_for_published_apps {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

/// Instance policy: whether an anonymous visitor may write. Reading a published
/// app is a separate decision and stays governed by the setting above.
fn assert_anonymous_writes_allowed(state: &AppState) -> Result<()> {
    if !state.instance().allow_public_data_writes {
        return Err(AppError::PolicyRefused(
            "Écriture anonyme désactivée par l'administrateur".into(),
        ));
    }
    Ok(())
}

/// Refuses one more record when the application already sits at the instance
/// ceiling. `0` means unlimited and skips the count entirely.
async fn enforce_record_quota(state: &AppState, app_id: Uuid) -> Result<()> {
    let max = state.instance().max_records_per_app;
    if max <= 0 {
        return Ok(());
    }
    let sql = format!(
        "SELECT {} FROM app.records WHERE app_id = $1",
        state.db.backend().count_bigint("*")
    );
    let held = state
        .db
        .fetch_scalar::<i64>(&sql, params![app_id])
        .await
        .map_err(|e| {
            tracing::error!(error = %e, app = %app_id, "Comptage des enregistrements pour le quota");
            AppError::Database(e)
        })?;

    if held >= max as i64 {
        return Err(AppError::PolicyRefused(format!(
            "Quota atteint : {max} enregistrements au maximum par application sur cette instance."
        )));
    }
    Ok(())
}

/// Résout une application PUBLIÉE par son slug → (app_id, owner_id). Garde pour
/// l'accès public anonyme (apps publiées uniquement, hors corbeille).
pub async fn resolve_published(state: &AppState, slug: &str) -> Result<(Uuid, Uuid)> {
    assert_anonymous_access_allowed(state)?;
    state
        .db
        .fetch_optional_as::<(Uuid, Uuid)>(
            "SELECT id, owner_id FROM app.apps WHERE slug = $1 AND is_published = $2 AND is_trashed = $3",
            params![slug, true, false],
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Application introuvable".into()))
}

/// Résout l'accès aux données PARTAGÉES d'une app (multi-utilisateurs) →
/// owner_id du pool commun. Autorisé pour le propriétaire, ou pour tout
/// utilisateur authentifié si l'app est publiée ; le type doit être déclaré
/// partagé (`shared_types`). Les enregistrements vivent sous l'owner de l'app
/// mais gardent l'identité du créateur (`created_by`).
pub async fn resolve_shared(state: &AppState, app_id: Uuid, user_id: Uuid, type_name: &str) -> Result<Uuid> {
    let row = state
        .db
        .fetch_optional_as::<(Uuid, bool, bool, kubuno_db::JsonVec<String>)>(
            "SELECT owner_id, is_published, is_shared, shared_types FROM app.apps WHERE id = $1 AND is_trashed = $2",
            params![app_id, false],
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Application introuvable".into()))?;
    let (owner, is_published, is_shared, shared_types) = row;
    if !is_shared || !shared_types.iter().any(|t| t == type_name) {
        return Err(AppError::NotFound("Type de données non partagé".into()));
    }
    if owner != user_id && !is_published {
        return Err(AppError::Forbidden);
    }
    Ok(owner)
}

/// Shallow-merges `patch` onto `base` (patch keys overwrite), the portable
/// equivalent of PostgreSQL's `data || patch`. Done in Rust so the semantics are
/// identical on all three engines (MySQL's `JSON_MERGE_PATCH` and SQLite's
/// `json_patch` differ on how a null-valued key is treated).
fn merge_shallow(base: Value, patch: Value) -> Value {
    match (base, patch) {
        (Value::Object(mut b), Value::Object(p)) => {
            for (k, v) in p {
                b.insert(k, v);
            }
            Value::Object(b)
        }
        (base, _) => base,
    }
}

// ── Fonctions cœur (partagées par l'accès authentifié ET public) ─────────────
// `owner` = propriétaire de l'app ; les enregistrements vivent toujours sous lui.

async fn do_search(state: &AppState, app_id: Uuid, owner: Uuid, type_name: &str, q: &SearchQuery) -> Result<Value> {
    let backend = state.db.backend();

    let mut qb = DbQueryBuilder::new(backend, "SELECT * FROM app.records WHERE ");
    push_scope_and_filters(&mut qb, app_id, owner, type_name, q);
    match q.sort_field.as_deref() {
        Some("_created_at") | None => {
            qb.push(" ORDER BY created_at");
        }
        Some("_updated_at") => {
            qb.push(" ORDER BY updated_at");
        }
        Some(f) => {
            qb.push(" ORDER BY ");
            push_json_text(&mut qb, f);
        }
    }
    qb.push(if q.sort_desc { " DESC" } else { " ASC" });
    let limit = q.limit.unwrap_or(200).clamp(1, 1000);
    let offset = q.offset.unwrap_or(0).max(0);
    qb.push_limit_offset(limit, offset);
    let rows = qb.fetch_all_as::<Record>(&state.db).await?;
    let results: Vec<Value> = rows.iter().map(|r| r.flatten()).collect();

    let mut cqb = DbQueryBuilder::new(
        backend,
        format!("SELECT {} FROM app.records WHERE ", backend.count_bigint("*")),
    );
    push_scope_and_filters(&mut cqb, app_id, owner, type_name, q);
    let count = cqb.fetch_scalar::<i64>(&state.db).await?;
    Ok(json!({ "results": results, "count": count }))
}

async fn do_list(state: &AppState, app_id: Uuid, owner: Uuid, type_name: &str) -> Result<Value> {
    let rows = state
        .db
        .fetch_all_as::<Record>(
            "SELECT * FROM app.records WHERE app_id = $1 AND owner_id = $2 AND type_name = $3 ORDER BY created_at DESC LIMIT 1000",
            params![app_id, owner, type_name.to_string()],
        )
        .await?;
    let results: Vec<Value> = rows.iter().map(|r| r.flatten()).collect();
    Ok(json!({ "results": results, "count": results.len() }))
}

async fn do_create(state: &AppState, app_id: Uuid, owner: Uuid, created_by: Option<Uuid>, type_name: &str, raw: Value) -> Result<Value> {
    // Single choke point for every creation path — owner, anonymous visitor and
    // shared pool all land here, so the ceiling cannot be walked around.
    enforce_record_quota(state, app_id).await?;
    let data = if raw.is_object() { raw } else { json!({}) };
    // No RETURNING (MySQL has none): mint the id in Rust and reselect.
    let id = kubuno_db::new_id();
    let now = chrono::Utc::now();
    state
        .db
        .execute(
            "INSERT INTO app.records (id, app_id, owner_id, type_name, created_by, data, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
            params![id, app_id, owner, type_name.to_string(), created_by, data, now, now],
        )
        .await?;
    let rec = state
        .db
        .fetch_one_as::<Record>("SELECT * FROM app.records WHERE id = $1", params![id])
        .await?;
    Ok(rec.flatten())
}

async fn do_update(state: &AppState, app_id: Uuid, owner: Uuid, rid: Uuid, raw: Value) -> Result<Value> {
    let patch = if raw.is_object() { raw } else { json!({}) };
    // Read-modify-write inside a transaction: fetch the current JSON, merge in
    // Rust (identical semantics on every engine), write it back. Replaces the
    // PostgreSQL-only `data = data || patch`.
    let mut tx = state.db.begin().await?;
    let current: Option<Value> = tx
        .fetch_optional_row(
            "SELECT data FROM app.records WHERE id = $1 AND app_id = $2 AND owner_id = $3",
            params![rid, app_id, owner],
        )
        .await?
        .map(|row| row.try_get::<Value>("data"))
        .transpose()?;
    let current = match current {
        Some(v) => v,
        None => {
            tx.rollback().await?;
            return Err(AppError::NotFound("Enregistrement introuvable".into()));
        }
    };
    let merged = merge_shallow(current, patch);
    let now = chrono::Utc::now();
    // Placeholders must appear in strictly increasing order in the text (SET
    // before WHERE), so the merged data / timestamp come first.
    tx.execute(
        "UPDATE app.records SET data = $1, updated_at = $2 WHERE id = $3 AND app_id = $4 AND owner_id = $5",
        params![merged, now, rid, app_id, owner],
    )
    .await?;
    tx.commit().await?;

    let rec = state
        .db
        .fetch_one_as::<Record>("SELECT * FROM app.records WHERE id = $1", params![rid])
        .await?;
    Ok(rec.flatten())
}

async fn do_delete(state: &AppState, app_id: Uuid, owner: Uuid, rid: Uuid) -> Result<Value> {
    let affected = state
        .db
        .execute(
            "DELETE FROM app.records WHERE id = $1 AND app_id = $2 AND owner_id = $3",
            params![rid, app_id, owner],
        )
        .await?;
    if affected == 0 {
        return Err(AppError::NotFound("Enregistrement introuvable".into()));
    }
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
    assert_anonymous_writes_allowed(&state)?;
    let (app_id, owner) = resolve_published(&state, &slug).await?;
    Ok(Json(do_create(&state, app_id, owner, None, &type_name, dto.data).await?))
}

pub async fn public_update(
    State(state): State<AppState>,
    Path((slug, _type_name, rid)): Path<(String, String, Uuid)>,
    Json(dto): Json<UpdateRecordDto>,
) -> Result<Json<Value>> {
    assert_anonymous_writes_allowed(&state)?;
    let (app_id, owner) = resolve_published(&state, &slug).await?;
    Ok(Json(do_update(&state, app_id, owner, rid, dto.data).await?))
}

pub async fn public_delete(
    State(state): State<AppState>,
    Path((slug, _type_name, rid)): Path<(String, String, Uuid)>,
) -> Result<Json<Value>> {
    assert_anonymous_writes_allowed(&state)?;
    let (app_id, owner) = resolve_published(&state, &slug).await?;
    Ok(Json(do_delete(&state, app_id, owner, rid).await?))
}

// ── Handlers PARTAGÉS (multi-utilisateurs, authentifiés) ─────────────────────
// Pool de données commun (sous l'owner de l'app) avec identité réelle du créateur
// → applications collaboratives temps réel (messagerie…). Accessibles à tout
// compte connecté si l'app est publiée + le type déclaré partagé.

pub async fn shared_search(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, type_name)): Path<(Uuid, String)>,
    Json(q): Json<SearchQuery>,
) -> Result<Json<Value>> {
    let owner = resolve_shared(&state, app_id, user.id, &type_name).await?;
    Ok(Json(do_search(&state, app_id, owner, &type_name, &q).await?))
}

pub async fn shared_list(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, type_name)): Path<(Uuid, String)>,
) -> Result<Json<Value>> {
    let owner = resolve_shared(&state, app_id, user.id, &type_name).await?;
    Ok(Json(do_list(&state, app_id, owner, &type_name).await?))
}

pub async fn shared_create(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, type_name)): Path<(Uuid, String)>,
    Json(dto): Json<CreateRecordDto>,
) -> Result<Json<Value>> {
    let owner = resolve_shared(&state, app_id, user.id, &type_name).await?;
    // created_by = identité réelle de l'auteur, même si l'enregistrement vit dans
    // le pool partagé de l'owner.
    Ok(Json(do_create(&state, app_id, owner, Some(user.id), &type_name, dto.data).await?))
}

pub async fn shared_update(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, type_name, rid)): Path<(Uuid, String, Uuid)>,
    Json(dto): Json<UpdateRecordDto>,
) -> Result<Json<Value>> {
    let owner = resolve_shared(&state, app_id, user.id, &type_name).await?;
    Ok(Json(do_update(&state, app_id, owner, rid, dto.data).await?))
}

pub async fn shared_delete(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, type_name, rid)): Path<(Uuid, String, Uuid)>,
) -> Result<Json<Value>> {
    let owner = resolve_shared(&state, app_id, user.id, &type_name).await?;
    Ok(Json(do_delete(&state, app_id, owner, rid).await?))
}

/// GET /apps/:app_id/data/:type/:rid
pub async fn get(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, _type_name, rid)): Path<(Uuid, String, Uuid)>,
) -> Result<Json<Value>> {
    let rec = state
        .db
        .fetch_optional_as::<Record>(
            "SELECT * FROM app.records WHERE id = $1 AND app_id = $2 AND owner_id = $3",
            params![rid, app_id, user.id],
        )
        .await?
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
    Ok(Json(do_update(&state, app_id, user.id, rid, dto.data).await?))
}

/// DELETE /apps/:app_id/data/:type/:rid
pub async fn delete(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, _type_name, rid)): Path<(Uuid, String, Uuid)>,
) -> Result<Json<Value>> {
    Ok(Json(do_delete(&state, app_id, user.id, rid).await?))
}

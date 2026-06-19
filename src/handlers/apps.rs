use axum::{
    extract::{Path, State},
    Json,
};
use rand::Rng;
use serde_json::{json, Value};
use uuid::Uuid;
use validator::Validate;

use crate::{
    errors::{AppError, Result},
    middleware::AppUserExt,
    models::app::{Application, CreateAppDto, UpdateAppDto},
    services::content_files as cf,
    state::AppState,
};

fn random_slug() -> String {
    let mut rng = rand::thread_rng();
    (0..8).map(|_| {
        let n: u8 = rng.gen_range(0..36);
        if n < 10 { (b'0' + n) as char } else { (b'a' + n - 10) as char }
    }).collect()
}

/// Extrait les noms des types de données déclarés « partagés » dans la définition.
/// Sert à autoriser/router l'accès partagé multi-utilisateurs côté backend (sans
/// avoir à relire le fichier .kbapp à chaque requête de données).
fn extract_shared_types(def: &Value) -> Vec<String> {
    def.get("dataTypes")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter(|t| t.get("shared").and_then(|s| s.as_bool()).unwrap_or(false))
                .filter_map(|t| t.get("name").and_then(|n| n.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// GET /apps — liste des applications (métadonnée seule, sans la définition).
pub async fn list(
    State(state): State<AppState>,
    user: AppUserExt,
) -> Result<Json<Vec<Application>>> {
    let mut apps = sqlx::query_as::<_, Application>(
        r#"SELECT * FROM app.apps
           WHERE owner_id = $1 AND is_trashed = FALSE
           ORDER BY updated_at DESC"#,
    )
    .bind(user.id)
    .fetch_all(&state.db)
    .await?;
    for a in &mut apps {
        a.definition = json!(null);
    }
    Ok(Json(apps))
}

/// POST /apps — création d'une application.
pub async fn create(
    State(state): State<AppState>,
    user: AppUserExt,
    Json(dto): Json<CreateAppDto>,
) -> Result<Json<Application>> {
    dto.validate().map_err(|e| AppError::Validation(e.to_string()))?;

    let definition = dto.definition.unwrap_or_else(cf::empty_definition);
    let tags = dto.tags.unwrap_or_default();

    let file_id = cf::create_app_file(&state, user.id, &dto.name, definition.clone()).await?;
    let slug = random_slug();
    let shared_types = extract_shared_types(&definition);

    let mut app = sqlx::query_as::<_, Application>(
        r#"INSERT INTO app.apps (owner_id, name, description, file_id, slug, tags, is_shared, shared_types)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *"#,
    )
    .bind(user.id)
    .bind(&dto.name)
    .bind(dto.description.as_deref())
    .bind(file_id)
    .bind(&slug)
    .bind(&tags)
    .bind(!shared_types.is_empty())
    .bind(&shared_types)
    .fetch_one(&state.db)
    .await?;
    app.definition = definition;
    Ok(Json(app))
}

async fn fetch_owned(state: &AppState, id: Uuid, owner: Uuid) -> Result<Application> {
    sqlx::query_as::<_, Application>("SELECT * FROM app.apps WHERE id = $1 AND owner_id = $2")
        .bind(id)
        .bind(owner)
        .fetch_optional(&state.db)
        .await?
        .ok_or_else(|| AppError::NotFound("Application introuvable".into()))
}

async fn fetch_owned_full(state: &AppState, id: Uuid, owner: Uuid) -> Result<Application> {
    let mut app = fetch_owned(state, id, owner).await?;
    app.definition = match app.file_id {
        Some(fid) => cf::read_definition(state, owner, fid).await.unwrap_or_else(|_| cf::empty_definition()),
        None => cf::empty_definition(),
    };
    Ok(app)
}

/// GET /apps/:id — application complète (avec sa définition).
pub async fn get(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(id): Path<Uuid>,
) -> Result<Json<Application>> {
    let mut app = fetch_owned_full(&state, id, user.id).await?;
    // Nom = nom du fichier .kbapp ; self-heal si renommé ailleurs (drive).
    if let Some(fid) = app.file_id {
        if let Some(fname) = cf::file_name(&state, user.id, fid).await {
            let stem = cf::strip_ext(&fname);
            if !stem.is_empty() && stem != app.name {
                sqlx::query("UPDATE app.apps SET name = $2 WHERE id = $1")
                    .bind(id).bind(&stem).execute(&state.db).await?;
                app.name = stem;
            }
        }
    }
    Ok(Json(app))
}

#[derive(serde::Deserialize)]
pub struct OpenByFileDto {
    pub file_id: Uuid,
}

/// POST /apps/open-by-file — résout une application depuis l'id de fichier .kbapp.
pub async fn open_by_file(
    State(state): State<AppState>,
    user: AppUserExt,
    Json(dto): Json<OpenByFileDto>,
) -> Result<Json<Application>> {
    let id = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM app.apps WHERE file_id = $1 AND owner_id = $2",
    )
    .bind(dto.file_id).bind(user.id)
    .fetch_optional(&state.db).await?
    .ok_or_else(|| AppError::NotFound("Aucune application liée à ce fichier".into()))?;

    Ok(Json(fetch_owned_full(&state, id, user.id).await?))
}

/// PUT /apps/:id — sauvegarde (nom/description/définition/tags/publication).
pub async fn update(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(id): Path<Uuid>,
    Json(dto): Json<UpdateAppDto>,
) -> Result<Json<Application>> {
    dto.validate().map_err(|e| AppError::Validation(e.to_string()))?;
    let existing = fetch_owned(&state, id, user.id).await?;

    let name_changed = dto.name.as_deref().map(str::trim).is_some_and(|n| n != existing.name);
    let name = dto.name.unwrap_or(existing.name);
    let description = dto.description.or(existing.description);
    let tags = dto.tags.unwrap_or(existing.tags);
    let is_published = dto.is_published.unwrap_or(existing.is_published);

    let (file_id, definition) = match dto.definition {
        Some(def) => {
            let fid = match existing.file_id {
                Some(fid) => { cf::write_definition(&state, user.id, fid, def.clone()).await?; fid }
                None => cf::create_app_file(&state, user.id, &name, def.clone()).await?,
            };
            (fid, def)
        }
        None => match existing.file_id {
            Some(fid) => (fid, cf::read_definition(&state, user.id, fid).await.unwrap_or_else(|_| cf::empty_definition())),
            None => {
                let def = cf::empty_definition();
                (cf::create_app_file(&state, user.id, &name, def.clone()).await?, def)
            }
        },
    };

    let shared_types = extract_shared_types(&definition);
    let mut app = sqlx::query_as::<_, Application>(
        r#"UPDATE app.apps SET
            name = $2, description = $3, file_id = $4, tags = $5, is_published = $6,
            is_shared = $7, shared_types = $8
           WHERE id = $1 RETURNING *"#,
    )
    .bind(id)
    .bind(&name)
    .bind(description.as_deref())
    .bind(file_id)
    .bind(&tags)
    .bind(is_published)
    .bind(!shared_types.is_empty())
    .bind(&shared_types)
    .fetch_one(&state.db)
    .await?;
    app.definition = definition;

    if name_changed && !name.trim().is_empty() {
        cf::rename_content_file(&state, user.id, file_id, &name, "kbapp").await;
    }

    Ok(Json(app))
}

/// DELETE /apps/:id — corbeille.
pub async fn delete(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    fetch_owned(&state, id, user.id).await?;
    sqlx::query("UPDATE app.apps SET is_trashed = TRUE, is_published = FALSE WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    Ok(Json(json!({ "deleted": true })))
}

/// POST /apps/:id/duplicate
pub async fn duplicate(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(id): Path<Uuid>,
) -> Result<Json<Application>> {
    let src = fetch_owned_full(&state, id, user.id).await?;
    let new_name = format!("{} (copie)", src.name);
    let new_file_id = cf::create_app_file(&state, user.id, &new_name, src.definition.clone()).await?;
    let slug = random_slug();
    let shared_types = extract_shared_types(&src.definition);

    let mut app = sqlx::query_as::<_, Application>(
        r#"INSERT INTO app.apps (owner_id, name, description, file_id, slug, tags, is_shared, shared_types)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *"#,
    )
    .bind(user.id)
    .bind(&new_name)
    .bind(src.description.as_deref())
    .bind(new_file_id)
    .bind(&slug)
    .bind(&src.tags)
    .bind(!shared_types.is_empty())
    .bind(&shared_types)
    .fetch_one(&state.db)
    .await?;
    app.definition = src.definition;
    Ok(Json(app))
}

/// POST /apps/:id/publish — bascule l'état de publication.
pub async fn publish(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(id): Path<Uuid>,
    Json(body): Json<Value>,
) -> Result<Json<Application>> {
    fetch_owned(&state, id, user.id).await?;
    let publish = body.get("published").and_then(|v| v.as_bool()).unwrap_or(true);
    let app = sqlx::query_as::<_, Application>(
        "UPDATE app.apps SET is_published = $2 WHERE id = $1 RETURNING *",
    )
    .bind(id)
    .bind(publish)
    .fetch_one(&state.db)
    .await?;
    Ok(Json(app))
}

/// GET /public/apps/:slug — vue PUBLIQUE d'une app publiée (sans auth).
/// Renvoie nom + définition (lue depuis le fichier .kbapp du propriétaire).
pub async fn get_public(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<Value>> {
    let row = sqlx::query_as::<_, (Uuid, Uuid, Option<Uuid>, String)>(
        "SELECT id, owner_id, file_id, name FROM app.apps WHERE slug = $1 AND is_published = TRUE AND is_trashed = FALSE",
    )
    .bind(&slug)
    .fetch_optional(&state.db).await?
    .ok_or_else(|| AppError::NotFound("Application introuvable".into()))?;
    let (id, owner, file_id, name) = row;
    let definition = match file_id {
        Some(fid) => cf::read_definition(&state, owner, fid).await.unwrap_or_else(|_| cf::empty_definition()),
        None => cf::empty_definition(),
    };
    // `id` est exposé pour que le runtime authentifié puisse appeler les routes de
    // données PARTAGÉES (`/apps/:id/shared/:type`) avec l'identité du visiteur.
    Ok(Json(json!({ "id": id, "name": name, "slug": slug, "definition": definition })))
}

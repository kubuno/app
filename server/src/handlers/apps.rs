use axum::{
    extract::{Path, State},
    Json,
};
use kubuno_db::params;
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

/// Reselects a freshly written app row (no RETURNING on MySQL). `definition` is
/// left at its default and filled by the caller from the `.kbapp` file.
async fn fetch_owned(state: &AppState, id: Uuid, owner: Uuid) -> Result<Application> {
    state
        .db
        .fetch_optional_as::<Application>(
            "SELECT * FROM app.apps WHERE id = $1 AND owner_id = $2",
            params![id, owner],
        )
        .await?
        .ok_or_else(|| AppError::NotFound("Application introuvable".into()))
}

/// Enforces the instance-wide per-user app ceiling (`max_apps_per_user`) before a
/// new app is created or duplicated. `0` means unlimited, so the check is skipped.
/// Counts only live (non-trashed) apps the user owns.
async fn enforce_app_quota(state: &AppState, owner: Uuid) -> Result<()> {
    let max = state.instance().max_apps_per_user;
    if max <= 0 {
        return Ok(());
    }
    let sql = format!(
        "SELECT {} FROM app.apps WHERE owner_id = $1 AND is_trashed = $2",
        state.db.backend().count_bigint("*")
    );
    let count = state
        .db
        .fetch_scalar::<i64>(&sql, params![owner, false])
        .await?;
    if count >= max as i64 {
        return Err(AppError::PolicyRefused(format!(
            "Limite de {max} applications par utilisateur atteinte (fixée par l'administrateur)"
        )));
    }
    Ok(())
}

/// GET /apps — liste des applications (métadonnée seule, sans la définition).
pub async fn list(
    State(state): State<AppState>,
    user: AppUserExt,
) -> Result<Json<Vec<Application>>> {
    let mut apps = state
        .db
        .fetch_all_as::<Application>(
            "SELECT * FROM app.apps WHERE owner_id = $1 AND is_trashed = $2 ORDER BY updated_at DESC",
            params![user.id, false],
        )
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
    enforce_app_quota(&state, user.id).await?;

    let definition = dto.definition.unwrap_or_else(cf::empty_definition);
    let tags = dto.tags.unwrap_or_default();

    let file_id = cf::create_app_file(&state, user.id, &dto.name, definition.clone()).await?;
    let slug = random_slug();
    let shared_types = extract_shared_types(&definition);

    let id = kubuno_db::new_id();
    let now = chrono::Utc::now();
    state
        .db
        .execute(
            "INSERT INTO app.apps \
                 (id, owner_id, name, description, file_id, slug, tags, is_shared, shared_types, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            params![
                id,
                user.id,
                &dto.name,
                dto.description.as_deref(),
                file_id,
                &slug,
                &tags,
                !shared_types.is_empty(),
                &shared_types,
                now,
                now
            ],
        )
        .await?;

    let mut app = fetch_owned(&state, id, user.id).await?;
    app.definition = definition;
    Ok(Json(app))
}

async fn fetch_owned_full(state: &AppState, id: Uuid, owner: Uuid) -> Result<Application> {
    let mut app = fetch_owned(state, id, owner).await?;
    app.definition = match app.file_id {
        Some(fid) => cf::read_definition(state, owner, fid).await.unwrap_or_else(|_| cf::empty_definition()),
        None => cf::empty_definition(),
    };
    Ok(app)
}

/// Fetches an app accessible to `user_id` (owner OR shared collaborator). Returns the
/// row and whether the user is the owner. Collaborators see the app the owner owns.
async fn fetch_accessible(state: &AppState, id: Uuid, user_id: Uuid) -> Result<(Application, bool)> {
    let app = state
        .db
        .fetch_optional_as::<Application>("SELECT * FROM app.apps WHERE id = $1", params![id])
        .await?
        .ok_or_else(|| AppError::NotFound("Application introuvable".into()))?;
    if app.owner_id == user_id {
        return Ok((app, true));
    }
    let is_collab = state
        .db
        .fetch_scalar::<i64>(
            "SELECT COUNT(*) FROM app.app_collaborators WHERE app_id = $1 AND user_id = $2",
            params![id, user_id],
        )
        .await?
        > 0;
    if is_collab {
        Ok((app, false))
    } else {
        Err(AppError::NotFound("Application introuvable".into()))
    }
}

/// GET /apps/:id — application complète (avec sa définition).
pub async fn get(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(id): Path<Uuid>,
) -> Result<Json<Application>> {
    // Owner OR shared collaborator. The .kbapp file lives in the OWNER's Drive, so
    // the definition is always read under the owner's identity.
    let (mut app, is_owner) = fetch_accessible(&state, id, user.id).await?;
    let owner = app.owner_id;
    app.definition = match app.file_id {
        Some(fid) => cf::read_definition(&state, owner, fid).await.unwrap_or_else(|_| cf::empty_definition()),
        None => cf::empty_definition(),
    };
    // Nom = nom du fichier .kbapp ; self-heal si renommé ailleurs (owner uniquement).
    if is_owner {
        if let Some(fid) = app.file_id {
            if let Some(fname) = cf::file_name(&state, user.id, fid).await {
                let stem = cf::strip_ext(&fname);
                if !stem.is_empty() && stem != app.name {
                    state
                        .db
                        .execute(
                            "UPDATE app.apps SET name = $1, updated_at = $2 WHERE id = $3",
                            params![&stem, chrono::Utc::now(), id],
                        )
                        .await?;
                    app.name = stem;
                }
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
    let id = state
        .db
        .fetch_optional_scalar::<Uuid>(
            "SELECT id FROM app.apps WHERE file_id = $1 AND owner_id = $2",
            params![dto.file_id, user.id],
        )
        .await?
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
    // The same policy `publish` enforces: `PUT /apps/:id` also writes this flag,
    // so without the check here the whole setting could be walked around by
    // saving the app instead of pressing Publish.
    if is_published && !existing.is_published && !state.instance().allow_public_publishing {
        return Err(AppError::PolicyRefused(
            "Publication publique désactivée par l'administrateur".into(),
        ));
    }
    let is_starred = dto.is_starred.unwrap_or(existing.is_starred);

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
    state
        .db
        .execute(
            "UPDATE app.apps SET \
                name = $1, description = $2, file_id = $3, tags = $4, is_published = $5, \
                is_shared = $6, shared_types = $7, is_starred = $8, updated_at = $9 \
             WHERE id = $10",
            params![
                &name,
                description.as_deref(),
                file_id,
                &tags,
                is_published,
                !shared_types.is_empty(),
                &shared_types,
                is_starred,
                chrono::Utc::now(),
                id
            ],
        )
        .await?;
    let mut app = fetch_owned(&state, id, user.id).await?;
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
    state
        .db
        .execute(
            "UPDATE app.apps SET is_trashed = $1, is_published = $2, updated_at = $3 WHERE id = $4",
            params![true, false, chrono::Utc::now(), id],
        )
        .await?;
    Ok(Json(json!({ "deleted": true })))
}

/// POST /apps/:id/duplicate
pub async fn duplicate(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(id): Path<Uuid>,
) -> Result<Json<Application>> {
    enforce_app_quota(&state, user.id).await?;
    let src = fetch_owned_full(&state, id, user.id).await?;
    let new_name = format!("{} (copie)", src.name);
    let new_file_id = cf::create_app_file(&state, user.id, &new_name, src.definition.clone()).await?;
    let slug = random_slug();
    let shared_types = extract_shared_types(&src.definition);

    let new_id = kubuno_db::new_id();
    let now = chrono::Utc::now();
    state
        .db
        .execute(
            "INSERT INTO app.apps \
                 (id, owner_id, name, description, file_id, slug, tags, is_shared, shared_types, created_at, updated_at) \
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
            params![
                new_id,
                user.id,
                &new_name,
                src.description.as_deref(),
                new_file_id,
                &slug,
                &src.tags,
                !shared_types.is_empty(),
                &shared_types,
                now,
                now
            ],
        )
        .await?;

    let mut app = fetch_owned(&state, new_id, user.id).await?;
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
    // Instance policy: an admin may forbid NEW public publications. Already-published
    // apps are untouched; unpublishing (publish == false) is always allowed.
    if publish && !state.instance().allow_public_publishing {
        return Err(AppError::PolicyRefused(
            "Publication publique désactivée par l'administrateur".into(),
        ));
    }
    state
        .db
        .execute(
            "UPDATE app.apps SET is_published = $1, updated_at = $2 WHERE id = $3",
            params![publish, chrono::Utc::now(), id],
        )
        .await?;
    Ok(Json(fetch_owned(&state, id, user.id).await?))
}

/// GET /public/apps/:slug — vue PUBLIQUE d'une app publiée (sans auth).
/// Renvoie nom + définition (lue depuis le fichier .kbapp du propriétaire).
pub async fn get_public(
    State(state): State<AppState>,
    Path(slug): Path<String>,
) -> Result<Json<Value>> {
    // Instance policy: an admin may require an account to open a published app.
    crate::handlers::data::assert_anonymous_access_allowed(&state)?;
    let row = state
        .db
        .fetch_optional_as::<(Uuid, Uuid, Option<Uuid>, String)>(
            "SELECT id, owner_id, file_id, name FROM app.apps WHERE slug = $1 AND is_published = $2 AND is_trashed = $3",
            params![&slug, true, false],
        )
        .await?
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

//! User-to-user sharing of applications.
//!
//! An owner can grant access (`view`/`comment`/`edit`) to other Kubuno users, who
//! can then open and co-edit the app in real time (the collab room ACL admits them).
//! Here we manage the collaborator list and search recipients (`core.users`).

use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::{AppError, Result},
    middleware::AppUserExt,
    state::AppState,
};

const PERMISSIONS: [&str; 3] = ["view", "comment", "edit"];

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct RecipientHit {
    pub id:           Uuid,
    pub display_name: Option<String>,
    pub email:        String,
    pub avatar_url:   Option<String>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Collaborator {
    pub user_id:      Uuid,
    pub permission:   String,
    pub display_name: Option<String>,
    pub email:        String,
    pub avatar_url:   Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddCollaboratorDto {
    pub user_id:    Uuid,
    pub permission: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCollaboratorDto {
    pub permission: String,
}

/// True if `user` owns the application.
async fn is_owner(state: &AppState, app_id: Uuid, user_id: Uuid) -> Result<bool> {
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM app.apps WHERE id = $1 AND owner_id = $2)",
    )
    .bind(app_id).bind(user_id)
    .fetch_one(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: is_owner"); e })?;
    Ok(exists)
}

/// `GET /recipients?q=` — search users to share with.
pub async fn search_recipients(
    State(state): State<AppState>,
    user: AppUserExt,
    Query(q): Query<SearchQuery>,
) -> Result<Json<Value>> {
    let query = q.q.unwrap_or_default();
    let query = query.trim();
    if query.is_empty() {
        return Ok(Json(json!({ "recipients": [] })));
    }
    let pattern = format!("%{query}%");
    let hits = sqlx::query_as::<_, RecipientHit>(
        r#"SELECT id, display_name, email::text AS email, avatar_url
           FROM core.users
           WHERE is_active = TRUE
             AND id <> $1
             AND (email::text ILIKE $2 OR username ILIKE $2 OR display_name ILIKE $2)
           ORDER BY display_name NULLS LAST, email
           LIMIT 20"#,
    )
    .bind(user.id).bind(&pattern)
    .fetch_all(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: search"); e })?;
    Ok(Json(json!({ "recipients": hits })))
}

/// `GET /apps/:id/collaborators` — list collaborators (owner or collaborator).
pub async fn list(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(app_id): Path<Uuid>,
) -> Result<Json<Value>> {
    let has_access: bool = sqlx::query_scalar(
        r#"SELECT EXISTS(
               SELECT 1 FROM app.apps WHERE id = $1 AND owner_id = $2
               UNION
               SELECT 1 FROM app.app_collaborators WHERE app_id = $1 AND user_id = $2
           )"#,
    )
    .bind(app_id).bind(user.id)
    .fetch_one(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: access"); e })?;
    if !has_access {
        return Err(AppError::NotFound(format!("Application {app_id}")));
    }

    let owner = sqlx::query_as::<_, RecipientHit>(
        r#"SELECT u.id, u.display_name, u.email::text AS email, u.avatar_url
           FROM app.apps a JOIN core.users u ON u.id = a.owner_id
           WHERE a.id = $1"#,
    )
    .bind(app_id)
    .fetch_optional(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: owner"); e })?;

    let collaborators = sqlx::query_as::<_, Collaborator>(
        r#"SELECT c.user_id, c.permission,
                  u.display_name, u.email::text AS email, u.avatar_url
           FROM app.app_collaborators c
           JOIN core.users u ON u.id = c.user_id
           WHERE c.app_id = $1
           ORDER BY u.display_name NULLS LAST, u.email"#,
    )
    .bind(app_id)
    .fetch_all(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: list"); e })?;

    Ok(Json(json!({ "owner": owner, "collaborators": collaborators })))
}

/// `POST /apps/:id/collaborators` — add/update a collaborator (owner only).
pub async fn add(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(app_id): Path<Uuid>,
    Json(dto): Json<AddCollaboratorDto>,
) -> Result<Json<Value>> {
    if !is_owner(&state, app_id, user.id).await? {
        return Err(AppError::Forbidden);
    }
    let permission = dto.permission.unwrap_or_else(|| "edit".to_string());
    if !PERMISSIONS.contains(&permission.as_str()) {
        return Err(AppError::Validation(format!("Permission invalide : {permission}")));
    }
    if dto.user_id == user.id {
        return Err(AppError::Validation("Le propriétaire a déjà accès".into()));
    }
    let exists: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM core.users WHERE id = $1 AND is_active = TRUE)",
    )
    .bind(dto.user_id)
    .fetch_one(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: user check"); e })?;
    if !exists {
        return Err(AppError::NotFound("Utilisateur introuvable".into()));
    }

    sqlx::query(
        r#"INSERT INTO app.app_collaborators (app_id, user_id, permission)
           VALUES ($1, $2, $3)
           ON CONFLICT (app_id, user_id) DO UPDATE SET permission = EXCLUDED.permission"#,
    )
    .bind(app_id).bind(dto.user_id).bind(&permission)
    .execute(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: add"); e })?;

    Ok(Json(json!({ "ok": true, "user_id": dto.user_id, "permission": permission })))
}

/// `PATCH /apps/:id/collaborators/:user_id` — change permission (owner only).
pub async fn update(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, target_id)): Path<(Uuid, Uuid)>,
    Json(dto): Json<UpdateCollaboratorDto>,
) -> Result<Json<Value>> {
    if !is_owner(&state, app_id, user.id).await? {
        return Err(AppError::Forbidden);
    }
    if !PERMISSIONS.contains(&dto.permission.as_str()) {
        return Err(AppError::Validation(format!("Permission invalide : {}", dto.permission)));
    }
    let rows = sqlx::query(
        "UPDATE app.app_collaborators SET permission = $3 WHERE app_id = $1 AND user_id = $2",
    )
    .bind(app_id).bind(target_id).bind(&dto.permission)
    .execute(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: update"); e })?
    .rows_affected();
    if rows == 0 {
        return Err(AppError::NotFound("Collaborateur introuvable".into()));
    }
    Ok(Json(json!({ "ok": true })))
}

/// `DELETE /apps/:id/collaborators/:user_id` — remove a collaborator.
/// Allowed to the owner, or to the collaborator themselves (leave the share).
pub async fn remove(
    State(state): State<AppState>,
    user: AppUserExt,
    Path((app_id, target_id)): Path<(Uuid, Uuid)>,
) -> Result<Json<Value>> {
    if target_id != user.id && !is_owner(&state, app_id, user.id).await? {
        return Err(AppError::Forbidden);
    }
    sqlx::query(
        "DELETE FROM app.app_collaborators WHERE app_id = $1 AND user_id = $2",
    )
    .bind(app_id).bind(target_id)
    .execute(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collaborators: remove"); e })?;
    Ok(Json(json!({ "ok": true })))
}

//! User-to-user sharing of applications.
//!
//! An owner can grant access (`view`/`comment`/`edit`) to other Kubuno users, who
//! can then open and co-edit the app in real time (the collab room ACL admits them).
//! Here we manage the collaborator list and search recipients (`core.users`).
//!
//! Reservation: the recipient search and the collaborator listing read/join
//! `core.users`, a foreign namespace. That cross-schema access resolves on
//! PostgreSQL (and MySQL on the same server) but not on an ATTACHed SQLite file;
//! it is the account-directory boundary, not something the portable recipe
//! covers, and those queries keep their PostgreSQL spelling (`::text`, `ILIKE`,
//! `NULLS LAST`). The app's own tables (`app.*`) are fully portable.

use axum::{
    extract::{Path, Query, State},
    Json,
};
use kubuno_db::dialect::Assign;
use kubuno_db::params;
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
    let n = state
        .db
        .fetch_scalar::<i64>(
            "SELECT COUNT(*) FROM app.apps WHERE id = $1 AND owner_id = $2",
            params![app_id, user_id],
        )
        .await
        .map_err(|e| { tracing::error!(error = %e, "collaborators: is_owner"); e })?;
    Ok(n > 0)
}

/// `GET /recipients?q=` — search users to share with.
///
/// NOTE: reads `core.users` (PostgreSQL / MySQL only).
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
    let hits = state
        .db
        .fetch_all_as::<RecipientHit>(
            "SELECT id, display_name, email::text AS email, avatar_url \
             FROM core.users \
             WHERE is_active = TRUE \
               AND id <> $1 \
               AND (email::text ILIKE $2 OR username ILIKE $3 OR display_name ILIKE $4) \
             ORDER BY display_name NULLS LAST, email \
             LIMIT 20",
            params![user.id, &pattern, &pattern, &pattern],
        )
        .await
        .map_err(|e| { tracing::error!(error = %e, "collaborators: search"); e })?;
    Ok(Json(json!({ "recipients": hits })))
}

/// `GET /apps/:id/collaborators` — list collaborators (owner or collaborator).
///
/// NOTE: joins `core.users` (PostgreSQL / MySQL only).
pub async fn list(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(app_id): Path<Uuid>,
) -> Result<Json<Value>> {
    // Owner OR collaborator. Two counts (no reused placeholders under SqlSafeStr).
    let has_access = state
        .db
        .fetch_scalar::<i64>(
            "SELECT \
                 (SELECT COUNT(*) FROM app.apps WHERE id = $1 AND owner_id = $2) \
               + (SELECT COUNT(*) FROM app.app_collaborators WHERE app_id = $3 AND user_id = $4)",
            params![app_id, user.id, app_id, user.id],
        )
        .await
        .map_err(|e| { tracing::error!(error = %e, "collaborators: access"); e })?
        > 0;
    if !has_access {
        return Err(AppError::NotFound(format!("Application {app_id}")));
    }

    let owner = state
        .db
        .fetch_optional_as::<RecipientHit>(
            "SELECT u.id, u.display_name, u.email::text AS email, u.avatar_url \
             FROM app.apps a JOIN core.users u ON u.id = a.owner_id \
             WHERE a.id = $1",
            params![app_id],
        )
        .await
        .map_err(|e| { tracing::error!(error = %e, "collaborators: owner"); e })?;

    let collaborators = state
        .db
        .fetch_all_as::<Collaborator>(
            "SELECT c.user_id, c.permission, \
                    u.display_name, u.email::text AS email, u.avatar_url \
             FROM app.app_collaborators c \
             JOIN core.users u ON u.id = c.user_id \
             WHERE c.app_id = $1 \
             ORDER BY u.display_name NULLS LAST, u.email",
            params![app_id],
        )
        .await
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
    // NOTE: reads core.users (PostgreSQL / MySQL only).
    let exists = state
        .db
        .fetch_scalar::<i64>(
            "SELECT COUNT(*) FROM core.users WHERE id = $1 AND is_active = TRUE",
            params![dto.user_id],
        )
        .await
        .map_err(|e| { tracing::error!(error = %e, "collaborators: user check"); e })?
        > 0;
    if !exists {
        return Err(AppError::NotFound("Utilisateur introuvable".into()));
    }

    let upsert = state.db.backend().upsert(
        "app.app_collaborators",
        &["app_id", "user_id"],
        &[Assign::Incoming("permission")],
    );
    state
        .db
        .execute(
            &format!(
                "INSERT INTO app.app_collaborators (app_id, user_id, permission) VALUES ($1, $2, $3){upsert}"
            ),
            params![app_id, dto.user_id, &permission],
        )
        .await
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
    let rows = state
        .db
        .execute(
            "UPDATE app.app_collaborators SET permission = $1 WHERE app_id = $2 AND user_id = $3",
            params![&dto.permission, app_id, target_id],
        )
        .await
        .map_err(|e| { tracing::error!(error = %e, "collaborators: update"); e })?;
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
    state
        .db
        .execute(
            "DELETE FROM app.app_collaborators WHERE app_id = $1 AND user_id = $2",
            params![app_id, target_id],
        )
        .await
        .map_err(|e| { tracing::error!(error = %e, "collaborators: remove"); e })?;
    Ok(Json(json!({ "ok": true })))
}

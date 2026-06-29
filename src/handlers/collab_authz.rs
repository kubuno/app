//! Authorization for real-time collaboration rooms (called by the CORE).
//!
//! The core's collab service is generic and has no knowledge of business ACLs.
//! Before admitting a user into a room `app:<uuid>` (or `app-<type>:<uuid>`), it
//! queries this internal endpoint (`POST /internal/collab/authorize`, protected by
//! `X-Internal-Secret`). We answer 200 (allowed), 403 (denied) or 401 (bad secret).
//! The core only denies access on an explicit 403 (fail-open otherwise).

use axum::{extract::State, http::HeaderMap, Json};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::{AppError, Result},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct AuthorizeDto {
    pub room:    String,
    pub user_id: Uuid,
}

/// Verifies a user's access to the application identified by a collab room.
/// `room` = `app:<uuid>` or `app-<type>:<uuid>`.
pub async fn authorize(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(dto): Json<AuthorizeDto>,
) -> Result<Json<Value>> {
    // 1) Internal secret required (otherwise the core falls back to fail-open + warn).
    let secret = headers.get("x-internal-secret").and_then(|v| v.to_str().ok()).unwrap_or("");
    let expected = state.settings.core.internal_secret.as_str();
    if expected.is_empty() || secret != expected {
        return Err(AppError::Unauthorized);
    }

    // 2) Parse `app:<uuid>` or `app-<type>:<uuid>` → the application's uuid. The short
    //    form leaves only the uuid after stripping the `app:` prefix.
    let rest = dto.room.strip_prefix("app-").or_else(|| dto.room.strip_prefix("app:"))
        .unwrap_or(&dto.room);
    let id_str = rest.split_once(':').map(|(_ty, id)| id).unwrap_or(rest);
    let app_id = Uuid::parse_str(id_str)
        .map_err(|_| AppError::Validation(format!("invalid uuid in room: {}", dto.room)))?;

    // 3) ACL: the owner OR a shared collaborator may join the room. No is_trashed
    //    filter — owners can still open/edit a trashed app's builder.
    let allowed = sqlx::query_scalar::<_, bool>(
        r#"SELECT EXISTS(
               SELECT 1 FROM app.apps WHERE id = $1 AND owner_id = $2
               UNION
               SELECT 1 FROM app.app_collaborators WHERE app_id = $1 AND user_id = $2
           )"#,
    )
    .bind(app_id).bind(dto.user_id)
    .fetch_one(&state.db).await
    .map_err(|e| { tracing::error!(error = %e, "collab authorize: ACL query"); e })?;

    if allowed { Ok(Json(json!({ "ok": true }))) } else { Err(AppError::Forbidden) }
}

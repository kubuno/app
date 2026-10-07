//! Modèles de pages réutilisables — une page conçue dans un projet peut être
//! enregistrée comme modèle (par utilisateur) puis réinsérée dans d'autres
//! projets. La définition stocke l'arbre `Page` complet (JSON).

use axum::{
    extract::{Path, State},
    Json,
};
use chrono::{DateTime, Utc};
use kubuno_db::params;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

use crate::{
    errors::{AppError, Result},
    middleware::AppUserExt,
    state::AppState,
};

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PageTemplate {
    pub id:         Uuid,
    pub name:       String,
    pub theme:      String,
    pub definition: Value,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreatePageTemplateDto {
    pub name:       String,
    #[serde(default)]
    pub theme:      Option<String>,
    pub definition: Value,
}

/// GET /page-templates — modèles de l'utilisateur (les plus récents d'abord).
pub async fn list(State(state): State<AppState>, user: AppUserExt) -> Result<Json<Vec<PageTemplate>>> {
    let rows = state
        .db
        .fetch_all_as::<PageTemplate>(
            "SELECT id, name, theme, definition, created_at FROM app.page_templates \
             WHERE owner_id = $1 ORDER BY created_at DESC",
            params![user.id],
        )
        .await?;
    Ok(Json(rows))
}

/// POST /page-templates — enregistre la page courante comme modèle réutilisable.
pub async fn create(
    State(state): State<AppState>,
    user: AppUserExt,
    Json(dto): Json<CreatePageTemplateDto>,
) -> Result<Json<PageTemplate>> {
    let name = dto.name.trim();
    if name.is_empty() {
        return Err(AppError::Validation("Le nom du modèle est requis".into()));
    }
    let theme = dto.theme.unwrap_or_else(|| "Mes modèles".into());
    // No RETURNING (MySQL has none): mint the id in Rust and reselect.
    let id = kubuno_db::new_id();
    let now = chrono::Utc::now();
    state
        .db
        .execute(
            "INSERT INTO app.page_templates (id, owner_id, name, theme, definition, created_at) \
             VALUES ($1, $2, $3, $4, $5, $6)",
            params![id, user.id, name, &theme, dto.definition, now],
        )
        .await?;
    let tpl = state
        .db
        .fetch_one_as::<PageTemplate>(
            "SELECT id, name, theme, definition, created_at FROM app.page_templates WHERE id = $1",
            params![id],
        )
        .await?;
    Ok(Json(tpl))
}

/// DELETE /page-templates/:id
pub async fn delete(
    State(state): State<AppState>,
    user: AppUserExt,
    Path(id): Path<Uuid>,
) -> Result<Json<Value>> {
    let affected = state
        .db
        .execute(
            "DELETE FROM app.page_templates WHERE id = $1 AND owner_id = $2",
            params![id, user.id],
        )
        .await?;
    if affected == 0 {
        return Err(AppError::NotFound("Modèle introuvable".into()));
    }
    Ok(Json(json!({ "deleted": true })))
}

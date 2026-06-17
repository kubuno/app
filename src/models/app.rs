use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

/// Ligne de la table `app.apps` — métadonnée d'une application no-code.
/// La définition complète (pages/données/workflows) vit dans un fichier `.kbapp`.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Application {
    pub id:           Uuid,
    pub owner_id:     Uuid,
    pub name:         String,
    pub description:  Option<String>,
    // Peuplée après le SELECT depuis le fichier .kbapp.
    #[sqlx(default)]
    pub definition:   Value,
    pub file_id:      Option<Uuid>,
    /// slug d'URL publique (unique par propriétaire) — runtime publié.
    pub slug:         String,
    pub is_published: bool,
    pub tags:         Vec<String>,
    pub is_trashed:   bool,
    pub created_at:   DateTime<Utc>,
    pub updated_at:   DateTime<Utc>,
}

#[derive(Debug, Deserialize, validator::Validate)]
pub struct CreateAppDto {
    #[validate(length(min = 1, max = 255))]
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub definition: Option<Value>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    /// Modèle de départ optionnel (ex: "crm", "todo") — préchargé côté frontend.
    #[serde(default)]
    pub template: Option<String>,
}

#[derive(Debug, Deserialize, validator::Validate)]
pub struct UpdateAppDto {
    #[serde(default)]
    #[validate(length(min = 1, max = 255))]
    pub name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub definition: Option<Value>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub is_published: Option<bool>,
}

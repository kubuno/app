use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::FromRow;
use uuid::Uuid;

/// Un enregistrement dynamique (« Thing » façon Bubble) : une instance d'un type
/// de données défini par l'utilisateur. Stocké génériquement dans `app.records`,
/// le contenu réel vivant dans la colonne JSONB `data`.
#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Record {
    pub id:         Uuid,
    pub app_id:     Uuid,
    pub owner_id:   Uuid,
    /// Nom du type de données (table logique), ex: "Tâche", "Client".
    pub type_name:  String,
    /// Utilisateur ayant créé l'enregistrement (« Created By » de Bubble).
    pub created_by: Option<Uuid>,
    pub data:       Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Record {
    /// Sérialisation « plate » exposée au runtime : les champs métier de `data`
    /// fusionnés avec les champs système (_id, _created_at…).
    pub fn flatten(&self) -> Value {
        let mut obj = match &self.data {
            Value::Object(m) => m.clone(),
            _ => serde_json::Map::new(),
        };
        obj.insert("_id".into(), Value::String(self.id.to_string()));
        obj.insert("_type".into(), Value::String(self.type_name.clone()));
        obj.insert("_created_at".into(), Value::String(self.created_at.to_rfc3339()));
        obj.insert("_updated_at".into(), Value::String(self.updated_at.to_rfc3339()));
        if let Some(by) = self.created_by {
            obj.insert("_created_by".into(), Value::String(by.to_string()));
        }
        Value::Object(obj)
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateRecordDto {
    pub data: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRecordDto {
    pub data: Value,
}

/// Une contrainte de recherche façon Bubble : `field operator value`.
#[derive(Debug, Clone, Deserialize)]
pub struct Constraint {
    pub field: String,
    /// equals, not_equals, greater_than, less_than, contains, in, is_empty, is_not_empty
    pub op:    String,
    #[serde(default)]
    pub value: Value,
}

#[derive(Debug, Deserialize, Default)]
pub struct SearchQuery {
    #[serde(default)]
    pub constraints: Vec<Constraint>,
    #[serde(default)]
    pub sort_field:  Option<String>,
    #[serde(default)]
    pub sort_desc:   bool,
    #[serde(default)]
    pub search_text: Option<String>,
    #[serde(default)]
    pub limit:       Option<i64>,
    #[serde(default)]
    pub offset:      Option<i64>,
}

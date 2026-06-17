//! Stockage du CONTENU des applications no-code dans le module `files`/`drive`.
//!
//! Format Kubuno propre au module App — MIME `application/vnd.kubuno.app+json`,
//! extension `.kbapp`, JSON gzippé. La base ne garde que la référence `file_id`
//! + la métadonnée (nom, statut de publication, compteurs…).
//!
//! Les applications vivent dans le dossier **protégé** `App/` (non supprimable).

use bytes::Bytes;
use serde_json::{json, Value};
use std::io::{Read as _, Write as _};
use uuid::Uuid;

use crate::{errors::AppError, state::AppState};

pub const APP_MIME: &str = "application/vnd.kubuno.app+json";

// ── Compression (gzip) ──────────────────────────────────────────────────────

fn gzip(raw: &[u8]) -> Result<Vec<u8>, AppError> {
    let mut enc = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
    enc.write_all(raw).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    enc.finish().map_err(|e| AppError::Internal(anyhow::anyhow!(e)))
}

fn gunzip(raw: &[u8]) -> Result<Vec<u8>, AppError> {
    if raw.len() >= 2 && raw[0] == 0x1f && raw[1] == 0x8b {
        let mut dec = flate2::read::GzDecoder::new(raw);
        let mut out = Vec::new();
        dec.read_to_end(&mut out).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
        Ok(out)
    } else {
        Ok(raw.to_vec())
    }
}

// ── Définition de l'application ─────────────────────────────────────────────
// La définition complète : pages, éléments, types de données, workflows, styles,
// thème et réglages. Interprétée intégralement côté frontend (builder + runtime).

pub fn empty_definition() -> Value {
    json!({
        "pages":      [ default_page() ],
        "dataTypes":  [],
        "workflows":  [],
        "styles":     [],
        "theme":      default_theme(),
        "settings":   { "startPage": "index", "title": "Mon application", "kind": "web" }
    })
}

fn default_page() -> Value {
    json!({
        "id":    "index",
        "name":  "Accueil",
        "route": "index",
        "root":  {
            "id":       "root",
            "type":     "page",
            "name":     "Page",
            "children": [],
            "props":    {},
            "style":    { "background": "#ffffff", "minHeight": "100%", "padding": "24px" },
            "layout":   { "type": "column", "gap": "16px", "align": "stretch" }
        }
    })
}

fn default_theme() -> Value {
    json!({
        "primary":    "#2563eb",
        "accent":     "#7c3aed",
        "background": "#f8fafc",
        "surface":    "#ffffff",
        "text":       "#0f172a",
        "radius":     "8px",
        "font":       "Inter, system-ui, sans-serif"
    })
}

pub fn definition_content_from(definition: Value) -> Value {
    json!({ "version": 1, "definition": definition })
}

pub fn extract_definition(content: &Value) -> Value {
    content.get("definition").cloned().unwrap_or_else(empty_definition)
}

fn kb_file_name(title: &str) -> String {
    let base = std::path::Path::new(title).file_stem().and_then(|s| s.to_str()).unwrap_or(title);
    let base = if base.trim().is_empty() { "Sans titre" } else { base.trim() };
    format!("{base}.kbapp")
}

/// Crée le fichier de contenu d'une application dans le dossier protégé `App/`.
pub async fn create_app_file(
    state: &AppState, user_id: Uuid, title: &str, definition: Value,
) -> Result<Uuid, AppError> {
    // protect = true → le dossier App/ ne peut pas être supprimé par l'utilisateur.
    let folder = state.files_client.ensure_folder_path(user_id, "App", true, Some("AppWindow")).await
        .map_err(AppError::Internal)?;
    let content = definition_content_from(definition);
    let raw = serde_json::to_vec(&content).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let gz  = gzip(&raw)?;
    let file = state.files_client.create_file_with_content(
        user_id, Some(folder.id), &kb_file_name(title), APP_MIME, Bytes::from(gz),
        Some(json!({ "module": "app", "subtype": "application" })), false,
    ).await.map_err(AppError::Internal)?;
    Ok(file.id)
}

pub fn parse_definition_bytes(raw: &[u8]) -> Result<Value, AppError> {
    let json = gunzip(raw)?;
    let content = serde_json::from_slice::<Value>(&json)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("définition illisible: {e}")))?;
    Ok(extract_definition(&content))
}

pub async fn read_definition(state: &AppState, user_id: Uuid, file_id: Uuid) -> Result<Value, AppError> {
    let (_info, raw) = state.files_client.get_file_content(user_id, file_id).await
        .map_err(AppError::Internal)?;
    parse_definition_bytes(&raw)
}

pub async fn write_definition(state: &AppState, user_id: Uuid, file_id: Uuid, definition: Value) -> Result<(), AppError> {
    let content = definition_content_from(definition);
    let raw = serde_json::to_vec(&content).map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?;
    let gz  = gzip(&raw)?;
    state.files_client.update_file_content(user_id, file_id, Bytes::from(gz)).await
        .map_err(AppError::Internal).map(|_| ())
}

// ── Noms de fichiers : DÉLÉGUÉS à la face client du module `files` ────────────
pub fn strip_ext(name: &str) -> String { crate::files_client::strip_ext(name) }

pub async fn file_name(state: &AppState, owner_id: Uuid, file_id: Uuid) -> Option<String> {
    state.files_client.get_file_meta(owner_id, file_id).await.ok().map(|i| i.name)
}

pub async fn rename_content_file(state: &AppState, owner_id: Uuid, file_id: Uuid, title: &str, ext: &str) {
    crate::files_client::set_title(&state.files_client, owner_id, file_id, title, ext).await
}

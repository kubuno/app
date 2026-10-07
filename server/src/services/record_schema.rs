//! Validation of record data against the data types an application declares.
//!
//! An application's `.kbapp` definition declares its data types (`dataTypes`):
//! a name, and fields with a name and a type (`text`, `longtext`, `number`,
//! `boolean`, `date`, `option` with its allowed values). The anonymous visitor of
//! a published app and the signed-in users of a shared app write records through
//! the API directly, so what they send is checked against that declaration
//! before it is stored: the type must be declared, every key must be a declared
//! field, and every value must fit its field's type and size.

use serde_json::Value;

/// Largest serialized `data` object one write may carry.
pub const MAX_RECORD_BYTES: usize = 256 * 1024;
/// Longest value of a `text` field, in characters.
pub const MAX_TEXT_CHARS: usize = 10_000;
/// Longest value of a `longtext` field, in characters.
pub const MAX_LONGTEXT_CHARS: usize = 100_000;
/// Longest value of a `date` field, in characters (an ISO 8601 date-time).
const MAX_DATE_CHARS: usize = 64;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FieldKind {
    Text,
    LongText,
    Number,
    Boolean,
    Date,
    Choice(Vec<String>),
    /// A type this server version does not know (a newer builder): any scalar
    /// within the text size limit.
    Other,
}

#[derive(Debug, Clone)]
pub struct DeclaredField {
    pub name: String,
    pub kind: FieldKind,
}

#[derive(Debug, Clone)]
pub struct DeclaredType {
    pub name:   String,
    pub fields: Vec<DeclaredField>,
}

/// The data type named `name` in an app definition, if it declares one.
pub fn declared_type(definition: &Value, name: &str) -> Option<DeclaredType> {
    let t = definition
        .get("dataTypes")?
        .as_array()?
        .iter()
        .find(|t| t.get("name").and_then(Value::as_str) == Some(name))?;
    let fields = t
        .get("fields")
        .and_then(Value::as_array)
        .map(|fields| {
            fields
                .iter()
                .filter_map(|f| {
                    let name = f.get("name").and_then(Value::as_str)?.to_string();
                    let kind = match f.get("type").and_then(Value::as_str).unwrap_or("") {
                        "text" => FieldKind::Text,
                        "longtext" => FieldKind::LongText,
                        "number" => FieldKind::Number,
                        "boolean" => FieldKind::Boolean,
                        "date" => FieldKind::Date,
                        "option" => FieldKind::Choice(
                            f.get("options")
                                .and_then(Value::as_array)
                                .map(|o| o.iter().filter_map(Value::as_str).map(String::from).collect())
                                .unwrap_or_default(),
                        ),
                        _ => FieldKind::Other,
                    };
                    Some(DeclaredField { name, kind })
                })
                .collect()
        })
        .unwrap_or_default();
    Some(DeclaredType { name: name.to_string(), fields })
}

impl DeclaredType {
    /// Checks `data` (a whole record on creation, the changed fields on update).
    /// The message names the offending field, never the stored data.
    pub fn validate(&self, data: &Value) -> Result<(), String> {
        let obj = data.as_object().ok_or_else(|| "Les données doivent être un objet".to_string())?;
        let size = serde_json::to_vec(data).map(|v| v.len()).unwrap_or(usize::MAX);
        if size > MAX_RECORD_BYTES {
            return Err("Enregistrement trop volumineux".to_string());
        }
        for (key, value) in obj {
            let field = self
                .fields
                .iter()
                .find(|f| &f.name == key)
                .ok_or_else(|| format!("Champ inconnu : {}", truncate(key)))?;
            if !value_fits(&field.kind, value) {
                return Err(format!("Valeur invalide pour le champ « {} »", truncate(key)));
            }
        }
        Ok(())
    }
}

fn truncate(s: &str) -> String {
    s.chars().take(64).collect()
}

/// `null` clears a field and is always accepted. The runtime resolves bound
/// expressions to strings, so a number, a boolean or a date may arrive as text.
fn value_fits(kind: &FieldKind, value: &Value) -> bool {
    if value.is_null() {
        return true;
    }
    match kind {
        FieldKind::Text | FieldKind::Other => scalar_within(value, MAX_TEXT_CHARS),
        FieldKind::LongText => scalar_within(value, MAX_LONGTEXT_CHARS),
        FieldKind::Number => match value {
            Value::Number(_) => true,
            Value::String(s) => s.len() <= 64 && s.trim().parse::<f64>().is_ok_and(f64::is_finite),
            _ => false,
        },
        FieldKind::Boolean => match value {
            Value::Bool(_) => true,
            Value::String(s) => matches!(
                s.trim().to_ascii_lowercase().as_str(),
                "true" | "false" | "1" | "0" | "yes" | "no" | "oui" | "non"
            ),
            Value::Number(n) => n.as_i64().is_some_and(|n| n == 0 || n == 1),
            _ => false,
        },
        FieldKind::Date => match value {
            Value::String(s) => s.chars().count() <= MAX_DATE_CHARS && is_date(s.trim()),
            _ => false,
        },
        FieldKind::Choice(options) => match value {
            Value::String(s) => {
                (options.is_empty() && s.chars().count() <= MAX_TEXT_CHARS) || options.iter().any(|o| o == s)
            }
            _ => false,
        },
    }
}

fn scalar_within(value: &Value, max_chars: usize) -> bool {
    match value {
        Value::String(s) => s.chars().count() <= max_chars,
        Value::Number(_) | Value::Bool(_) => true,
        _ => false,
    }
}

/// An ISO 8601 date (`2026-10-04`), date-time with offset (RFC 3339) or local
/// date-time (`2026-10-04T09:30`, `2026-10-04T09:30:00`).
fn is_date(s: &str) -> bool {
    chrono::NaiveDate::parse_from_str(s, "%Y-%m-%d").is_ok()
        || chrono::DateTime::parse_from_rfc3339(s).is_ok()
        || chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M").is_ok()
        || chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S%.f").is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn definition() -> Value {
        json!({ "dataTypes": [
            { "id": "t1", "name": "Message", "fields": [
                { "id": "f1", "name": "texte", "type": "text" },
                { "id": "f2", "name": "corps", "type": "longtext" },
                { "id": "f3", "name": "note", "type": "number" },
                { "id": "f4", "name": "lu", "type": "boolean" },
                { "id": "f5", "name": "quand", "type": "date" },
                { "id": "f6", "name": "statut", "type": "option", "options": ["ouvert", "clos"] }
            ]},
            { "id": "t2", "name": "Secret", "fields": [] }
        ]})
    }

    fn message() -> DeclaredType {
        declared_type(&definition(), "Message").expect("declared")
    }

    #[test]
    fn only_declared_types_are_found() {
        assert!(declared_type(&definition(), "Message").is_some());
        assert!(declared_type(&definition(), "Nope").is_none());
        assert!(declared_type(&json!({}), "Message").is_none());
    }

    #[test]
    fn a_well_typed_record_passes() {
        let ok = json!({
            "texte": "bonjour", "corps": "x", "note": 4.5, "lu": true,
            "quand": "2026-10-04", "statut": "clos"
        });
        assert!(message().validate(&ok).is_ok());
        // What the runtime sends for bound inputs: strings.
        let strings = json!({ "note": "42", "lu": "true", "quand": "2026-10-04T09:30" });
        assert!(message().validate(&strings).is_ok());
        assert!(message().validate(&json!({ "texte": null })).is_ok());
        assert!(message().validate(&json!({})).is_ok());
    }

    #[test]
    fn undeclared_or_mistyped_values_are_refused() {
        let t = message();
        for bad in [
            json!([1, 2]),
            json!("text"),
            json!({ "inconnu": "x" }),
            json!({ "_owner_id": "x" }),
            json!({ "note": "douze" }),
            json!({ "note": { "a": 1 } }),
            json!({ "lu": "peut-être" }),
            json!({ "quand": "demain" }),
            json!({ "statut": "supprimé" }),
            json!({ "texte": { "nested": true } }),
            json!({ "texte": ["a"] }),
            json!({ "texte": "x".repeat(MAX_TEXT_CHARS + 1) }),
        ] {
            assert!(t.validate(&bad).is_err(), "{bad}");
        }
        assert!(t.validate(&json!({ "corps": "x".repeat(MAX_TEXT_CHARS + 1) })).is_ok());
        assert!(t.validate(&json!({ "corps": "x".repeat(MAX_RECORD_BYTES) })).is_err());
    }
}

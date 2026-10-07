//! Instance-wide settings of the app module, as the administrator left them in
//! the console.
//!
//! Declared by `module.toml`'s `[[settings]]`, stored in `core.settings`, and read
//! back here through `/internal/modules/app/settings` — a module owns its own
//! schema and cannot read the core's tables, and a background worker has no user
//! token for the public config route. The module is named in the URL so the read
//! works whether the instance shares one master secret or a derived one per
//! module.
//!
//! Every field here is read by code that acts on it: a knob that changes nothing
//! is worse than an absent one.

use serde_json::Value;

#[derive(Debug, Clone, Copy)]
pub struct InstanceConfig {
    /// Whether owners may publish an app to the AUTH-LESS `/public/apps/:slug`
    /// route at all. When `false`, the publish handler refuses to flip a NEW app
    /// to `is_published = TRUE`; already-published apps keep being served.
    pub allow_public_publishing: bool,
    /// Ceiling on how many (non-trashed) apps a single user may own. `0` =
    /// unlimited. Enforced at creation and duplication time.
    pub max_apps_per_user: i32,
    /// When `true`, a published app is no longer reachable without an account:
    /// the auth-less `/public/apps/:slug` routes refuse anonymous visitors, and
    /// the app must be opened by a signed-in user.
    pub require_signin_for_published_apps: bool,
    /// Whether an ANONYMOUS visitor of a published app may create, modify or
    /// delete records. Reading is unaffected. `false` makes a published app
    /// read-only to the outside world.
    pub allow_public_data_writes: bool,
    /// Ceiling on how many records one application may hold, all data types
    /// together. `0` = unlimited. Enforced on every creation path.
    pub max_records_per_app: i32,
    /// Ceiling, in kibibytes, on the serialised `.kbapp` definition an app may
    /// store. `0` = unlimited.
    pub max_definition_size_kb: i32,
}

impl Default for InstanceConfig {
    fn default() -> Self {
        Self {
            allow_public_publishing: true,
            max_apps_per_user:       0,
            // Defaults preserve the behaviour the module shipped with: a
            // published app stays open, and its data stays writable.
            require_signin_for_published_apps: false,
            allow_public_data_writes:          true,
            max_records_per_app:               0,
            max_definition_size_kb:            0,
        }
    }
}

impl InstanceConfig {
    /// Maps the core's `{key: value}` object onto the struct. Every read falls
    /// back to the compiled default rather than to a permissive value; an
    /// out-of-range number is treated as a mistake and ignored the same way.
    /// `0` is a MEANINGFUL value for `max_apps_per_user` (unlimited), so it is
    /// accepted there rather than floored away.
    pub fn from_settings(settings: &Value) -> Self {
        let d = Self::default();
        let int_in = |key: &str, min: i64, max: i64, fallback: i64| -> i64 {
            settings
                .get(key)
                .and_then(Value::as_i64)
                .filter(|n| (min..=max).contains(n))
                .unwrap_or(fallback)
        };
        let bool_of = |key: &str, fallback: bool| {
            settings.get(key).and_then(Value::as_bool).unwrap_or(fallback)
        };
        Self {
            allow_public_publishing: bool_of("allow_public_publishing", d.allow_public_publishing),
            max_apps_per_user:       int_in("max_apps_per_user", 0, 100_000, d.max_apps_per_user as i64) as i32,
            require_signin_for_published_apps: bool_of(
                "require_signin_for_published_apps", d.require_signin_for_published_apps,
            ),
            allow_public_data_writes: bool_of(
                "allow_public_data_writes", d.allow_public_data_writes,
            ),
            max_records_per_app:    int_in("max_records_per_app", 0, 100_000_000, d.max_records_per_app as i64) as i32,
            max_definition_size_kb: int_in("max_definition_size_kb", 0, 1_048_576, d.max_definition_size_kb as i64) as i32,
        }
    }
}

/// Reads the instance settings from the core. Any failure yields `None`, so the
/// caller keeps the values it already had rather than reverting to defaults
/// because the core was briefly unreachable.
pub async fn fetch(http: &reqwest::Client, core_url: &str, secret: &str) -> Option<InstanceConfig> {
    let url = format!("{core_url}/internal/modules/app/settings");
    let resp = http
        .get(&url)
        .header("X-Internal-Secret", secret)
        .send()
        .await
        .map_err(|e| tracing::warn!(error = %e, "Lecture des réglages d'instance app"))
        .ok()?;

    if !resp.status().is_success() {
        tracing::warn!(status = %resp.status(), "Réglages d'instance app refusés par le core");
        return None;
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| tracing::warn!(error = %e, "Réglages d'instance app : réponse illisible"))
        .ok()?;

    Some(InstanceConfig::from_settings(body.get("settings")?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn missing_keys_keep_the_compiled_defaults() {
        let c = InstanceConfig::from_settings(&json!({}));
        assert!(c.allow_public_publishing);
        assert_eq!(c.max_apps_per_user, 0);
        assert!(!c.require_signin_for_published_apps);
        assert!(c.allow_public_data_writes);
        assert_eq!(c.max_records_per_app, 0);
        assert_eq!(c.max_definition_size_kb, 0);
    }

    #[test]
    fn the_public_access_policies_can_be_tightened() {
        let c = InstanceConfig::from_settings(&json!({
            "require_signin_for_published_apps": true,
            "allow_public_data_writes":          false,
            "max_records_per_app":               5000,
            "max_definition_size_kb":            2048,
        }));
        assert!(c.require_signin_for_published_apps);
        assert!(!c.allow_public_data_writes);
        assert_eq!(c.max_records_per_app, 5000);
        assert_eq!(c.max_definition_size_kb, 2048);
    }

    #[test]
    fn zero_is_meaningful_for_the_quota() {
        let c = InstanceConfig::from_settings(&json!({ "max_apps_per_user": 0 }));
        assert_eq!(c.max_apps_per_user, 0); // unlimited
    }

    #[test]
    fn public_publishing_can_be_turned_off() {
        let c = InstanceConfig::from_settings(&json!({ "allow_public_publishing": false }));
        assert!(!c.allow_public_publishing);
    }

    #[test]
    fn out_of_range_quota_falls_back() {
        let c = InstanceConfig::from_settings(&json!({ "max_apps_per_user": -5 }));
        assert_eq!(c.max_apps_per_user, 0);
    }
}

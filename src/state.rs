use std::sync::{Arc, RwLock};

use sqlx::PgPool;

use crate::config::instance::InstanceConfig;
use crate::config::Settings;
use crate::files_client::FilesClient;

#[derive(Clone)]
pub struct AppState {
    pub db:           PgPool,
    pub settings:     Arc<Settings>,
    pub files_client: Arc<FilesClient>,
    /// Instance settings from the admin console, refreshed in the background so
    /// an edit takes effect without restarting the module. Read through
    /// [`AppState::instance`], never locked directly by callers.
    pub instance:     Arc<RwLock<InstanceConfig>>,
}

impl AppState {
    /// A snapshot of the current instance settings. Falls back to the compiled
    /// defaults if the lock was poisoned by a panicking writer — a lost value
    /// must never take a protection down.
    pub fn instance(&self) -> InstanceConfig {
        self.instance.read().map(|c| *c).unwrap_or_default()
    }
}

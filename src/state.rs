use std::sync::Arc;

use sqlx::PgPool;

use crate::config::Settings;
use crate::files_client::FilesClient;

#[derive(Clone)]
pub struct AppState {
    pub db:           PgPool,
    pub settings:     Arc<Settings>,
    pub files_client: Arc<FilesClient>,
}

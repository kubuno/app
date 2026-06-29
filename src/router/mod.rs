use axum::{
    middleware,
    routing::{get, patch, post, put},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{
    handlers::{apps, collab_authz, collaborators, data, health, page_templates},
    middleware::require_auth,
    state::AppState,
};

pub fn build(state: AppState) -> Router {
    let authed = Router::new()
        // Applications
        .route("/apps", get(apps::list).post(apps::create))
        .route("/apps/open-by-file", post(apps::open_by_file))
        .route("/apps/:id", get(apps::get).put(apps::update).delete(apps::delete))
        .route("/apps/:id/duplicate", post(apps::duplicate))
        .route("/apps/:id/publish", post(apps::publish))
        // Partage utilisateur-à-utilisateur (collaborateurs temps réel)
        .route("/recipients", get(collaborators::search_recipients))
        .route("/apps/:id/collaborators", get(collaborators::list).post(collaborators::add))
        .route("/apps/:id/collaborators/:user_id", patch(collaborators::update).delete(collaborators::remove))
        // Modèles de pages réutilisables (par utilisateur, inter-projets)
        .route("/page-templates", get(page_templates::list).post(page_templates::create))
        .route("/page-templates/:id", axum::routing::delete(page_templates::delete))
        // Moteur de données dynamique (« Things »)
        .route("/apps/:app_id/data/:type", get(data::list).post(data::create))
        .route("/apps/:app_id/data/:type/search", post(data::search))
        .route("/apps/:app_id/data/:type/:rid",
            get(data::get).put(data::update).delete(data::delete))
        // Données PARTAGÉES (multi-utilisateurs, identité réelle) — collaboratif
        .route("/apps/:app_id/shared/:type", get(data::shared_list).post(data::shared_create))
        .route("/apps/:app_id/shared/:type/search", post(data::shared_search))
        .route("/apps/:app_id/shared/:type/:rid",
            put(data::shared_update).delete(data::shared_delete))
        .layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .with_state(state.clone());

    // Accès PUBLIC (apps publiées) — sans authentification, garde `is_published`.
    let public = Router::new()
        .route("/health", get(health::health))
        // Internal: collab room ACL (called by the core; guarded by X-Internal-Secret).
        .route("/internal/collab/authorize", post(collab_authz::authorize))
        .route("/public/apps/:slug", get(apps::get_public))
        .route("/public/apps/:slug/data/:type", get(data::public_list).post(data::public_create))
        .route("/public/apps/:slug/data/:type/search", post(data::public_search))
        .route("/public/apps/:slug/data/:type/:rid", put(data::public_update).delete(data::public_delete))
        .with_state(state);

    Router::new()
        .merge(public)
        .merge(authed)
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
}

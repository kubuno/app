use axum::{
    middleware,
    routing::{get, post, put},
    Router,
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};

use crate::{
    handlers::{apps, data, health},
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
        // Moteur de données dynamique (« Things »)
        .route("/apps/:app_id/data/:type", get(data::list).post(data::create))
        .route("/apps/:app_id/data/:type/search", post(data::search))
        .route("/apps/:app_id/data/:type/:rid",
            get(data::get).put(data::update).delete(data::delete))
        .layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .with_state(state.clone());

    // Accès PUBLIC (apps publiées) — sans authentification, garde `is_published`.
    let public = Router::new()
        .route("/health", get(health::health))
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

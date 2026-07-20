use std::sync::Mutex;

use axum::{
    extract::State,
    http::{HeaderValue, Method},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tower_http::cors::CorsLayer;

const BRIDGE_ADDRESS: &str = "127.0.0.1:43127";

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IliasScan {
    source: String,
    version: u32,
    scanned_at: String,
    page_url: String,
    page_title: String,
    html: String,
}

struct BridgeState {
    latest_scan: Mutex<Option<IliasScan>>,
}

#[derive(Clone)]
struct HttpState {
    app: AppHandle,
}

#[tauri::command]
fn take_latest_ilias_scan(
    state: tauri::State<'_, BridgeState>,
) -> Option<IliasScan> {
    state
        .latest_scan
        .lock()
        .ok()
        .and_then(|mut scan| scan.take())
}

async fn receive_scan(
    State(state): State<HttpState>,
    Json(scan): Json<IliasScan>,
) -> Result<Json<serde_json::Value>, (axum::http::StatusCode, String)> {
    if scan.source != "unihub-ilias-extension" {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Ungültige Quelle.".to_string(),
        ));
    }

    if !scan
        .page_url
        .starts_with("https://ilias3.uni-stuttgart.de/")
    {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Ungültige ILIAS-URL.".to_string(),
        ));
    }

    if scan.html.trim().is_empty() {
        return Err((
            axum::http::StatusCode::BAD_REQUEST,
            "Leeres HTML.".to_string(),
        ));
    }

    {
        let bridge_state = state.app.state::<BridgeState>();
        let mut latest_scan = bridge_state
            .latest_scan
            .lock()
            .map_err(|_| {
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "Bridge-State konnte nicht gesperrt werden.".to_string(),
                )
            })?;

        *latest_scan = Some(scan);
    }

    state
        .app
        .emit("unihub://ilias-scan-ready", ())
        .map_err(|error| {
            (
                axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                error.to_string(),
            )
        })?;

    Ok(Json(serde_json::json!({
        "ok": true
    })))
}

async fn start_local_bridge(app: AppHandle) {
    let cors = CorsLayer::new()
        .allow_origin(HeaderValue::from_static("*"))
        .allow_methods([Method::POST, Method::OPTIONS])
        .allow_headers(tower_http::cors::Any);

    let router = Router::new()
        .route("/api/ilias-scan", post(receive_scan))
        .layer(cors)
        .with_state(HttpState { app });

    let listener = match tokio::net::TcpListener::bind(BRIDGE_ADDRESS).await {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!(
                "UniHub Bridge konnte nicht auf {} starten: {}",
                BRIDGE_ADDRESS, error
            );
            return;
        }
    };

    println!(
        "UniHub ILIAS Bridge hört auf http://{}",
        BRIDGE_ADDRESS
    );

    if let Err(error) = axum::serve(listener, router).await {
        eprintln!("UniHub Bridge wurde beendet: {}", error);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BridgeState {
            latest_scan: Mutex::new(None),
        })
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                start_local_bridge(app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_latest_ilias_scan
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
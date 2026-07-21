use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::Duration,
};

use axum::{
    extract::State,
    http::{HeaderValue, Method, StatusCode},
    routing::post,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use tower_http::cors::CorsLayer;

const BRIDGE_ADDRESS: &str = "127.0.0.1:43127";
const SCAN_TIMEOUT_SECONDS: u64 = 45;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IliasScan {
    source: String,
    version: u32,
    scanned_at: String,
    page_url: String,
    crawl_start_url: Option<String>,
    page_title: String,
    html: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct QueuedIliasScan {
    scan_id: u64,

    #[serde(flatten)]
    scan: IliasScan,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScanCompletion {
    success: bool,
    error_message: Option<String>,
}

struct BridgeState {
    scan_queue: Mutex<VecDeque<QueuedIliasScan>>,
    pending_scans:
        Mutex<HashMap<u64, oneshot::Sender<ScanCompletion>>>,
    next_scan_id: AtomicU64,
}

#[derive(Clone)]
struct HttpState {
    app: AppHandle,
}

#[tauri::command]
fn take_next_ilias_scan(
    state: tauri::State<'_, BridgeState>,
) -> Option<QueuedIliasScan> {
    state
        .scan_queue
        .lock()
        .ok()
        .and_then(|mut queue| queue.pop_front())
}

#[tauri::command]
fn complete_ilias_scan(
    scan_id: u64,
    success: bool,
    error_message: Option<String>,
    state: tauri::State<'_, BridgeState>,
) -> Result<(), String> {
    let sender = state
        .pending_scans
        .lock()
        .map_err(|_| {
            "Pending-Scan-State konnte nicht gesperrt werden."
                .to_string()
        })?
        .remove(&scan_id);

    if let Some(sender) = sender {
        let _ = sender.send(ScanCompletion {
            success,
            error_message,
        });
    }

    Ok(())
}

async fn receive_scan(
    State(state): State<HttpState>,
    Json(scan): Json<IliasScan>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    if scan.source != "unihub-ilias-extension" {
        return Err((
            StatusCode::BAD_REQUEST,
            "Ungültige Quelle.".to_string(),
        ));
    }

    if !scan
        .page_url
        .starts_with("https://ilias3.uni-stuttgart.de/")
    {
        return Err((
            StatusCode::BAD_REQUEST,
            "Ungültige ILIAS-URL.".to_string(),
        ));
    }

    if scan.html.trim().is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            "Leeres HTML.".to_string(),
        ));
    }

    let scan_id = {
        let bridge_state = state.app.state::<BridgeState>();

        bridge_state
            .next_scan_id
            .fetch_add(1, Ordering::Relaxed)
    };

    let queued_scan = QueuedIliasScan {
        scan_id,
        scan,
    };

    let (completion_sender, completion_receiver) =
        oneshot::channel::<ScanCompletion>();

    {
        let bridge_state = state.app.state::<BridgeState>();

        bridge_state
            .scan_queue
            .lock()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Scan-Queue konnte nicht gesperrt werden."
                        .to_string(),
                )
            })?
            .push_back(queued_scan);

        bridge_state
            .pending_scans
            .lock()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Pending-Scan-State konnte nicht gesperrt werden."
                        .to_string(),
                )
            })?
            .insert(scan_id, completion_sender);
    }

    state
        .app
        .emit("unihub://ilias-scan-ready", ())
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                error.to_string(),
            )
        })?;

    let completion = tokio::time::timeout(
        Duration::from_secs(SCAN_TIMEOUT_SECONDS),
        completion_receiver,
    )
    .await
    .map_err(|_| {
        (
            StatusCode::GATEWAY_TIMEOUT,
            "UniHub hat den Scan nicht rechtzeitig verarbeitet."
                .to_string(),
        )
    })?
    .map_err(|_| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "Die Scan-Bestätigung wurde abgebrochen."
                .to_string(),
        )
    })?;

    if !completion.success {
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            completion
                .error_message
                .unwrap_or_else(|| {
                    "Der Scan konnte nicht verarbeitet werden."
                        .to_string()
                }),
        ));
    }

    Ok(Json(serde_json::json!({
        "ok": true,
        "scanId": scan_id
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

    let listener =
        match tokio::net::TcpListener::bind(BRIDGE_ADDRESS)
            .await
        {
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
        eprintln!(
            "UniHub Bridge wurde beendet: {}",
            error
        );
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BridgeState {
            scan_queue: Mutex::new(VecDeque::new()),
            pending_scans: Mutex::new(HashMap::new()),
            next_scan_id: AtomicU64::new(1),
        })
        .plugin(
            tauri_plugin_sql::Builder::new().build(),
        )
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            tauri::async_runtime::spawn(async move {
                start_local_bridge(app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            take_next_ilias_scan,
            complete_ilias_scan
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
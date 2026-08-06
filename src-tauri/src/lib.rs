use std::{
    collections::{HashMap, VecDeque},
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use axum::{
    extract::State,
    http::{HeaderValue, Method, StatusCode},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::oneshot;
use tower_http::cors::CorsLayer;

const BRIDGE_ADDRESS: &str = "127.0.0.1:43127";
const SCAN_TIMEOUT_SECONDS: u64 = 45;

/*
 * Wenn die Browser-Extension den Auftrag in dieser Zeit
 * nicht abholt, gilt er als nicht angenommen (sie schläft
 * oder ist nicht installiert).
 */
const FULL_SYNC_COMMAND_TAKEN_TIMEOUT_SECONDS: u64 = 90;

/*
 * Gesamte Lebensdauer eines Full-Sync-Auftrags. Läuft der
 * Crawl nicht innerhalb dieser Zeit ab, wird er verworfen,
 * damit „Jetzt synchronisieren" nicht hängen bleibt.
 */
const FULL_SYNC_TTL_SECONDS: u64 = 600;

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FullSyncCommand {
    command_id: u64,
    course_urls: Vec<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FullSyncCompletion {
    command_id: u64,
    success: bool,
    error_message: Option<String>,
}

struct BridgeState {
    scan_queue: Mutex<VecDeque<QueuedIliasScan>>,
    pending_scans:
        Mutex<HashMap<u64, oneshot::Sender<ScanCompletion>>>,
    next_scan_id: AtomicU64,

    pending_full_sync: Mutex<Option<FullSyncCommand>>,
    active_full_sync_id: Mutex<Option<u64>>,
    active_full_sync_started_at: Mutex<Option<u64>>,
    next_full_sync_id: AtomicU64,
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

/*
 * Kopiert die SQLite-Datenbank an einen Zeitstempel-benannten Pfad
 * im Download-Ordner (Fallback: App-Datenverzeichnis). Reine
 * Dateikopie, keine Fachlogik.
 */
#[tauri::command]
fn backup_database(app: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;

    let db_path = app_data_dir.join("unihub.db");

    if !db_path.exists() {
        return Err(
            "Es wurde noch keine Datenbank angelegt.".to_string(),
        );
    }

    let target_dir = app
        .path()
        .download_dir()
        .unwrap_or_else(|_| app_data_dir.clone());

    let timestamp = now_seconds();
    let backup_path =
        target_dir.join(format!("unihub-backup-{timestamp}.db"));

    std::fs::copy(&db_path, &backup_path)
        .map_err(|error| error.to_string())?;

    Ok(backup_path.display().to_string())
}

#[tauri::command]
fn start_full_sync(
    course_urls: Vec<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, BridgeState>,
) -> Result<u64, String> {
    if course_urls.is_empty() {
        return Err(
            "Es wurden keine Kurse für die Synchronisierung angegeben."
                .to_string(),
        );
    }

    if course_urls.iter().any(|url| {
        !url.starts_with(
            "https://ilias3.uni-stuttgart.de/",
        )
    }) {
        return Err(
            "Mindestens eine ungültige ILIAS-URL wurde übergeben."
                .to_string(),
        );
    }

    let mut active_id = state
        .active_full_sync_id
        .lock()
        .map_err(|_| {
            "Full-Sync-State konnte nicht gesperrt werden."
                .to_string()
        })?;

    let mut active_started_at = state
        .active_full_sync_started_at
        .lock()
        .map_err(|_| {
            "Full-Sync-State konnte nicht gesperrt werden."
                .to_string()
        })?;

    /*
     * Ein hängengebliebener Auftrag aus einer früheren
     * Sitzung darf „Jetzt synchronisieren" nicht dauerhaft
     * blockieren. Nach Ablauf des TTL wird er verworfen.
     */
    let started_at = now_seconds();

    if active_started_at
        .is_some_and(|created| {
            started_at.saturating_sub(created)
                >= FULL_SYNC_TTL_SECONDS
        })
    {
        *state
            .pending_full_sync
            .lock()
            .map_err(|_| {
                "Full-Sync-State konnte nicht gesperrt werden."
                    .to_string()
            })? = None;

        *active_id = None;
        *active_started_at = None;
    }

    if active_id.is_some() {
        return Err(
            "Eine vollständige Synchronisierung läuft bereits."
                .to_string(),
        );
    }

    let command_id = state
        .next_full_sync_id
        .fetch_add(1, Ordering::Relaxed);

    let command = FullSyncCommand {
        command_id,
        course_urls,
    };

    *state
        .pending_full_sync
        .lock()
        .map_err(|_| {
            "Full-Sync-Auftrag konnte nicht gespeichert werden."
                .to_string()
        })? = Some(command);

    *active_id = Some(command_id);
    *active_started_at = Some(started_at);

    /*
     * Watchdog: Er meldet sich, wenn der Auftrag nie von
     * der Extension abgeholt wird (sie schläft) oder der
     * Crawl nicht abschließt. So bekommt die App sichtbares
     * Feedback statt eines dauerhaft gesperrten Knopfs.
     */
    let watchdog_app = app.clone();

    tauri::async_runtime::spawn(async move {
        let bridge = watchdog_app
            .state::<BridgeState>();

        tokio::time::sleep(Duration::from_secs(
            FULL_SYNC_COMMAND_TAKEN_TIMEOUT_SECONDS,
        ))
        .await;

        let never_taken = {
            let Ok(mut pending) =
                bridge.pending_full_sync.lock()
            else {
                return;
            };

            let Ok(mut active) =
                bridge.active_full_sync_id.lock()
            else {
                return;
            };

            let Ok(mut active_started) =
                bridge
                    .active_full_sync_started_at
                    .lock()
            else {
                return;
            };

            if *active == Some(command_id)
                && pending
                    .as_ref()
                    .map(|item| item.command_id)
                    == Some(command_id)
            {
                *pending = None;
                *active = None;
                *active_started = None;

                true
            } else {
                false
            }
        };

        if never_taken {
            let _ = watchdog_app.emit(
                "unihub://full-sync-failed",
                serde_json::json!({
                    "commandId": command_id,
                    "errorMessage":
                        "Die Browser-Extension hat den Auftrag nicht angenommen. Läuft die UniHub-Erweiterung?"
                }),
            );

            return;
        }

        tokio::time::sleep(Duration::from_secs(
            FULL_SYNC_TTL_SECONDS
                - FULL_SYNC_COMMAND_TAKEN_TIMEOUT_SECONDS,
        ))
        .await;

        let still_active = {
            let Ok(mut active) =
                bridge.active_full_sync_id.lock()
            else {
                return;
            };

            let Ok(mut active_started) =
                bridge
                    .active_full_sync_started_at
                    .lock()
            else {
                return;
            };

            if *active == Some(command_id) {
                *active = None;
                *active_started = None;

                true
            } else {
                false
            }
        };

        if still_active {
            let _ = watchdog_app.emit(
                "unihub://full-sync-failed",
                serde_json::json!({
                    "commandId": command_id,
                    "errorMessage":
                        "Die Synchronisierung wurde nicht abgeschlossen. Bitte erneut versuchen."
                }),
            );
        }
    });

    Ok(command_id)
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

/*
 * Reiner Erreichbarkeits-Check für die UI: läuft die Bridge, wie
 * viele Scans warten in der Queue, ist gerade ein Full-Sync aktiv.
 * Keine Fachlogik, nur ein Blick auf den vorhandenen BridgeState.
 */
async fn health_check(
    State(state): State<HttpState>,
) -> Json<serde_json::Value> {
    let bridge_state = state.app.state::<BridgeState>();

    let queued_scans = bridge_state
        .scan_queue
        .lock()
        .map(|queue| queue.len())
        .unwrap_or(0);

    let full_sync_active = bridge_state
        .active_full_sync_id
        .lock()
        .map(|id| id.is_some())
        .unwrap_or(false);

    Json(serde_json::json!({
        "ok": true,
        "queuedScans": queued_scans,
        "fullSyncActive": full_sync_active
    }))
}

async fn take_full_sync_command(
    State(state): State<HttpState>,
) -> Result<
    Json<serde_json::Value>,
    (StatusCode, String),
> {
    let bridge_state =
        state.app.state::<BridgeState>();

    let command = bridge_state
        .pending_full_sync
        .lock()
        .map_err(|_| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "Full-Sync-Auftrag konnte nicht gelesen werden."
                    .to_string(),
            )
        })?
        .take();

    Ok(Json(serde_json::json!({
        "command": command
    })))
}

async fn complete_full_sync(
    State(state): State<HttpState>,
    Json(completion): Json<FullSyncCompletion>,
) -> Result<
    Json<serde_json::Value>,
    (StatusCode, String),
> {
    let bridge_state =
        state.app.state::<BridgeState>();

    {
        let mut active_id = bridge_state
            .active_full_sync_id
            .lock()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Full-Sync-State konnte nicht gesperrt werden."
                        .to_string(),
                )
            })?;

        if *active_id != Some(completion.command_id) {
            return Err((
                StatusCode::BAD_REQUEST,
                "Unbekannter Full-Sync-Auftrag."
                    .to_string(),
            ));
        }

        *active_id = None;

        let mut active_started_at = bridge_state
            .active_full_sync_started_at
            .lock()
            .map_err(|_| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Full-Sync-State konnte nicht gesperrt werden."
                        .to_string(),
                )
            })?;

        *active_started_at = None;
    }

    let event_name = if completion.success {
        "unihub://full-sync-completed"
    } else {
        "unihub://full-sync-failed"
    };

    state
        .app
        .emit(
            event_name,
            serde_json::json!({
                "commandId": completion.command_id,
                "errorMessage": completion.error_message
            }),
        )
        .map_err(|error| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
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
        .allow_methods([
    Method::GET,
    Method::POST,
    Method::OPTIONS,
])
        .allow_headers(tower_http::cors::Any);

    let router = Router::new()
    .route(
        "/api/health",
        get(health_check),
    )
    .route(
        "/api/ilias-scan",
        post(receive_scan),
    )
    .route(
        "/api/full-sync/next",
        get(take_full_sync_command),
    )
    .route(
        "/api/full-sync/complete",
        post(complete_full_sync),
    )
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

    pending_full_sync: Mutex::new(None),
    active_full_sync_id: Mutex::new(None),
    active_full_sync_started_at: Mutex::new(None),
    next_full_sync_id: AtomicU64::new(1),
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
            complete_ilias_scan,
            start_full_sync,
            backup_database
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
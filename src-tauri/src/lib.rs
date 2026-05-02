mod chat;
mod notion;
mod workout;

use std::time::Duration;

use reqwest::StatusCode;
use serde::Serialize;
use serde_json::json;
use tauri::{AppHandle, Manager};

const PET_WINDOW_LABEL: &str = "pet";
const WIZARD_WINDOW_LABEL: &str = "wizard";

#[derive(Serialize)]
struct HttpStatusResult {
    status: u16,
}

#[tauri::command]
fn set_ignore_cursor_events(window: tauri::Window, ignore: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(ignore)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn first_run_complete(app: AppHandle) -> Result<(), String> {
    let setup_completed =
        notion::config_get_value_internal(&app, "setup_completed")?.unwrap_or_default();

    if setup_completed != "1" {
        return Err("setup_completed is not set".into());
    }

    if let Some(wizard) = app.get_webview_window(WIZARD_WINDOW_LABEL) {
        let _ = wizard.hide();
    }

    if let Some(pet) = app.get_webview_window(PET_WINDOW_LABEL) {
        let _ = pet.show();
        let _ = pet.set_focus();
    }

    Ok(())
}

#[tauri::command]
fn first_run_close_wizard(app: AppHandle) -> Result<(), String> {
    let setup_completed =
        notion::config_get_value_internal(&app, "setup_completed")?.unwrap_or_default();

    if setup_completed == "1" {
        first_run_complete(app)
    } else {
        app.exit(0);
        Ok(())
    }
}

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().map_err(|e| e.to_string())? {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn app_quit(app: tauri::AppHandle) -> Result<(), String> {
    app.exit(0);
    Ok(())
}

async fn send_request(request: reqwest::RequestBuilder) -> Result<HttpStatusResult, String> {
    let response = request
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;
    Ok(HttpStatusResult {
        status: response.status().as_u16(),
    })
}

#[tauri::command]
async fn first_run_check_notion_user(notion_token: String) -> Result<HttpStatusResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;

    send_request(
        client
            .get("https://api.notion.com/v1/users/me")
            .bearer_auth(notion_token)
            .header("Notion-Version", "2022-06-28"),
    )
    .await
}

#[tauri::command]
async fn first_run_check_notion_database(
    notion_token: String,
    database_id: String,
) -> Result<HttpStatusResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("https://api.notion.com/v1/databases/{database_id}");

    send_request(
        client
            .get(url)
            .bearer_auth(notion_token)
            .header("Notion-Version", "2022-06-28"),
    )
    .await
}

#[tauri::command]
async fn first_run_check_deepseek(deepseek_api_key: String) -> Result<HttpStatusResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(6))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .post("https://api.deepseek.com/chat/completions")
        .bearer_auth(deepseek_api_key)
        .json(&json!({
            "model": "deepseek-chat",
            "messages": [{ "role": "user", "content": "." }],
            "max_tokens": 1
        }))
        .send()
        .await
        .map_err(|e| format!("network: {e}"))?;

    let status = response.status();
    Ok(HttpStatusResult {
        status: if status == StatusCode::PAYMENT_REQUIRED {
            402
        } else {
            status.as_u16()
        },
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let app_handle = app.handle().clone();
            notion::ensure_config_schema_for_app(&app_handle)?;

            let setup_completed = notion::config_get_value_internal(
                &app_handle,
                "setup_completed",
            )
            .unwrap_or(None)
            .unwrap_or_default();

            let pet_window = app.get_webview_window(PET_WINDOW_LABEL);
            let wizard_window = app.get_webview_window(WIZARD_WINDOW_LABEL);

            if setup_completed == "1" {
                if let Some(wizard) = &wizard_window {
                    let _ = wizard.hide();
                }
                if let Some(pet) = &pet_window {
                    let _ = pet.show();
                    let _ = pet.set_focus();
                }
            } else {
                if let Some(pet) = &pet_window {
                    let _ = pet.hide();
                }
                if let Some(wizard) = &wizard_window {
                    let _ = wizard.show();
                    let _ = wizard.set_focus();
                }
            }

            if let Some(wizard) = wizard_window {
                let close_app_handle = app_handle.clone();
                wizard.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        let setup_completed = notion::config_get_value_internal(
                            &close_app_handle,
                            "setup_completed",
                        )
                        .unwrap_or(None)
                        .unwrap_or_default();
                        if setup_completed != "1" {
                            api.prevent_close();
                            close_app_handle.exit(0);
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_ignore_cursor_events,
            notion::config_get_value,
            notion::config_set_value,
            chat::chat_append_message,
            chat::chat_list_by_session,
            chat::chat_list_recent,
            chat::chat_memory_build_index,
            chat::chat_memory_query,
            workout::workout_import_csv,
            workout::workout_get_last_workout,
            workout::workout_get_body_part_recency,
            first_run_complete,
            first_run_close_wizard,
            window_minimize,
            window_toggle_maximize,
            app_quit,
            first_run_check_notion_user,
            first_run_check_notion_database,
            first_run_check_deepseek
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

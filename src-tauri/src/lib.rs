use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

const STATE_DIR: &str = "command_wall";
const STATE_FILE: &str = "state.json";

#[tauri::command]
async fn save_state(app: AppHandle, data: String) -> Result<(), String> {
    let path = state_file_path(&app).map_err(|e| e.to_string())?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, data).map_err(|e| e.to_string())
}

#[tauri::command]
async fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let path = state_file_path(&app).map_err(|e| e.to_string())?;
    match fs::read_to_string(path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) => {
            if err.kind() == ErrorKind::NotFound {
                Ok(None)
            } else {
                Err(err.to_string())
            }
        }
    }
}

fn state_file_path(app: &AppHandle) -> tauri::Result<PathBuf> {
    let mut dir = app.path().app_data_dir()?;
    dir.push(STATE_DIR);
    dir.push(STATE_FILE);
    Ok(dir)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![save_state, load_state])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

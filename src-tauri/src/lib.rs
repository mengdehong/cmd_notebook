mod backup;
mod config;

use std::fs;
use std::io::ErrorKind;
use std::path::PathBuf;

use tauri::AppHandle;

use backup::{backup_file, copy_data_to_new_dir, create_backup_if_changed};
use config::{
    check_target_dir, data_file_path, default_data_dir, is_dir_writable, load_config, save_config,
    AppConfig, DataDirInfo, SwitchDirAction, SwitchDirCheck,
};

const DATA_FILE: &str = "cmd_notebook.json";

#[tauri::command]
async fn save_state(app: AppHandle, data: String) -> Result<(), String> {
    let path = data_file_path(&app)?;

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建数据目录".to_string())?;
    }

    // 内容变化时创建备份
    create_backup_if_changed(&app, &data)?;

    // 原子写入：先写临时文件，再 rename
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, &data).map_err(|_| "写入数据失败".to_string())?;
    fs::rename(&tmp_path, &path).map_err(|_| "保存数据失败".to_string())?;

    Ok(())
}

#[tauri::command]
async fn load_state(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_file_path(&app)?;

    // 确保数据目录存在
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建数据目录".to_string())?;
    }

    match fs::read_to_string(&path) {
        Ok(contents) => Ok(Some(contents)),
        Err(err) => {
            if err.kind() == ErrorKind::NotFound {
                Ok(None)
            } else {
                Err("读取数据文件失败".to_string())
            }
        }
    }
}

#[tauri::command]
async fn get_data_dir_info(app: AppHandle) -> Result<DataDirInfo, String> {
    let config = load_config(&app)?;
    let default_dir = default_data_dir(&app)?;
    let data_path = config.data_dir.join(DATA_FILE);

    Ok(DataDirInfo {
        path: config.data_dir.to_string_lossy().to_string(),
        is_default: config.data_dir == default_dir,
        data_file_exists: data_path.exists(),
        is_writable: is_dir_writable(&config.data_dir),
    })
}

#[tauri::command]
async fn check_switch_dir(_app: AppHandle, path: String) -> Result<SwitchDirCheck, String> {
    let target_path = PathBuf::from(&path);
    Ok(check_target_dir(&target_path))
}

#[tauri::command]
async fn switch_data_dir(
    app: AppHandle,
    path: String,
    action: SwitchDirAction,
) -> Result<(), String> {
    eprintln!("[switch_data_dir] path: {}, action: {:?}", path, action);
    let new_dir = PathBuf::from(&path);

    match action {
        SwitchDirAction::Cancel => {
            eprintln!("[switch_data_dir] cancelled");
            return Ok(());
        }
        SwitchDirAction::CopyToNew => {
            eprintln!("[switch_data_dir] copying data to new dir");
            copy_data_to_new_dir(&app, &new_dir)?;
        }
        SwitchDirAction::UseExisting => {
            eprintln!("[switch_data_dir] using existing, backing up current");
            let current_data_path = data_file_path(&app)?;
            if current_data_path.exists() {
                let config = load_config(&app)?;
                let backup_dir = config.data_dir.join(".backup");
                backup_file(&current_data_path, &backup_dir)?;
            }
        }
    }

    // 更新配置
    eprintln!(
        "[switch_data_dir] updating config to new_dir: {:?}",
        new_dir
    );
    let mut config = load_config(&app)?;
    config.data_dir = new_dir.clone();
    save_config(&app, &config)?;
    eprintln!("[switch_data_dir] config saved successfully");

    Ok(())
}

#[tauri::command]
async fn reset_data_dir(app: AppHandle) -> Result<(), String> {
    let default_dir = default_data_dir(&app)?;

    // 备份当前数据
    let current_data_path = data_file_path(&app)?;
    if current_data_path.exists() {
        let config = load_config(&app)?;
        if config.data_dir != default_dir {
            let backup_dir = config.data_dir.join(".backup");
            backup_file(&current_data_path, &backup_dir)?;
        }
    }

    // 重置为默认目录
    let config = AppConfig {
        data_dir: default_dir,
        backup_count: load_config(&app)?.backup_count,
    };
    save_config(&app, &config)?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_state,
            load_state,
            get_data_dir_info,
            check_switch_dir,
            switch_data_dir,
            reset_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

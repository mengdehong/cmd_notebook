use std::fs;
use std::path::PathBuf;

use chrono::Local;
use tauri::AppHandle;

use crate::config::{backup_dir_path, data_file_path, load_config};

const DATA_FILE: &str = "cmd_notebook.json";

/// 生成备份文件名，格式：cmd_notebook_YYYYMMDD_HHMMSS.json
fn generate_backup_filename() -> String {
    let now = Local::now();
    format!("cmd_notebook_{}.json", now.format("%Y%m%d_%H%M%S"))
}

/// 创建备份（仅在内容变化时）
pub fn create_backup_if_changed(app: &AppHandle, new_content: &str) -> Result<(), String> {
    let data_path = data_file_path(app)?;

    // 如果数据文件不存在，无需备份
    if !data_path.exists() {
        return Ok(());
    }

    // 读取当前内容
    let current_content = fs::read_to_string(&data_path).unwrap_or_default();

    // 内容相同则跳过备份
    if current_content == new_content {
        return Ok(());
    }

    // 创建备份
    let backup_dir = backup_dir_path(app)?;
    fs::create_dir_all(&backup_dir).map_err(|_| "无法创建备份目录".to_string())?;

    let backup_filename = generate_backup_filename();
    let backup_path = backup_dir.join(&backup_filename);

    fs::copy(&data_path, &backup_path).map_err(|_| "创建备份失败".to_string())?;

    // 清理过期备份
    let config = load_config(app)?;
    cleanup_old_backups(&backup_dir, config.backup_count)?;

    Ok(())
}

/// 清理过期备份，保留最近 N 份
fn cleanup_old_backups(backup_dir: &PathBuf, keep_count: usize) -> Result<(), String> {
    let mut backups: Vec<_> = fs::read_dir(backup_dir)
        .map_err(|_| "读取备份目录失败".to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            entry
                .file_name()
                .to_string_lossy()
                .starts_with("cmd_notebook_")
                && entry.file_name().to_string_lossy().ends_with(".json")
        })
        .collect();

    if backups.len() <= keep_count {
        return Ok(());
    }

    // 按修改时间排序（最新的在前）
    backups.sort_by(|a, b| {
        let time_a = a.metadata().and_then(|m| m.modified()).ok();
        let time_b = b.metadata().and_then(|m| m.modified()).ok();
        time_b.cmp(&time_a)
    });

    // 删除多余的备份
    for backup in backups.into_iter().skip(keep_count) {
        let _ = fs::remove_file(backup.path());
    }

    Ok(())
}

/// 备份指定文件到备份目录
pub fn backup_file(source: &PathBuf, backup_dir: &PathBuf) -> Result<String, String> {
    if !source.exists() {
        return Ok("".to_string());
    }

    fs::create_dir_all(backup_dir).map_err(|_| "无法创建备份目录".to_string())?;

    let backup_filename = generate_backup_filename();
    let backup_path = backup_dir.join(&backup_filename);

    fs::copy(source, &backup_path).map_err(|_| "创建备份失败".to_string())?;

    Ok(backup_path.to_string_lossy().to_string())
}

/// 复制数据文件到新目录
pub fn copy_data_to_new_dir(app: &AppHandle, new_dir: &PathBuf) -> Result<(), String> {
    let current_data_path = data_file_path(app)?;

    if !current_data_path.exists() {
        return Ok(());
    }

    fs::create_dir_all(new_dir).map_err(|_| "无法创建目标目录".to_string())?;

    let new_data_path = new_dir.join(DATA_FILE);
    fs::copy(&current_data_path, &new_data_path).map_err(|_| "复制数据文件失败".to_string())?;

    Ok(())
}

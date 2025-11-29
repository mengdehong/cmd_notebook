use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "app_config.json";
const DATA_FILE: &str = "cmd_notebook.json";
const BACKUP_DIR: &str = ".backup";
const DEFAULT_BACKUP_COUNT: usize = 10;

/// 应用配置（存储在系统 ConfigDir）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// 数据目录路径（用户可自定义）
    pub data_dir: PathBuf,
    /// 备份保留数量
    #[serde(default = "default_backup_count")]  
    pub backup_count: usize,
}

fn default_backup_count() -> usize {
    DEFAULT_BACKUP_COUNT
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            data_dir: PathBuf::new(),
            backup_count: default_backup_count(),
        }
    }
}

/// 数据目录信息（返回给前端）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataDirInfo {
    pub path: String,
    pub is_default: bool,
    pub data_file_exists: bool,
    pub is_writable: bool,
}

/// 切换目录时的检测结果
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SwitchDirCheck {
    EmptyDir,
    HasExistingData {
        #[serde(rename = "lastModified")]
        last_modified: String,
    },
    Invalid {
        reason: String,
    },
}

/// 切换目录的操作选项
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "action")]
pub enum SwitchDirAction {
    CopyToNew,
    UseExisting,
    Cancel,
}

/// 获取配置文件路径（使用系统 ConfigDir）
pub fn config_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|_| "无法获取应用配置目录".to_string())?;
    Ok(config_dir.join(CONFIG_FILE))
}

/// 获取默认数据目录（使用系统 AppDataDir）
pub fn default_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法获取应用数据目录".to_string())?;
    Ok(data_dir)
}

/// 加载配置，若不存在则创建默认配置
pub fn load_config(app: &AppHandle) -> Result<AppConfig, String> {
    let config_path = config_file_path(app)?;

    // 调试输出
    eprintln!("[config] config_path: {:?}", config_path);
    eprintln!("[config] config_path.exists(): {}", config_path.exists());

    if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|_| "读取配置文件失败".to_string())?;
        eprintln!("[config] loaded content: {}", content);
        
        let mut config: AppConfig =
            serde_json::from_str(&content).map_err(|_| "配置文件格式错误".to_string())?;

        // 如果 data_dir 为空，使用默认值
        if config.data_dir.as_os_str().is_empty() {
            config.data_dir = default_data_dir(app)?;
        }
        eprintln!("[config] final data_dir: {:?}", config.data_dir);
        Ok(config)
    } else {
        // 创建默认配置
        let config = AppConfig {
            data_dir: default_data_dir(app)?,
            backup_count: DEFAULT_BACKUP_COUNT,
        };
        eprintln!("[config] creating new config with data_dir: {:?}", config.data_dir);
        save_config(app, &config)?;
        Ok(config)
    }
}

/// 保存配置
pub fn save_config(app: &AppHandle, config: &AppConfig) -> Result<(), String> {
    let config_path = config_file_path(app)?;

    // 确保目录存在
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent).map_err(|_| "无法创建配置目录".to_string())?;
    }

    let content =
        serde_json::to_string_pretty(config).map_err(|_| "配置序列化失败".to_string())?;

    // 原子写入
    let tmp_path = config_path.with_extension("json.tmp");
    fs::write(&tmp_path, &content).map_err(|_| "写入配置文件失败".to_string())?;
    fs::rename(&tmp_path, &config_path).map_err(|_| "保存配置文件失败".to_string())?;

    Ok(())
}

/// 获取数据文件路径
pub fn data_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config = load_config(app)?;
    Ok(config.data_dir.join(DATA_FILE))
}

/// 获取备份目录路径
pub fn backup_dir_path(app: &AppHandle) -> Result<PathBuf, String> {
    let config = load_config(app)?;
    Ok(config.data_dir.join(BACKUP_DIR))
}

/// 检查目录是否可写
pub fn is_dir_writable(path: &PathBuf) -> bool {
    if !path.exists() {
        // 尝试创建目录
        if fs::create_dir_all(path).is_err() {
            return false;
        }
    }

    // 尝试写入测试文件
    let test_file = path.join(".write_test");
    if fs::write(&test_file, "test").is_ok() {
        let _ = fs::remove_file(&test_file);
        true
    } else {
        false
    }
}

/// 检查目标目录状态
pub fn check_target_dir(path: &PathBuf) -> SwitchDirCheck {
    if !path.exists() {
        if fs::create_dir_all(path).is_err() {
            return SwitchDirCheck::Invalid {
                reason: "无法创建目录".to_string(),
            };
        }
    }

    if !path.is_dir() {
        return SwitchDirCheck::Invalid {
            reason: "选择的路径不是目录".to_string(),
        };
    }

    if !is_dir_writable(path) {
        return SwitchDirCheck::Invalid {
            reason: "目录不可写入".to_string(),
        };
    }

    let data_file = path.join(DATA_FILE);
    if data_file.exists() {
        let last_modified = match fs::metadata(&data_file) {
            Ok(meta) => match meta.modified() {
                Ok(time) => {
                    let datetime: chrono::DateTime<chrono::Local> = time.into();
                    datetime.format("%Y-%m-%d %H:%M:%S").to_string()
                }
                Err(_) => "未知".to_string(),
            },
            Err(_) => "未知".to_string(),
        };
        SwitchDirCheck::HasExistingData { last_modified }
    } else {
        SwitchDirCheck::EmptyDir
    }
}

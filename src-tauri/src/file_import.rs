use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::install::InstalledSkillSnapshot;
use crate::repository_sources::{install_repository_skill, RepositorySkillInstallRequest};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileImportCheckResult {
    pub valid: bool,
    pub skill_count: usize,
    pub skill_names: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileImportProgress {
    pub stage: String,
    pub message: String,
    pub current: Option<usize>,
    pub total: Option<usize>,
}

#[derive(Debug, Error)]
pub enum FileImportError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json parse error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unsupported file type: {0}")]
    UnsupportedFileType(String),
    #[error("install error: {0}")]
    Install(#[from] crate::install::InstallError),
    #[error("install failed: {0}")]
    InstallFailed(String),
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct SkillLockFile {
    version: Option<u32>,
    skills: Option<std::collections::HashMap<String, SkillLockEntry>>,
}

#[derive(Debug, Clone, Deserialize)]
#[allow(dead_code)]
struct SkillLockEntry {
    source: String,
    #[serde(rename = "sourceType")]
    source_type: String,
    #[serde(rename = "sourceUrl")]
    source_url: Option<String>,
    #[serde(rename = "skillPath")]
    skill_path: Option<String>,
    #[serde(rename = "installedAt")]
    installed_at: Option<String>,
    #[serde(rename = "updatedAt")]
    updated_at: Option<String>,
}

pub fn check_file_import(
    file_path: &Path,
    file_type: &str,
) -> Result<FileImportCheckResult, FileImportError> {
    match file_type {
        "npx" => check_npx_lock_file(file_path),
        _ => Err(FileImportError::UnsupportedFileType(file_type.to_string())),
    }
}

pub fn install_from_file(
    connection: &Connection,
    managed_skills_root: PathBuf,
    file_path: &Path,
    file_type: &str,
    on_progress: Option<Box<dyn Fn(FileImportProgress) + Send>>,
) -> Result<Vec<InstalledSkillSnapshot>, FileImportError> {
    match file_type {
        "npx" => install_from_npx_lock_file(connection, managed_skills_root, file_path, on_progress),
        _ => Err(FileImportError::UnsupportedFileType(file_type.to_string())),
    }
}

fn check_npx_lock_file(file_path: &Path) -> Result<FileImportCheckResult, FileImportError> {
    let content = fs::read_to_string(file_path)?;
    let lock_file: SkillLockFile = serde_json::from_str(&content)?;

    let skills = lock_file.skills.unwrap_or_default();
    let skill_names: Vec<String> = skills.keys().cloned().collect();

    let count = skill_names.len();
    let message = if count > 0 {
        format!("发现 {} 个技能", count)
    } else {
        "未在文件中发现技能".to_string()
    };

    Ok(FileImportCheckResult {
        valid: count > 0,
        skill_count: count,
        skill_names,
        message,
    })
}

fn install_from_npx_lock_file(
    connection: &Connection,
    managed_skills_root: PathBuf,
    file_path: &Path,
    on_progress: Option<Box<dyn Fn(FileImportProgress) + Send>>,
) -> Result<Vec<InstalledSkillSnapshot>, FileImportError> {
    let content = fs::read_to_string(file_path)?;
    let lock_file: SkillLockFile = serde_json::from_str(&content)?;

    let skills = lock_file.skills.unwrap_or_default();
    let skill_list: Vec<(String, SkillLockEntry)> = skills.into_iter().collect();

    let total = skill_list.len();
    let mut installed = Vec::new();
    let mut skipped = 0;
    let mut errors = Vec::new();

    for (index, (skill_name, entry)) in skill_list.iter().enumerate() {
        if let Some(ref progress) = on_progress {
            progress(FileImportProgress {
                stage: "installing".to_string(),
                message: format!("正在安装 {}", skill_name),
                current: Some(index + 1),
                total: Some(total),
            });
        }

        // Check if skill already exists
        let existing = connection.query_row(
            "SELECT id FROM skills WHERE source_type = ?1 AND source_ref = ?2 AND skill_path = ?3",
            rusqlite::params![
                entry.source_type,
                entry.source,
                entry.skill_path.as_deref().unwrap_or("SKILL.md")
            ],
            |row| row.get::<_, String>(0),
        );

        if existing.is_ok() {
            skipped += 1;
            continue;
        }

        // Use repository install to download and install from GitHub
        let request = RepositorySkillInstallRequest {
            source: entry.source.clone(),
            skill_name: skill_name.clone(),
        };

        match install_repository_skill(connection, managed_skills_root.clone(), request, None) {
            Ok(mut snapshots) => {
                installed.append(&mut snapshots);
            }
            Err(e) => {
                errors.push(format!("{}: {}", skill_name, e));
            }
        }
    }

    if let Some(ref progress) = on_progress {
        let msg = if errors.is_empty() {
            format!("已安装 {} 个，跳过 {} 个", installed.len(), skipped)
        } else {
            format!("已安装 {} 个，跳过 {} 个，失败 {} 个", installed.len(), skipped, errors.len())
        };
        progress(FileImportProgress {
            stage: "complete".to_string(),
            message: msg,
            current: Some(total),
            total: Some(total),
        });
    }

    if !errors.is_empty() {
        return Err(FileImportError::InstallFailed(errors.join("; ")));
    }

    Ok(installed)
}

#[tauri::command]
pub fn check_file_import_record(
    file_path: String,
    file_type: String,
) -> Result<FileImportCheckResult, String> {
    check_file_import(Path::new(&file_path), &file_type)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn install_from_file_record(
    file_path: String,
    file_type: String,
    on_progress: tauri::ipc::Channel<FileImportProgress>,
) -> Result<Vec<InstalledSkillSnapshot>, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;
    let managed_skills_root =
        crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;

    let progress_callback = Box::new(move |progress: FileImportProgress| {
        let _ = on_progress.send(progress);
    });

    install_from_file(
        &connection,
        managed_skills_root,
        Path::new(&file_path),
        &file_type,
        Some(progress_callback),
    )
    .map_err(|error| error.to_string())
}

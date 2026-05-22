use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppPathError {
    #[error("could not resolve the platform app data directory")]
    AppDataUnavailable,
    #[error("failed to create app data directory {path}: {source}")]
    CreateAppData {
        path: PathBuf,
        source: std::io::Error,
    },
}

pub fn app_data_dir() -> Result<PathBuf, AppPathError> {
    let base = dirs::data_dir().ok_or(AppPathError::AppDataUnavailable)?;
    let path = base.join("SkillsManager");
    std::fs::create_dir_all(&path).map_err(|source| AppPathError::CreateAppData {
        path: path.clone(),
        source,
    })?;
    Ok(path)
}

pub fn database_path() -> Result<PathBuf, AppPathError> {
    Ok(app_data_dir()?.join("skills-manager.sqlite3"))
}

pub fn managed_skills_dir() -> Result<PathBuf, AppPathError> {
    let path = app_data_dir()?.join("managed-skills");
    std::fs::create_dir_all(&path).map_err(|source| AppPathError::CreateAppData {
        path: path.clone(),
        source,
    })?;
    Ok(path)
}

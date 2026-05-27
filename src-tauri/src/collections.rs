use std::sync::{Mutex, OnceLock};

use serde::{Deserialize, Serialize};
use thiserror::Error;

const COLLECTION_INDEX_URL: &str =
    "https://raw.githubusercontent.com/Mr-BeanSir/SkillsCollection/master/index.json";
const COLLECTION_BASE_URL: &str =
    "https://raw.githubusercontent.com/Mr-BeanSir/SkillsCollection/master/";

static COLLECTION_INDEX: OnceLock<Mutex<Option<CollectionIndex>>> = OnceLock::new();

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionIndex {
    pub version: u32,
    pub collections: Vec<CollectionIndexEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionIndexEntry {
    pub title: String,
    pub description: String,
    pub version: String,
    #[serde(alias = "total_skills")]
    pub total_skills: u32,
    pub file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionDetail {
    pub title: String,
    pub description: String,
    pub version: String,
    pub skills: Vec<CollectionSkillEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSkillEntry {
    pub name: String,
    pub description: String,
    #[serde(alias = "source_type")]
    pub source_type: String,
    #[serde(alias = "source_ref")]
    pub source_ref: String,
}

#[derive(Debug, Error)]
pub enum CollectionError {
    #[error("http error: {0}")]
    Http(String),
    #[error("json error: {0}")]
    Json(String),
}

// ---------------------------------------------------------------------------
// Background download
// ---------------------------------------------------------------------------

pub fn download_collection_index() {
    let headers = std::collections::HashMap::new();
    let body = match crate::http::fetch_text(COLLECTION_INDEX_URL, &headers) {
        Ok(body) => body,
        Err(error) => {
            eprintln!("Failed to download collection index: {}", error.to_string());
            return;
        }
    };

    let index: CollectionIndex = match serde_json::from_str(&body) {
        Ok(index) => index,
        Err(error) => {
            eprintln!("Failed to parse collection index: {error}");
            return;
        }
    };

    // Cache to local file
    if let Ok(app_dir) = crate::app_paths::app_data_dir() {
        let _ = std::fs::write(app_dir.join("collections-index.json"), &body);
    }

    let cell = COLLECTION_INDEX.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cell.lock() {
        *guard = Some(index);
    }
}

fn refresh_collection_index() -> Result<(), CollectionError> {
    let headers = std::collections::HashMap::new();
    let body = crate::http::fetch_text(COLLECTION_INDEX_URL, &headers)
        .map_err(|e| CollectionError::Http(e.to_string()))?;

    let index: CollectionIndex =
        serde_json::from_str(&body).map_err(|e| CollectionError::Json(e.to_string()))?;

    if let Ok(app_dir) = crate::app_paths::app_data_dir() {
        let _ = std::fs::write(app_dir.join("collections-index.json"), &body);
    }

    let cell = COLLECTION_INDEX.get_or_init(|| Mutex::new(None));
    if let Ok(mut guard) = cell.lock() {
        *guard = Some(index);
    }

    Ok(())
}

pub fn get_cached_collection_index() -> Option<CollectionIndex> {
    let cell = COLLECTION_INDEX.get_or_init(|| Mutex::new(None));
    cell.lock().ok()?.clone()
}

// ---------------------------------------------------------------------------
// Remote fetch
// ---------------------------------------------------------------------------

pub fn fetch_collection_detail(file: &str) -> Result<CollectionDetail, CollectionError> {
    let url = format!("{COLLECTION_BASE_URL}{file}");
    let headers = std::collections::HashMap::new();
    let body = crate::http::fetch_text(&url, &headers)
        .map_err(|e| CollectionError::Http(e.to_string()))?;
    serde_json::from_str(&body).map_err(|e| CollectionError::Json(e.to_string()))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_remote_collections() -> Result<Vec<CollectionIndexEntry>, String> {
    let index = get_cached_collection_index()
        .ok_or_else(|| "Collection index not yet downloaded".to_string())?;
    Ok(index.collections)
}

#[tauri::command]
pub async fn refresh_collection_index_record() -> Result<Vec<CollectionIndexEntry>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        refresh_collection_index().map_err(|error| error.to_string())?;
        let index = get_cached_collection_index()
            .ok_or_else(|| "Collection index not available after refresh".to_string())?;
        Ok(index.collections)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn get_collection_detail_record(
    file: String,
) -> Result<CollectionDetail, String> {
    tauri::async_runtime::spawn_blocking(move || {
        fetch_collection_detail(&file).map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

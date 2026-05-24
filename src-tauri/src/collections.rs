use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use rusqlite::Connection;
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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledCollection {
    pub id: String,
    pub file: String,
    pub title: String,
    pub description: String,
    pub version: String,
    pub total_skills: u32,
    pub installed_at: String,
    pub updated_at: String,
    pub skills: Vec<InstalledCollectionSkill>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledCollectionSkill {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInstallProgress {
    pub stage: String,
    pub message: String,
    pub current: Option<usize>,
    pub total: Option<usize>,
}

#[derive(Debug, Error)]
pub enum CollectionError {
    #[error("http error: {0}")]
    Http(String),
    #[error("json error: {0}")]
    Json(String),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("repository source error: {0}")]
    RepositorySource(String),
    #[error("not found: {0}")]
    NotFound(String),
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

fn fetch_collection_detail(file: &str) -> Result<CollectionDetail, CollectionError> {
    let url = format!("{COLLECTION_BASE_URL}{file}");
    let headers = std::collections::HashMap::new();
    let body = crate::http::fetch_text(&url, &headers)
        .map_err(|e| CollectionError::Http(e.to_string()))?;
    serde_json::from_str(&body).map_err(|e| CollectionError::Json(e.to_string()))
}

// ---------------------------------------------------------------------------
// Database queries
// ---------------------------------------------------------------------------

fn list_installed_collections(connection: &Connection) -> Result<Vec<InstalledCollection>, CollectionError> {
    let mut stmt = connection.prepare(
        "SELECT id, file, title, description, version, total_skills, installed_at, updated_at
         FROM collections ORDER BY installed_at DESC",
    )?;

    let collections = stmt
        .query_map([], |row| {
            Ok(InstalledCollection {
                id: row.get(0)?,
                file: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                version: row.get(4)?,
                total_skills: row.get(5)?,
                installed_at: row.get(6)?,
                updated_at: row.get(7)?,
                skills: Vec::new(),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut result = Vec::with_capacity(collections.len());
    for mut coll in collections {
        let mut skill_stmt = connection.prepare(
            "SELECT s.id, s.name, s.source_type, s.source_ref, s.skill_path
             FROM collection_skills cs
             JOIN skills s ON s.id = cs.skill_id
             WHERE cs.collection_id = ?1
             ORDER BY s.name",
        )?;

        coll.skills = skill_stmt
            .query_map([&coll.id], |row| {
                Ok(InstalledCollectionSkill {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    source_type: row.get(2)?,
                    source_ref: row.get(3)?,
                    skill_path: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?;

        result.push(coll);
    }

    Ok(result)
}

fn get_installed_collection(
    connection: &Connection,
    collection_id: &str,
) -> Result<InstalledCollection, CollectionError> {
    let mut stmt = connection.prepare(
        "SELECT id, file, title, description, version, total_skills, installed_at, updated_at
         FROM collections WHERE id = ?1",
    )?;

    let mut coll = stmt.query_row([collection_id], |row| {
        Ok(InstalledCollection {
            id: row.get(0)?,
            file: row.get(1)?,
            title: row.get(2)?,
            description: row.get(3)?,
            version: row.get(4)?,
            total_skills: row.get(5)?,
            installed_at: row.get(6)?,
            updated_at: row.get(7)?,
            skills: Vec::new(),
        })
    })?;

    let mut skill_stmt = connection.prepare(
        "SELECT s.id, s.name, s.source_type, s.source_ref, s.skill_path
         FROM collection_skills cs
         JOIN skills s ON s.id = cs.skill_id
         WHERE cs.collection_id = ?1
         ORDER BY s.name",
    )?;

    coll.skills = skill_stmt
        .query_map([&coll.id], |row| {
            Ok(InstalledCollectionSkill {
                id: row.get(0)?,
                name: row.get(1)?,
                source_type: row.get(2)?,
                source_ref: row.get(3)?,
                skill_path: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(coll)
}

fn collection_id_from_file(file: &str) -> String {
    crate::domain::ids::short_stable_hash(file)
}

// ---------------------------------------------------------------------------
// Install logic
// ---------------------------------------------------------------------------

fn install_collection(
    connection: &Connection,
    managed_skills_root: PathBuf,
    detail: &CollectionDetail,
    file: &str,
    progress: &Option<tauri::ipc::Channel<CollectionInstallProgress>>,
) -> Result<InstalledCollection, CollectionError> {
    let collection_id = collection_id_from_file(file);

    // Upsert collection row
    connection.execute(
        "INSERT INTO collections (id, file, title, description, version, total_skills)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(file) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           version = excluded.version,
           total_skills = excluded.total_skills,
           updated_at = CURRENT_TIMESTAMP",
        rusqlite::params![
            collection_id,
            file,
            detail.title,
            detail.description,
            detail.version,
            detail.skills.len() as u32
        ],
    )?;

    // Clear existing collection_skills for reinstall
    connection.execute(
        "DELETE FROM collection_skills WHERE collection_id = ?1",
        [&collection_id],
    )?;

    // Ensure a skill group exists for this collection
    let group_id = ensure_collection_group(connection, &detail.title)?;

    // Clear existing group skills for reinstall
    connection.execute(
        "DELETE FROM skill_group_skills WHERE group_id = ?1",
        [&group_id],
    )?;

    let total = detail.skills.len();

    for (i, skill_entry) in detail.skills.iter().enumerate() {
        send_collection_progress(
            progress,
            CollectionInstallProgress {
                stage: "installing".to_string(),
                message: format!("{}: {}", i + 1, skill_entry.name),
                current: Some(i + 1),
                total: Some(total),
            },
        );

        let source = skill_entry.source_ref.clone();
        let skill_name = skill_entry.name.clone();

        // Check if skill already exists in the skills table
        let existing_skill_id: Option<String> = connection
            .query_row(
                "SELECT id FROM skills WHERE source_type = ?1 AND source_ref = ?2 AND name = ?3",
                rusqlite::params![skill_entry.source_type, skill_entry.source_ref, skill_entry.name],
                |row| row.get(0),
            )
            .ok();

        let skill_id = if let Some(id) = existing_skill_id {
            // Skill already installed (manually or by another collection), just link it
            id
        } else {
            // Install the skill via repository_sources
            let request = crate::repository_sources::RepositorySkillInstallRequest {
                source,
                skill_name,
            };

            let installed = crate::repository_sources::install_repository_skill(
                connection,
                managed_skills_root.clone(),
                request,
                None,
            )
            .map_err(|e| CollectionError::RepositorySource(e.to_string()))?;

            if let Some(snapshot) = installed.into_iter().next() {
                snapshot.id
            } else {
                continue;
            }
        };

        // Link skill to collection
        connection.execute(
            "INSERT OR IGNORE INTO collection_skills (collection_id, skill_id, source_origin)
             VALUES (?1, ?2, 'collection')",
            rusqlite::params![collection_id, skill_id],
        )?;

        // Link skill to the collection's group
        connection.execute(
            "INSERT OR IGNORE INTO skill_group_skills (group_id, skill_id)
             VALUES (?1, ?2)",
            rusqlite::params![group_id, skill_id],
        )?;
    }

    get_installed_collection(connection, &collection_id)
}

// ---------------------------------------------------------------------------
// Update logic
// ---------------------------------------------------------------------------

fn update_collection(
    connection: &Connection,
    managed_skills_root: PathBuf,
    collection_id: &str,
    new_detail: &CollectionDetail,
    progress: &Option<tauri::ipc::Channel<CollectionInstallProgress>>,
) -> Result<InstalledCollection, CollectionError> {
    // Get current skills in this collection
    let old_skills = get_collection_skill_names(connection, collection_id)?;
    let new_skill_names: std::collections::HashSet<&str> =
        new_detail.skills.iter().map(|s| s.name.as_str()).collect();
    let old_skill_names: std::collections::HashSet<&str> =
        old_skills.iter().map(|s| s.as_str()).collect();

    // Skills to add (in new but not in old)
    let to_add: Vec<&CollectionSkillEntry> = new_detail
        .skills
        .iter()
        .filter(|s| !old_skill_names.contains(s.name.as_str()))
        .collect();

    // Skills to remove (in old but not in new)
    let to_remove: Vec<String> = old_skills
        .into_iter()
        .filter(|s| !new_skill_names.contains(s.as_str()))
        .collect();

    // Ensure a skill group exists for this collection
    let group_id = ensure_collection_group(connection, &new_detail.title)?;

    let total = to_add.len();
    for (i, skill_entry) in to_add.iter().enumerate() {
        send_collection_progress(
            progress,
            CollectionInstallProgress {
                stage: "installing".to_string(),
                message: format!("{}: {}", i + 1, skill_entry.name),
                current: Some(i + 1),
                total: Some(total),
            },
        );

        let source = skill_entry.source_ref.clone();
        let skill_name = skill_entry.name.clone();

        let existing_skill_id: Option<String> = connection
            .query_row(
                "SELECT id FROM skills WHERE source_type = ?1 AND source_ref = ?2 AND name = ?3",
                rusqlite::params![skill_entry.source_type, skill_entry.source_ref, skill_entry.name],
                |row| row.get(0),
            )
            .ok();

        let skill_id = if let Some(id) = existing_skill_id {
            id
        } else {
            let request = crate::repository_sources::RepositorySkillInstallRequest {
                source,
                skill_name,
            };
            let installed = crate::repository_sources::install_repository_skill(
                connection,
                managed_skills_root.clone(),
                request,
                None,
            )
            .map_err(|e| CollectionError::RepositorySource(e.to_string()))?;

            if let Some(snapshot) = installed.into_iter().next() {
                snapshot.id
            } else {
                continue;
            }
        };

        connection.execute(
            "INSERT OR IGNORE INTO collection_skills (collection_id, skill_id, source_origin)
             VALUES (?1, ?2, 'collection')",
            rusqlite::params![collection_id, skill_id],
        )?;

        // Add to the collection's group
        connection.execute(
            "INSERT OR IGNORE INTO skill_group_skills (group_id, skill_id)
             VALUES (?1, ?2)",
            rusqlite::params![group_id, skill_id],
        )?;
    }

    // Remove skills no longer in the collection
    for skill_name in &to_remove {
        // Find the skill_id
        if let Ok(skill_id) = connection.query_row(
            "SELECT id FROM skills WHERE name = ?1",
            [skill_name],
            |row| row.get::<_, String>(0),
        ) {
            // Remove from collection_skills
            connection.execute(
                "DELETE FROM collection_skills WHERE collection_id = ?1 AND skill_id = ?2",
                rusqlite::params![collection_id, skill_id],
            )?;

            // Remove from the collection's group
            connection.execute(
                "DELETE FROM skill_group_skills WHERE group_id = ?1 AND skill_id = ?2",
                rusqlite::params![group_id, skill_id],
            )?;

            // Remove from project_skills if source_origin is 'collection'
            connection.execute(
                "DELETE FROM project_skills WHERE skill_id = ?1 AND source_origin = 'collection'",
                [&skill_id],
            )?;
        }
    }

    // Update collection version
    connection.execute(
        "UPDATE collections SET version = ?1, total_skills = ?2, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3",
        rusqlite::params![new_detail.version, new_detail.skills.len() as u32, collection_id],
    )?;

    get_installed_collection(connection, collection_id)
}

fn get_collection_skill_names(
    connection: &Connection,
    collection_id: &str,
) -> Result<Vec<String>, CollectionError> {
    let mut stmt = connection.prepare(
        "SELECT s.name FROM collection_skills cs
         JOIN skills s ON s.id = cs.skill_id
         WHERE cs.collection_id = ?1",
    )?;

    let names = stmt
        .query_map([collection_id], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    Ok(names)
}

// ---------------------------------------------------------------------------
// Delete logic
// ---------------------------------------------------------------------------

fn delete_collection(connection: &Connection, collection_id: &str) -> Result<(), CollectionError> {
    // CASCADE handles collection_skills
    let changed = connection.execute(
        "DELETE FROM collections WHERE id = ?1",
        [collection_id],
    )?;

    if changed == 0 {
        return Err(CollectionError::NotFound(format!(
            "collection {collection_id} not found"
        )));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn send_collection_progress(
    channel: &Option<tauri::ipc::Channel<CollectionInstallProgress>>,
    progress: CollectionInstallProgress,
) {
    if let Some(ch) = channel {
        let _ = ch.send(progress);
    }
}

fn ensure_collection_group(
    connection: &Connection,
    collection_title: &str,
) -> Result<String, CollectionError> {
    let name = collection_title.trim();
    if name.is_empty() {
        return Err(CollectionError::RepositorySource(
            "collection title is empty".to_string(),
        ));
    }

    // Try to find existing group by name
    let existing: Option<String> = connection
        .query_row(
            "SELECT id FROM skill_groups WHERE name = ?1",
            [name],
            |row| row.get(0),
        )
        .ok();

    if let Some(id) = existing {
        return Ok(id);
    }

    // Create new group
    let id = crate::domain::ids::stable_prefixed_id("skill-group", name);
    connection.execute(
        "INSERT INTO skill_groups (id, name) VALUES (?1, ?2)",
        rusqlite::params![id, name],
    )?;

    Ok(id)
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

#[tauri::command]
pub async fn install_collection_record(
    file: String,
    on_progress: tauri::ipc::Channel<CollectionInstallProgress>,
) -> Result<InstalledCollection, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let database_path =
            crate::app_paths::database_path().map_err(|error| error.to_string())?;
        let connection =
            crate::db::open_database(database_path).map_err(|error| error.to_string())?;
        let managed_skills_root =
            crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;

        let detail =
            fetch_collection_detail(&file).map_err(|error| error.to_string())?;

        let progress = Some(on_progress);
        install_collection(&connection, managed_skills_root, &detail, &file, &progress)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn list_installed_collection_records() -> Result<Vec<InstalledCollection>, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;
    list_installed_collections(&connection).map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn update_collection_record(
    collection_id: String,
    on_progress: tauri::ipc::Channel<CollectionInstallProgress>,
) -> Result<InstalledCollection, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let database_path =
            crate::app_paths::database_path().map_err(|error| error.to_string())?;
        let connection =
            crate::db::open_database(database_path).map_err(|error| error.to_string())?;
        let managed_skills_root =
            crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;

        // Get the collection's file to fetch latest detail
        let file: String = connection
            .query_row(
                "SELECT file FROM collections WHERE id = ?1",
                [&collection_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;

        let detail =
            fetch_collection_detail(&file).map_err(|error| error.to_string())?;

        let progress = Some(on_progress);
        update_collection(
            &connection,
            managed_skills_root,
            &collection_id,
            &detail,
            &progress,
        )
        .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn delete_collection_record(collection_id: String) -> Result<(), String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;
    delete_collection(&connection, &collection_id).map_err(|error| error.to_string())
}

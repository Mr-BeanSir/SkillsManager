use std::path::PathBuf;

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::domain::ids::stable_prefixed_id;
use crate::reconcile::{reconcile_project_record_if_enabled, ReconcileEnvironment};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionInstallProgress {
    pub stage: String,
    pub message: String,
    pub current: Option<usize>,
    pub total: Option<usize>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillGroup {
    pub id: String,
    pub name: String,
    pub group_type: String,
    pub file: Option<String>,
    pub description: String,
    pub version: Option<String>,
    pub total_skills: i64,
    pub skills: Vec<GroupSkill>,
    pub active_project_count: i64,
    pub attached_project_count: i64,
    pub project_usages: Vec<ProjectGroupUsage>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSkill {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroupUsage {
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillGroupInput {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Error)]
pub enum SkillGroupError {
    #[error("group name is required")]
    GroupNameRequired,
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Reconcile(#[from] crate::reconcile::ReconcileError),
    #[error("repository source error: {0}")]
    RepositorySource(String),
    #[error("filesystem error: {0}")]
    Filesystem(#[from] std::io::Error),
}

pub fn list_skill_groups(connection: &Connection) -> Result<Vec<SkillGroup>, SkillGroupError> {
    let mut statement = connection.prepare(
        "SELECT id, name, type, file, description, version, total_skills, created_at, updated_at
        FROM skill_groups
        ORDER BY type ASC, name ASC",
    )?;

    let group_headers = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    group_headers
        .into_iter()
        .map(|(id, name, group_type, file, description, version, total_skills, created_at, updated_at)| {
            hydrate_group(connection, id, name, group_type, file, description, version, total_skills, created_at, updated_at)
        })
        .collect()
}

pub fn create_skill_group(
    connection: &Connection,
    input: SkillGroupInput,
) -> Result<SkillGroup, SkillGroupError> {
    let input = normalize_group_input(input)?;
    let id = stable_id("skill-group", &input.name);

    connection.execute(
        "INSERT INTO skill_groups (id, name, description)
        VALUES (?1, ?2, ?3)",
        (&id, &input.name, &input.description),
    )?;

    get_skill_group(connection, &id)
}

pub fn delete_skill_group(connection: &Connection, id: &str) -> Result<(), SkillGroupError> {
    connection.execute("DELETE FROM skill_groups WHERE id = ?1", [id])?;
    Ok(())
}

pub fn update_skill_group(
    connection: &Connection,
    id: &str,
    input: SkillGroupInput,
) -> Result<SkillGroup, SkillGroupError> {
    let input = normalize_group_input(input)?;

    connection.execute(
        "UPDATE skill_groups SET name = ?1, description = ?2, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?3",
        (&input.name, &input.description, id),
    )?;

    get_skill_group(connection, id)
}

pub fn add_skill_to_group(
    connection: &Connection,
    group_id: &str,
    skill_id: &str,
) -> Result<SkillGroup, SkillGroupError> {
    connection.execute(
        "INSERT OR IGNORE INTO skill_group_skills (group_id, skill_id)
        VALUES (?1, ?2)",
        (group_id, skill_id),
    )?;

    sync_skill_to_attached_projects(connection, group_id, skill_id)?;
    get_skill_group(connection, group_id)
}

pub fn remove_skill_from_group(
    connection: &Connection,
    group_id: &str,
    skill_id: &str,
) -> Result<SkillGroup, SkillGroupError> {
    connection.execute(
        "DELETE FROM skill_group_skills
        WHERE group_id = ?1 AND skill_id = ?2",
        (group_id, skill_id),
    )?;

    remove_orphaned_group_skill_from_projects(connection, group_id, skill_id)?;
    get_skill_group(connection, group_id)
}

#[tauri::command]
pub fn list_skill_group_records() -> Result<Vec<SkillGroup>, String> {
    with_database(|connection| list_skill_groups(connection))
}

#[tauri::command]
pub fn create_skill_group_record(input: SkillGroupInput) -> Result<SkillGroup, String> {
    with_database(|connection| create_skill_group(connection, input))
}

#[tauri::command]
pub fn delete_skill_group_record(id: String) -> Result<(), String> {
    with_database(|connection| delete_skill_group(connection, &id))
}

#[tauri::command]
pub fn update_skill_group_record(id: String, input: SkillGroupInput) -> Result<SkillGroup, String> {
    with_database(|connection| update_skill_group(connection, &id, input))
}

#[tauri::command]
pub fn add_skill_to_group_record(group_id: String, skill_id: String) -> Result<SkillGroup, String> {
    with_database_and_reconcile(|connection, environment| {
        let group = add_skill_to_group(connection, &group_id, &skill_id)?;
        reconcile_affected_projects(connection, environment, &group_id)?;
        Ok(group)
    })
}

#[tauri::command]
pub fn remove_skill_from_group_record(
    group_id: String,
    skill_id: String,
) -> Result<SkillGroup, String> {
    with_database_and_reconcile(|connection, environment| {
        let group = remove_skill_from_group(connection, &group_id, &skill_id)?;
        reconcile_affected_projects(connection, environment, &group_id)?;
        Ok(group)
    })
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, SkillGroupError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn with_database_and_reconcile<T>(
    action: impl FnOnce(&Connection, &ReconcileEnvironment) -> Result<T, SkillGroupError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;
    let home_dir =
        dirs::home_dir().ok_or_else(|| "could not resolve the user home directory".to_string())?;
    let managed_skills_root =
        crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;
    let environment = ReconcileEnvironment {
        home_dir,
        managed_skills_root,
    };

    action(&connection, &environment).map_err(|error| error.to_string())
}

fn sync_skill_to_attached_projects(
    connection: &Connection,
    group_id: &str,
    skill_id: &str,
) -> Result<(), SkillGroupError> {
    let project_ids = list_project_ids_for_group(connection, group_id)?;

    for project_id in project_ids {
        let existing = connection
            .query_row(
                "SELECT source_origin FROM project_skills
                WHERE project_id = ?1 AND skill_id = ?2",
                (&project_id, skill_id),
                |row| row.get::<_, String>(0),
            )
            .ok();

        match existing {
            Some(ref origin) if origin == "manual" => {
                connection.execute(
                    "UPDATE project_skills SET source_origin = 'group', hidden = 1, updated_at = CURRENT_TIMESTAMP
                    WHERE project_id = ?1 AND skill_id = ?2 AND source_origin = 'manual'",
                    (&project_id, skill_id),
                )?;
            }
            Some(_) => {}
            None => {
                let id = project_skill_id(&project_id, skill_id);
                connection.execute(
                    "INSERT INTO project_skills (id, project_id, skill_id, enabled, source_origin, hidden)
                    VALUES (?1, ?2, ?3, 1, 'group', 0)",
                    (&id, &project_id, skill_id),
                )?;
            }
        }
    }

    Ok(())
}

fn remove_orphaned_group_skill_from_projects(
    connection: &Connection,
    group_id: &str,
    skill_id: &str,
) -> Result<(), SkillGroupError> {
    let project_ids = list_project_ids_for_group(connection, group_id)?;

    for project_id in project_ids {
        let still_in_any_enabled_group = connection.query_row(
            "SELECT COUNT(*) FROM skill_group_skills
            INNER JOIN project_groups ON project_groups.group_id = skill_group_skills.group_id
            WHERE project_groups.project_id = ?1
              AND project_groups.enabled = 1
              AND skill_group_skills.skill_id = ?2",
            (&project_id, skill_id),
            |row| row.get::<_, i64>(0),
        )? > 0;

        if still_in_any_enabled_group {
            continue;
        }

        let hidden_manual = connection
            .query_row(
                "SELECT COUNT(*) FROM project_skills
                WHERE project_id = ?1 AND skill_id = ?2 AND source_origin = 'group' AND hidden = 1",
                (&project_id, skill_id),
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0)
            > 0;

        if hidden_manual {
            connection.execute(
                "UPDATE project_skills SET source_origin = 'manual', hidden = 0, updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ?1 AND skill_id = ?2",
                (&project_id, skill_id),
            )?;
        } else {
            connection.execute(
                "DELETE FROM project_skills
                WHERE project_id = ?1 AND skill_id = ?2 AND source_origin = 'group'",
                (&project_id, skill_id),
            )?;
        }
    }

    Ok(())
}

fn reconcile_affected_projects(
    connection: &Connection,
    environment: &ReconcileEnvironment,
    group_id: &str,
) -> Result<(), SkillGroupError> {
    let project_ids = list_project_ids_for_group(connection, group_id)?;

    for project_id in project_ids {
        reconcile_project_record_if_enabled(connection, environment, &project_id)?;
    }

    Ok(())
}

fn list_project_ids_for_group(
    connection: &Connection,
    group_id: &str,
) -> Result<Vec<String>, SkillGroupError> {
    let mut statement = connection.prepare(
        "SELECT project_id FROM project_groups WHERE group_id = ?1",
    )?;

    let project_ids = statement
        .query_map([group_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(project_ids)
}

fn get_skill_group(connection: &Connection, id: &str) -> Result<SkillGroup, SkillGroupError> {
    let header = connection.query_row(
        "SELECT id, name, type, file, description, version, total_skills, created_at, updated_at
        FROM skill_groups
        WHERE id = ?1",
        [id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
            ))
        },
    )?;

    hydrate_group(connection, header.0, header.1, header.2, header.3, header.4, header.5, header.6, header.7, header.8)
}

fn hydrate_group(
    connection: &Connection,
    id: String,
    name: String,
    group_type: String,
    file: Option<String>,
    description: String,
    version: Option<String>,
    total_skills: i64,
    created_at: String,
    updated_at: String,
) -> Result<SkillGroup, SkillGroupError> {
    let project_usages = list_project_usages(connection, &id)?;
    let active_project_count = project_usages.iter().filter(|usage| usage.enabled).count() as i64;
    let attached_project_count = project_usages.len() as i64;

    Ok(SkillGroup {
        skills: list_group_skills(connection, &id)?,
        project_usages,
        active_project_count,
        attached_project_count,
        id,
        name,
        group_type,
        file,
        description,
        version,
        total_skills,
        created_at,
        updated_at,
    })
}

fn list_group_skills(
    connection: &Connection,
    group_id: &str,
) -> Result<Vec<GroupSkill>, SkillGroupError> {
    let mut statement = connection.prepare(
        "SELECT skills.id, skills.name, skills.source_type, skills.source_ref, skills.skill_path
        FROM skills
        INNER JOIN skill_group_skills ON skill_group_skills.skill_id = skills.id
        WHERE skill_group_skills.group_id = ?1
        ORDER BY skills.name ASC, skills.source_ref ASC, skills.skill_path ASC",
    )?;

    let skills = statement
        .query_map([group_id], |row| {
            Ok(GroupSkill {
                id: row.get(0)?,
                name: row.get(1)?,
                source_type: row.get(2)?,
                source_ref: row.get(3)?,
                skill_path: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(SkillGroupError::from)?;

    Ok(skills)
}

fn list_project_usages(
    connection: &Connection,
    group_id: &str,
) -> Result<Vec<ProjectGroupUsage>, SkillGroupError> {
    let mut statement = connection.prepare(
        "SELECT
            projects.id,
            projects.name,
            projects.path,
            project_groups.enabled
        FROM project_groups
        INNER JOIN projects ON projects.id = project_groups.project_id
        WHERE project_groups.group_id = ?1
        ORDER BY projects.name ASC, projects.path ASC",
    )?;

    let usages = statement
        .query_map([group_id], |row| {
            Ok(ProjectGroupUsage {
                project_id: row.get(0)?,
                project_name: row.get(1)?,
                project_path: row.get(2)?,
                enabled: row.get::<_, i64>(3)? == 1,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(SkillGroupError::from)?;

    Ok(usages)
}

fn normalize_group_input(input: SkillGroupInput) -> Result<SkillGroupInput, SkillGroupError> {
    let name = input.name.trim().to_string();

    if name.is_empty() {
        return Err(SkillGroupError::GroupNameRequired);
    }

    Ok(SkillGroupInput {
        name,
        description: input.description,
    })
}

fn stable_id(prefix: &str, value: &str) -> String {
    stable_prefixed_id(prefix, value)
}

fn project_skill_id(project_id: &str, skill_id: &str) -> String {
    stable_prefixed_id("project-skill", &format!("{project_id}|{skill_id}"))
}

// ---------------------------------------------------------------------------
// Collection group operations
// ---------------------------------------------------------------------------

fn collection_group_id(file: &str) -> String {
    crate::domain::ids::short_stable_hash(file)
}

pub fn install_collection_group(
    connection: &Connection,
    managed_skills_root: PathBuf,
    detail: &crate::collections::CollectionDetail,
    file: &str,
    progress: &Option<tauri::ipc::Channel<CollectionInstallProgress>>,
) -> Result<SkillGroup, SkillGroupError> {
    let group_id = collection_group_id(file);

    // Remove stale collection groups that hold the same file (handles id drift)
    connection.execute(
        "DELETE FROM skill_groups WHERE file = ?1 AND id != ?2",
        rusqlite::params![file, group_id],
    )?;

    // Also handle name conflict for existing manual groups with same name
    connection.execute(
        "DELETE FROM skill_groups WHERE name = ?1 AND id != ?2 AND type = 'manual'",
        rusqlite::params![detail.title, group_id],
    )?;

    // Upsert group row
    connection.execute(
        "INSERT INTO skill_groups (id, name, type, file, description, version, total_skills)
         VALUES (?1, ?2, 'collection', ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           version = excluded.version,
           total_skills = excluded.total_skills,
           updated_at = CURRENT_TIMESTAMP",
        rusqlite::params![
            group_id,
            detail.title,
            file,
            detail.description,
            detail.version,
            detail.skills.len() as i64
        ],
    )?;

    // Clear existing group skills for reinstall
    connection.execute(
        "DELETE FROM skill_group_skills WHERE group_id = ?1",
        [&group_id],
    )?;

    let total = detail.skills.len();

    for (i, skill_entry) in detail.skills.iter().enumerate() {
        send_group_progress(
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

        // Check if skill already exists
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
            .map_err(|e| SkillGroupError::RepositorySource(e.to_string()))?;

            if let Some(snapshot) = installed.into_iter().next() {
                snapshot.id
            } else {
                continue;
            }
        };

        // Link skill to group
        connection.execute(
            "INSERT OR IGNORE INTO skill_group_skills (group_id, skill_id)
             VALUES (?1, ?2)",
            rusqlite::params![group_id, skill_id],
        )?;
    }

    get_skill_group(connection, &group_id)
}

pub fn update_collection_group(
    connection: &Connection,
    managed_skills_root: PathBuf,
    group_id: &str,
    new_detail: &crate::collections::CollectionDetail,
    progress: &Option<tauri::ipc::Channel<CollectionInstallProgress>>,
) -> Result<SkillGroup, SkillGroupError> {
    // Get current skill names in this group
    let old_skills = get_group_skill_names(connection, group_id)?;
    let new_skill_names: std::collections::HashSet<&str> =
        new_detail.skills.iter().map(|s| s.name.as_str()).collect();
    let old_skill_names: std::collections::HashSet<&str> =
        old_skills.iter().map(|s| s.as_str()).collect();

    // Skills to add (in new but not in old)
    let to_add: Vec<&crate::collections::CollectionSkillEntry> = new_detail
        .skills
        .iter()
        .filter(|s| !old_skill_names.contains(s.name.as_str()))
        .collect();

    // Skills to remove (in old but not in new)
    let to_remove: Vec<String> = old_skills
        .into_iter()
        .filter(|s| !new_skill_names.contains(s.as_str()))
        .collect();

    let total = to_add.len();
    for (i, skill_entry) in to_add.iter().enumerate() {
        send_group_progress(
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
            .map_err(|e| SkillGroupError::RepositorySource(e.to_string()))?;

            if let Some(snapshot) = installed.into_iter().next() {
                snapshot.id
            } else {
                continue;
            }
        };

        connection.execute(
            "INSERT OR IGNORE INTO skill_group_skills (group_id, skill_id)
             VALUES (?1, ?2)",
            rusqlite::params![group_id, skill_id],
        )?;
    }

    // Remove skills no longer in the collection
    for skill_name in &to_remove {
        if let Ok(skill_id) = connection.query_row(
            "SELECT id FROM skills WHERE name = ?1",
            [skill_name],
            |row| row.get::<_, String>(0),
        ) {
            connection.execute(
                "DELETE FROM skill_group_skills WHERE group_id = ?1 AND skill_id = ?2",
                rusqlite::params![group_id, skill_id],
            )?;

            // Clean up project_skills for this group's skills
            remove_orphaned_group_skill_from_projects(connection, group_id, &skill_id)?;
        }
    }

    // Update group version and total_skills
    connection.execute(
        "UPDATE skill_groups SET version = ?1, total_skills = ?2, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?3",
        rusqlite::params![new_detail.version, new_detail.skills.len() as i64, group_id],
    )?;

    get_skill_group(connection, group_id)
}

fn get_group_skill_names(
    connection: &Connection,
    group_id: &str,
) -> Result<Vec<String>, SkillGroupError> {
    let mut stmt = connection.prepare(
        "SELECT s.name FROM skill_group_skills sgs
         JOIN skills s ON s.id = sgs.skill_id
         WHERE sgs.group_id = ?1",
    )?;

    let names = stmt
        .query_map([group_id], |row| row.get(0))?
        .collect::<Result<Vec<String>, _>>()?;

    Ok(names)
}

fn send_group_progress(
    channel: &Option<tauri::ipc::Channel<CollectionInstallProgress>>,
    progress: CollectionInstallProgress,
) {
    if let Some(ch) = channel {
        let _ = ch.send(progress);
    }
}

#[tauri::command]
pub async fn install_collection_group_record(
    file: String,
    on_progress: tauri::ipc::Channel<CollectionInstallProgress>,
) -> Result<SkillGroup, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let database_path =
            crate::app_paths::database_path().map_err(|error| error.to_string())?;
        let connection =
            crate::db::open_database(database_path).map_err(|error| error.to_string())?;
        let managed_skills_root =
            crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;

        let detail =
            crate::collections::fetch_collection_detail(&file).map_err(|error| error.to_string())?;

        let progress = Some(on_progress);
        install_collection_group(&connection, managed_skills_root, &detail, &file, &progress)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn update_collection_group_record(
    group_id: String,
    on_progress: tauri::ipc::Channel<CollectionInstallProgress>,
) -> Result<SkillGroup, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let database_path =
            crate::app_paths::database_path().map_err(|error| error.to_string())?;
        let connection =
            crate::db::open_database(database_path).map_err(|error| error.to_string())?;
        let managed_skills_root =
            crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;

        // Get the file from the group to fetch latest detail
        let file: String = connection
            .query_row(
                "SELECT file FROM skill_groups WHERE id = ?1 AND type = 'collection'",
                [&group_id],
                |row| row.get(0),
            )
            .map_err(|error| error.to_string())?;

        let detail =
            crate::collections::fetch_collection_detail(&file).map_err(|error| error.to_string())?;

        let progress = Some(on_progress);
        update_collection_group(&connection, managed_skills_root, &group_id, &detail, &progress)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportGroupInput {
    pub group_id: String,
    pub file_name: String,
    pub title: String,
    pub description: String,
    pub export_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportGroupResult {
    pub file_path: String,
}

#[tauri::command]
pub fn export_group_to_json(input: ExportGroupInput) -> Result<ExportGroupResult, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    let group = get_skill_group(&connection, &input.group_id).map_err(|error| error.to_string())?;

    let export_data = serde_json::json!({
        "title": input.title,
        "description": input.description,
        "version": group.version.unwrap_or_else(|| "0.0.1".to_string()),
        "skills": group.skills.iter().map(|skill| {
            serde_json::json!({
                "name": skill.name,
                "description": "",
                "source_type": skill.source_type,
                "source_ref": skill.source_ref
            })
        }).collect::<Vec<_>>()
    });

    let export_path = std::path::Path::new(&input.export_path);
    let file_name = if input.file_name.ends_with(".json") {
        input.file_name
    } else {
        format!("{}.json", input.file_name)
    };
    let file_path = export_path.join(&file_name);

    let json_string = serde_json::to_string_pretty(&export_data)
        .map_err(|error| error.to_string())?;

    std::fs::write(&file_path, json_string).map_err(|error| error.to_string())?;

    Ok(ExportGroupResult {
        file_path: file_path.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::{
        add_skill_to_group, create_skill_group, delete_skill_group, list_skill_groups,
        remove_skill_from_group, SkillGroupInput,
    };

    #[test]
    fn creates_group_without_legacy_project_targets() {
        let connection = open_project_only_database();

        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Project Agents".to_string(),
            },
        )
        .expect("group should create");

        assert_eq!(group.name, "Project Agents");
        assert!(group.skills.is_empty());
        assert_eq!(group.active_project_count, 0);
        assert_eq!(group.attached_project_count, 0);
        assert!(group.project_usages.is_empty());
    }

    #[test]
    fn deleting_group_keeps_skills_and_removes_project_usage_rows() {
        let connection = open_project_only_database();
        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Workspace Group".to_string(),
            },
        )
        .expect("group should create");
        connection
            .execute(
                "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
                (
                    "project-one",
                    "Skills Manager",
                    "D:/Development/nodejs/SkillsManager",
                ),
            )
            .expect("project should insert");
        connection
            .execute(
                "INSERT INTO project_groups (id, project_id, group_id, enabled)
                VALUES (?1, ?2, ?3, 1)",
                ("project-group-one", "project-one", &group.id),
            )
            .expect("project group should insert");

        delete_skill_group(&connection, &group.id).expect("group should delete");

        let retained_projects: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE id = 'project-one'",
                [],
                |row| row.get(0),
            )
            .expect("project count should query");
        let retained_usage_rows: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM project_groups WHERE group_id = ?1",
                [&group.id],
                |row| row.get(0),
            )
            .expect("usage count should query");

        assert_eq!(retained_projects, 1);
        assert_eq!(retained_usage_rows, 0);
    }

    #[test]
    fn adds_installed_skill_to_group_without_legacy_link_mode() {
        let connection = open_project_only_database();
        connection
            .execute(
                "INSERT INTO skills (
                    id,
                    name,
                    source_type,
                    source_ref,
                    skill_path,
                    managed_dir_name
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                (
                    "skill-grill",
                    "grill-with-docs",
                    "github",
                    "owner/repo",
                    "skills/grill-with-docs",
                    "grill-with-docs-499b7424",
                ),
            )
            .expect("skill should insert");
        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Docs Group".to_string(),
            },
        )
        .expect("group should create");

        let group =
            add_skill_to_group(&connection, &group.id, "skill-grill").expect("skill should attach");

        assert_eq!(group.skills.len(), 1);
        assert_eq!(group.skills[0].id, "skill-grill");
        assert_eq!(group.skills[0].name, "grill-with-docs");
        assert_eq!(group.skills[0].source_type, "github");
        assert_eq!(group.skills[0].source_ref, "owner/repo");
        assert_eq!(group.skills[0].skill_path, "skills/grill-with-docs");

        delete_skill_group(&connection, &group.id).expect("group should delete");

        let retained_skills: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE id = 'skill-grill'",
                [],
                |row| row.get(0),
            )
            .expect("skill count should query");
        let retained_links: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_group_skills WHERE group_id = ?1",
                [&group.id],
                |row| row.get(0),
            )
            .expect("association count should query");

        assert_eq!(retained_skills, 1);
        assert_eq!(retained_links, 0);
    }

    #[test]
    fn removing_skill_from_group_keeps_skill_record_and_updates_membership() {
        let connection = open_project_only_database();
        connection
            .execute(
                "INSERT INTO skills (
                    id,
                    name,
                    source_type,
                    source_ref,
                    skill_path,
                    managed_dir_name
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                (
                    "skill-remove",
                    "systematic-debugging",
                    "github",
                    "owner/repo",
                    "skills/systematic-debugging",
                    "systematic-debugging-499b7424",
                ),
            )
            .expect("skill should insert");
        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Debug Group".to_string(),
            },
        )
        .expect("group should create");
        add_skill_to_group(&connection, &group.id, "skill-remove").expect("skill should attach");

        let updated = remove_skill_from_group(&connection, &group.id, "skill-remove")
            .expect("skill should detach");

        assert!(updated.skills.is_empty());

        let retained_skills: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE id = 'skill-remove'",
                [],
                |row| row.get(0),
            )
            .expect("skill count should query");
        let retained_links: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_group_skills WHERE group_id = ?1",
                [&group.id],
                |row| row.get(0),
            )
            .expect("association count should query");

        assert_eq!(retained_skills, 1);
        assert_eq!(retained_links, 0);
    }

    #[test]
    fn lists_groups_with_skills_and_project_usage_counts() {
        let connection = open_project_only_database();
        connection
            .execute(
                "INSERT INTO skills (
                    id,
                    name,
                    source_type,
                    source_ref,
                    skill_path,
                    managed_dir_name
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                (
                    "skill-review",
                    "requesting-code-review",
                    "github",
                    "owner/repo",
                    "skills/requesting-code-review",
                    "requesting-code-review-499b7424",
                ),
            )
            .expect("skill should insert");
        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Review Group".to_string(),
            },
        )
        .expect("group should create");
        add_skill_to_group(&connection, &group.id, "skill-review").expect("skill should attach");
        connection
            .execute(
                "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3), (?4, ?5, ?6)",
                (
                    "project-one",
                    "Skills Manager",
                    "D:/Development/nodejs/SkillsManager",
                    "project-two",
                    "Docs Site",
                    "D:/Development/docs/site",
                ),
            )
            .expect("projects should insert");
        connection
            .execute(
                "INSERT INTO project_groups (id, project_id, group_id, enabled)
                VALUES (?1, ?2, ?3, 1), (?4, ?5, ?6, 0)",
                (
                    "project-group-one",
                    "project-one",
                    &group.id,
                    "project-group-two",
                    "project-two",
                    &group.id,
                ),
            )
            .expect("project usage rows should insert");

        let groups = list_skill_groups(&connection).expect("groups should list");

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].name, "Review Group");
        assert_eq!(groups[0].skills.len(), 1);
        assert_eq!(groups[0].active_project_count, 1);
        assert_eq!(groups[0].attached_project_count, 2);
        assert_eq!(groups[0].project_usages.len(), 2);
        assert_eq!(groups[0].project_usages[0].project_name, "Docs Site");
        assert!(!groups[0].project_usages[0].enabled);
        assert_eq!(groups[0].project_usages[1].project_name, "Skills Manager");
        assert!(groups[0].project_usages[1].enabled);
    }

    fn open_project_only_database() -> Connection {
        let connection = Connection::open_in_memory().expect("database should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(crate::db::CURRENT_SCHEMA)
            .expect("current schema should apply");
        connection
    }
}

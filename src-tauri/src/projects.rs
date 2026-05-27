use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_dialog::FilePath;
use thiserror::Error;

use crate::domain::ids::stable_prefixed_id;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectInput {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Error)]
pub enum ProjectError {
    #[error("project name is required")]
    NameRequired,
    #[error("project path is required")]
    PathRequired,
    #[error("project path does not exist: {0}")]
    PathDoesNotExist(String),
    #[error("project path is not a directory: {0}")]
    PathNotDirectory(String),
    #[error("failed to open project directory: {0}")]
    OpenDirectory(String),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub fn list_projects(connection: &Connection) -> Result<Vec<ProjectRecord>, ProjectError> {
    let mut statement = connection.prepare(
        "SELECT id, name, path, created_at, updated_at
        FROM projects
        ORDER BY name ASC, path ASC",
    )?;

    let projects = statement
        .query_map([], project_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(projects)
}

pub fn create_project(
    connection: &Connection,
    input: ProjectInput,
) -> Result<ProjectRecord, ProjectError> {
    let input = normalize_input(input)?;
    let id = project_id(&input.path);

    connection.execute(
        "INSERT INTO projects (id, name, path)
        VALUES (?1, ?2, ?3)",
        (&id, &input.name, &input.path),
    )?;

    get_project(connection, &id)
}

pub fn get_project(connection: &Connection, id: &str) -> Result<ProjectRecord, ProjectError> {
    connection
        .query_row(
            "SELECT id, name, path, created_at, updated_at
            FROM projects
            WHERE id = ?1",
            [id],
            project_from_row,
        )
        .map_err(ProjectError::from)
}

pub fn update_project(
    connection: &Connection,
    id: &str,
    input: ProjectInput,
) -> Result<ProjectRecord, ProjectError> {
    let input = normalize_input(input)?;

    connection.execute(
        "UPDATE projects
        SET name = ?1, path = ?2, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?3",
        (&input.name, &input.path, id),
    )?;

    get_project(connection, id)
}

pub fn delete_project(connection: &Connection, id: &str) -> Result<(), ProjectError> {
    connection.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

#[tauri::command]
pub fn list_project_records() -> Result<Vec<ProjectRecord>, String> {
    with_database(|connection| list_projects(connection))
}

#[tauri::command]
pub fn select_directory(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let selected = app.dialog().file().blocking_pick_folder();

    Ok(selected.map(file_path_to_string))
}

#[tauri::command]
pub fn create_project_record(input: ProjectInput) -> Result<ProjectRecord, String> {
    with_database(|connection| create_project(connection, input))
}

#[tauri::command]
pub fn open_project_directory(path: String) -> Result<(), String> {
    open_project_directory_in_file_manager(&path).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_project_record(id: String) -> Result<ProjectRecord, String> {
    with_database(|connection| get_project(connection, &id))
}

#[tauri::command]
pub fn update_project_record(id: String, input: ProjectInput) -> Result<ProjectRecord, String> {
    with_database(|connection| update_project(connection, &id, input))
}

#[tauri::command]
pub fn delete_project_record(id: String) -> Result<(), String> {
    with_database(|connection| delete_project(connection, &id))
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, ProjectError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn project_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectRecord> {
    Ok(ProjectRecord {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn normalize_input(input: ProjectInput) -> Result<ProjectInput, ProjectError> {
    let name = input.name.trim().to_string();
    let path = input.path.trim().to_string();

    if name.is_empty() {
        return Err(ProjectError::NameRequired);
    }

    if path.is_empty() {
        return Err(ProjectError::PathRequired);
    }

    Ok(ProjectInput { name, path })
}

fn project_id(path: &str) -> String {
    stable_prefixed_id("project", path)
}

fn open_project_directory_in_file_manager(path: &str) -> Result<(), ProjectError> {
    let normalized = path.trim();
    if normalized.is_empty() {
        return Err(ProjectError::PathRequired);
    }

    let project_path = Path::new(normalized);
    if !project_path.exists() {
        return Err(ProjectError::PathDoesNotExist(normalized.to_string()));
    }
    if !project_path.is_dir() {
        return Err(ProjectError::PathNotDirectory(normalized.to_string()));
    }

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        command.arg(project_path);
        command
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        command.arg(project_path);
        command
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        command.arg(project_path);
        command
    };

    // Windows explorer.exe returns exit code 1 even on success, so skip the exit-code check.
    #[cfg(target_os = "windows")]
    {
        command
            .status()
            .map_err(|error| ProjectError::OpenDirectory(error.to_string()))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = command
            .status()
            .map_err(|error| ProjectError::OpenDirectory(error.to_string()))?;

        if status.success() {
            Ok(())
        } else {
            Err(ProjectError::OpenDirectory(format!(
                "command exited with status {status}"
            )))
        }
    }
}

fn file_path_to_string(path: FilePath) -> String {
    path.into_path()
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|value| value.to_string())
}

#[cfg(test)]
mod tests {
    use super::{
        create_project, delete_project, get_project, list_projects,
        open_project_directory_in_file_manager, update_project, ProjectInput,
    };
    use rusqlite::Connection;
    use std::path::PathBuf;

    use crate::db::CURRENT_SCHEMA;

    #[test]
    fn creates_lists_gets_updates_and_deletes_projects() {
        let connection = open_project_only_in_memory_database();

        let created = create_project(
            &connection,
            ProjectInput {
                name: "  My Project  ".to_string(),
                path: "  D:/Code/my-project  ".to_string(),
            },
        )
        .expect("project should create");

        assert_eq!(created.name, "My Project");
        assert_eq!(created.path, "D:/Code/my-project");

        let listed = list_projects(&connection).expect("projects should list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0], created);

        let fetched = get_project(&connection, &created.id).expect("project should fetch");
        assert_eq!(fetched, created);

        let updated = update_project(
            &connection,
            &created.id,
            ProjectInput {
                name: "Workspace".to_string(),
                path: "D:/Code/workspace".to_string(),
            },
        )
        .expect("project should update");

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.name, "Workspace");
        assert_eq!(updated.path, "D:/Code/workspace");

        let listed_after_update = list_projects(&connection).expect("projects should relist");
        assert_eq!(listed_after_update.len(), 1);
        assert_eq!(listed_after_update[0], updated);

        delete_project(&connection, &created.id).expect("project should delete");
        let listed_after_delete = list_projects(&connection).expect("projects should be empty");
        assert!(listed_after_delete.is_empty());
    }

    #[test]
    fn rejects_duplicate_project_paths() {
        let connection = open_project_only_in_memory_database();

        create_project(
            &connection,
            ProjectInput {
                name: "Project One".to_string(),
                path: "D:/Code/shared".to_string(),
            },
        )
        .expect("first project should create");

        let duplicate = create_project(
            &connection,
            ProjectInput {
                name: "Project Two".to_string(),
                path: "D:/Code/shared".to_string(),
            },
        );

        assert!(duplicate.is_err());
    }

    #[test]
    fn deleting_project_cascades_project_only_records_without_touching_filesystem() {
        let connection = open_project_only_in_memory_database();

        let project = create_project(
            &connection,
            ProjectInput {
                name: "Workspace".to_string(),
                path: "D:/Code/workspace".to_string(),
            },
        )
        .expect("project should create");

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
                    "skill-one",
                    "grill-with-docs",
                    "github",
                    "owner/repo",
                    "skills/grill-with-docs",
                    "grill-with-docs-499b7424",
                ),
            )
            .expect("skill should insert");
        connection
            .execute(
                "INSERT INTO skill_groups (id, name) VALUES (?1, ?2)",
                ("group-one", "Frontend"),
            )
            .expect("group should insert");
        connection
            .execute(
                "INSERT INTO project_skills (id, project_id, skill_id, enabled)
                VALUES (?1, ?2, ?3, 1)",
                ("project-skill-one", &project.id, "skill-one"),
            )
            .expect("project skill should insert");
        connection
            .execute(
                "INSERT INTO project_groups (id, project_id, group_id, enabled)
                VALUES (?1, ?2, ?3, 1)",
                ("project-group-one", &project.id, "group-one"),
            )
            .expect("project group should insert");
        connection
            .execute(
                "INSERT INTO project_cli_targets (id, project_id, cli_target_id)
                VALUES (?1, ?2, ?3)",
                ("project-target-one", &project.id, "agents-skills"),
            )
            .expect("project cli target should insert");

        delete_project(&connection, &project.id).expect("project should delete");

        assert_eq!(count_rows(&connection, "projects"), 0);
        assert_eq!(count_rows(&connection, "project_skills"), 0);
        assert_eq!(count_rows(&connection, "project_groups"), 0);
        assert_eq!(count_rows(&connection, "project_cli_targets"), 0);
    }

    #[test]
    fn rejects_opening_a_missing_project_directory() {
        let missing = PathBuf::from("D:/definitely-missing-project-directory");
        let result = open_project_directory_in_file_manager(&missing.to_string_lossy());

        assert!(matches!(
            result,
            Err(super::ProjectError::PathDoesNotExist(_))
        ));
    }

    fn count_rows(connection: &rusqlite::Connection, table: &str) -> i64 {
        connection
            .query_row(&format!("SELECT COUNT(*) FROM {table}"), [], |row| {
                row.get(0)
            })
            .expect("count query should work")
    }

    fn open_project_only_in_memory_database() -> Connection {
        let connection = Connection::open_in_memory().expect("database should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(CURRENT_SCHEMA)
            .expect("current schema should apply");
        connection
    }
}

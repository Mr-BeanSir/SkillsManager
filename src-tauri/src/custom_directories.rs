use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::domain::ids::stable_prefixed_id;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomDirectory {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomDirectoryInput {
    pub name: String,
    pub path: String,
}

#[derive(Debug, Error)]
pub enum CustomDirectoryError {
    #[error("name is required")]
    NameRequired,
    #[error("path is required")]
    PathRequired,
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub fn list_custom_directories(
    connection: &Connection,
) -> Result<Vec<CustomDirectory>, CustomDirectoryError> {
    let mut statement = connection.prepare(
        "SELECT id, name, path, created_at, updated_at
        FROM custom_directories
        ORDER BY name ASC, path ASC",
    )?;

    let directories = statement
        .query_map([], custom_directory_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(directories)
}

pub fn create_custom_directory(
    connection: &Connection,
    input: CustomDirectoryInput,
) -> Result<CustomDirectory, CustomDirectoryError> {
    let input = normalize_input(input)?;
    let id = custom_directory_id(&input.path);

    connection.execute(
        "INSERT INTO custom_directories (id, name, path)
        VALUES (?1, ?2, ?3)",
        (&id, &input.name, &input.path),
    )?;

    get_custom_directory(connection, &id)
}

pub fn update_custom_directory(
    connection: &Connection,
    id: &str,
    input: CustomDirectoryInput,
) -> Result<CustomDirectory, CustomDirectoryError> {
    let input = normalize_input(input)?;

    connection.execute(
        "UPDATE custom_directories
        SET name = ?1, path = ?2, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?3",
        (&input.name, &input.path, id),
    )?;

    get_custom_directory(connection, id)
}

pub fn delete_custom_directory(
    connection: &Connection,
    id: &str,
) -> Result<(), CustomDirectoryError> {
    connection.execute("DELETE FROM custom_directories WHERE id = ?1", [id])?;
    Ok(())
}

#[tauri::command]
pub fn list_custom_directory_records() -> Result<Vec<CustomDirectory>, String> {
    with_database(|connection| list_custom_directories(connection))
}

#[tauri::command]
pub fn create_custom_directory_record(
    input: CustomDirectoryInput,
) -> Result<CustomDirectory, String> {
    with_database(|connection| create_custom_directory(connection, input))
}

#[tauri::command]
pub fn update_custom_directory_record(
    id: String,
    input: CustomDirectoryInput,
) -> Result<CustomDirectory, String> {
    with_database(|connection| update_custom_directory(connection, &id, input))
}

#[tauri::command]
pub fn delete_custom_directory_record(id: String) -> Result<(), String> {
    with_database(|connection| delete_custom_directory(connection, &id))
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, CustomDirectoryError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn get_custom_directory(
    connection: &Connection,
    id: &str,
) -> Result<CustomDirectory, CustomDirectoryError> {
    connection
        .query_row(
            "SELECT id, name, path, created_at, updated_at
            FROM custom_directories
            WHERE id = ?1",
            [id],
            custom_directory_from_row,
        )
        .map_err(CustomDirectoryError::from)
}

fn custom_directory_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CustomDirectory> {
    Ok(CustomDirectory {
        id: row.get(0)?,
        name: row.get(1)?,
        path: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn normalize_input(
    input: CustomDirectoryInput,
) -> Result<CustomDirectoryInput, CustomDirectoryError> {
    let name = input.name.trim().to_string();
    let path = input.path.trim().to_string();

    if name.is_empty() {
        return Err(CustomDirectoryError::NameRequired);
    }

    if path.is_empty() {
        return Err(CustomDirectoryError::PathRequired);
    }

    Ok(CustomDirectoryInput { name, path })
}

fn custom_directory_id(path: &str) -> String {
    stable_prefixed_id("custom-directory", path)
}

#[cfg(test)]
mod tests {
    use super::{
        create_custom_directory, delete_custom_directory, list_custom_directories,
        update_custom_directory, CustomDirectoryInput,
    };
    use crate::db::open_in_memory_database;

    #[test]
    fn creates_and_lists_custom_directories() {
        let connection = open_in_memory_database().expect("database should open");

        let created = create_custom_directory(
            &connection,
            CustomDirectoryInput {
                name: "Codex Global".to_string(),
                path: "D:\\AgentTargets\\codex".to_string(),
            },
        )
        .expect("directory should be created");
        let directories = list_custom_directories(&connection).expect("directories should list");

        assert_eq!(directories, vec![created.clone()]);
        assert_eq!(created.name, "Codex Global");
        assert_eq!(created.path, "D:\\AgentTargets\\codex");
        assert!(!created.id.is_empty());
    }

    #[test]
    fn trims_input_and_rejects_empty_values() {
        let connection = open_in_memory_database().expect("database should open");

        let created = create_custom_directory(
            &connection,
            CustomDirectoryInput {
                name: "  Shared Agents  ".to_string(),
                path: "  C:\\Shared\\.agents\\skills  ".to_string(),
            },
        )
        .expect("directory should be created");

        assert_eq!(created.name, "Shared Agents");
        assert_eq!(created.path, "C:\\Shared\\.agents\\skills");

        let error = create_custom_directory(
            &connection,
            CustomDirectoryInput {
                name: " ".to_string(),
                path: "C:\\Shared".to_string(),
            },
        )
        .expect_err("empty name should fail");

        assert_eq!(error.to_string(), "name is required");
    }

    #[test]
    fn updates_custom_directory_by_id() {
        let connection = open_in_memory_database().expect("database should open");
        let created = create_custom_directory(
            &connection,
            CustomDirectoryInput {
                name: "Old".to_string(),
                path: "C:\\Old".to_string(),
            },
        )
        .expect("directory should be created");

        let updated = update_custom_directory(
            &connection,
            &created.id,
            CustomDirectoryInput {
                name: "New".to_string(),
                path: "C:\\New".to_string(),
            },
        )
        .expect("directory should update");

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.name, "New");
        assert_eq!(updated.path, "C:\\New");
    }

    #[test]
    fn deletes_custom_directory_record_without_touching_filesystem_path() {
        let connection = open_in_memory_database().expect("database should open");
        let created = create_custom_directory(
            &connection,
            CustomDirectoryInput {
                name: "Exact Target".to_string(),
                path: "C:\\TargetThatDoesNotNeedToExist".to_string(),
            },
        )
        .expect("directory should be created");

        delete_custom_directory(&connection, &created.id).expect("directory should delete");

        assert!(list_custom_directories(&connection)
            .expect("directories should list")
            .is_empty());
    }
}

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::domain::ids::stable_prefixed_id;

const BUILT_IN_CLI_TARGET_IDS: [&str; 3] = ["agents-skills", "claude-code-skills", "codex-skills"];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliTargetRecord {
    pub id: String,
    pub display_name: String,
    pub relative_path: String,
    pub is_common: bool,
    pub is_built_in: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliTargetInput {
    pub display_name: String,
    pub relative_path: String,
}

#[derive(Debug, Error)]
pub enum CliTargetError {
    #[error("cli target display name is required")]
    DisplayNameRequired,
    #[error("cli target relative path is required")]
    RelativePathRequired,
    #[error("built-in cli targets cannot be changed")]
    BuiltInReadOnly,
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub fn list_cli_targets(connection: &Connection) -> Result<Vec<CliTargetRecord>, CliTargetError> {
    let mut statement = connection.prepare(
        "SELECT
            id,
            display_name,
            relative_path,
            is_common,
            created_at,
            updated_at
        FROM cli_targets
        ORDER BY is_common DESC, display_name ASC, id ASC",
    )?;

    let targets = statement
        .query_map([], cli_target_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(targets)
}

pub fn create_cli_target(
    connection: &Connection,
    input: CliTargetInput,
) -> Result<CliTargetRecord, CliTargetError> {
    let input = normalize_input(input)?;
    let id = cli_target_id(&input.relative_path);

    connection.execute(
        "INSERT INTO cli_targets (id, display_name, relative_path, is_common)
        VALUES (?1, ?2, ?3, 0)",
        (&id, &input.display_name, &input.relative_path),
    )?;

    get_cli_target(connection, &id)
}

pub fn update_cli_target(
    connection: &Connection,
    cli_target_id: &str,
    input: CliTargetInput,
) -> Result<CliTargetRecord, CliTargetError> {
    if is_built_in_cli_target(cli_target_id) {
        return Err(CliTargetError::BuiltInReadOnly);
    }

    let input = normalize_input(input)?;

    connection.execute(
        "UPDATE cli_targets
        SET display_name = ?1, relative_path = ?2, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?3",
        (&input.display_name, &input.relative_path, cli_target_id),
    )?;

    get_cli_target(connection, cli_target_id)
}

pub fn delete_cli_target(
    connection: &Connection,
    cli_target_id: &str,
) -> Result<(), CliTargetError> {
    if is_built_in_cli_target(cli_target_id) {
        return Err(CliTargetError::BuiltInReadOnly);
    }

    connection.execute("DELETE FROM cli_targets WHERE id = ?1", [cli_target_id])?;
    Ok(())
}

#[tauri::command]
pub fn list_cli_target_records() -> Result<Vec<CliTargetRecord>, String> {
    with_database(list_cli_targets)
}

#[tauri::command]
pub fn create_cli_target_record(input: CliTargetInput) -> Result<CliTargetRecord, String> {
    with_database(|connection| create_cli_target(connection, input))
}

#[tauri::command]
pub fn update_cli_target_record(
    cli_target_id: String,
    input: CliTargetInput,
) -> Result<CliTargetRecord, String> {
    with_database(|connection| update_cli_target(connection, &cli_target_id, input))
}

#[tauri::command]
pub fn delete_cli_target_record(cli_target_id: String) -> Result<(), String> {
    with_database(|connection| delete_cli_target(connection, &cli_target_id))
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, CliTargetError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn get_cli_target(
    connection: &Connection,
    cli_target_id: &str,
) -> Result<CliTargetRecord, CliTargetError> {
    connection
        .query_row(
            "SELECT
                id,
                display_name,
                relative_path,
                is_common,
                created_at,
                updated_at
            FROM cli_targets
            WHERE id = ?1",
            [cli_target_id],
            cli_target_from_row,
        )
        .map_err(CliTargetError::from)
}

fn cli_target_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<CliTargetRecord> {
    let id = row.get::<_, String>(0)?;

    Ok(CliTargetRecord {
        is_built_in: is_built_in_cli_target(&id),
        id,
        display_name: row.get(1)?,
        relative_path: row.get(2)?,
        is_common: row.get::<_, i64>(3)? == 1,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn normalize_input(input: CliTargetInput) -> Result<CliTargetInput, CliTargetError> {
    let display_name = input.display_name.trim().to_string();
    let relative_path = input.relative_path.trim().to_string();

    if display_name.is_empty() {
        return Err(CliTargetError::DisplayNameRequired);
    }

    if relative_path.is_empty() {
        return Err(CliTargetError::RelativePathRequired);
    }

    Ok(CliTargetInput {
        display_name,
        relative_path,
    })
}

fn cli_target_id(relative_path: &str) -> String {
    stable_prefixed_id("cli-target", relative_path)
}

fn is_built_in_cli_target(cli_target_id: &str) -> bool {
    BUILT_IN_CLI_TARGET_IDS.contains(&cli_target_id)
}

#[cfg(test)]
mod tests {
    use super::{
        create_cli_target, delete_cli_target, list_cli_targets, update_cli_target, CliTargetError,
        CliTargetInput,
    };
    use rusqlite::Connection;

    use crate::db::CURRENT_SCHEMA;

    #[test]
    fn lists_seeded_built_in_cli_targets() {
        let connection = open_project_only_in_memory_database();

        let listed = list_cli_targets(&connection).expect("cli targets should list");

        assert_eq!(listed.len(), 3);
        assert_eq!(listed[0].id, "agents-skills");
        assert_eq!(listed[1].id, "claude-code-skills");
        assert_eq!(listed[2].id, "codex-skills");
        assert!(listed.iter().all(|target| target.is_built_in));
    }

    #[test]
    fn creates_updates_and_deletes_custom_cli_targets() {
        let connection = open_project_only_in_memory_database();

        let created = create_cli_target(
            &connection,
            CliTargetInput {
                display_name: "  Team Skills  ".to_string(),
                relative_path: "  tools/skills  ".to_string(),
            },
        )
        .expect("cli target should create");
        assert_eq!(created.display_name, "Team Skills");
        assert_eq!(created.relative_path, "tools/skills");
        assert!(!created.is_built_in);

        let updated = update_cli_target(
            &connection,
            &created.id,
            CliTargetInput {
                display_name: "Workspace Skills".to_string(),
                relative_path: "workspace/skills".to_string(),
            },
        )
        .expect("cli target should update");
        assert_eq!(updated.display_name, "Workspace Skills");
        assert_eq!(updated.relative_path, "workspace/skills");

        delete_cli_target(&connection, &created.id).expect("cli target should delete");
        let relisted = list_cli_targets(&connection).expect("cli targets should relist");
        assert_eq!(relisted.len(), 3);
    }

    #[test]
    fn prevents_mutating_built_in_cli_targets() {
        let connection = open_project_only_in_memory_database();

        let updated = update_cli_target(
            &connection,
            "agents-skills",
            CliTargetInput {
                display_name: "Changed".to_string(),
                relative_path: ".agents/custom".to_string(),
            },
        );
        let deleted = delete_cli_target(&connection, "agents-skills");

        assert!(matches!(updated, Err(CliTargetError::BuiltInReadOnly)));
        assert!(matches!(deleted, Err(CliTargetError::BuiltInReadOnly)));
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

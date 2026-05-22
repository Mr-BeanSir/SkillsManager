use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsRecord {
    pub auto_reconcile: bool,
    pub discover_page_size: u32,
    pub launch_at_startup: bool,
    pub silent_start: bool,
}

#[derive(Debug, Error)]
pub enum SettingsError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("discover page size must be between 1 and 100")]
    InvalidDiscoverPageSize,
}

pub fn read_settings(connection: &Connection) -> Result<SettingsRecord, SettingsError> {
    let auto_reconcile = read_boolean_setting(connection, "auto_reconcile", true)?;
    let discover_page_size = connection
        .query_row(
            "SELECT value FROM settings WHERE key = 'discover_page_size'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .and_then(|value| {
            value
                .trim()
                .parse::<u32>()
                .ok()
                .filter(|page_size| (1..=100).contains(page_size))
        })
        .unwrap_or(25);
    let launch_at_startup = read_boolean_setting(connection, "launch_at_startup", false)?;
    let silent_start = read_boolean_setting(connection, "silent_start", false)?;

    Ok(SettingsRecord {
        auto_reconcile,
        discover_page_size,
        launch_at_startup,
        silent_start,
    })
}

pub fn update_auto_reconcile(
    connection: &Connection,
    enabled: bool,
) -> Result<SettingsRecord, SettingsError> {
    connection.execute(
        "INSERT INTO settings (key, value)
        VALUES ('auto_reconcile', ?1)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP",
        [if enabled { "true" } else { "false" }],
    )?;

    read_settings(connection)
}

pub fn update_discover_page_size(
    connection: &Connection,
    page_size: u32,
) -> Result<SettingsRecord, SettingsError> {
    if !(1..=100).contains(&page_size) {
        return Err(SettingsError::InvalidDiscoverPageSize);
    }

    connection.execute(
        "INSERT INTO settings (key, value)
        VALUES ('discover_page_size', ?1)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP",
        [page_size.to_string()],
    )?;

    read_settings(connection)
}

pub fn update_launch_at_startup(
    connection: &Connection,
    enabled: bool,
) -> Result<SettingsRecord, SettingsError> {
    write_boolean_setting(connection, "launch_at_startup", enabled)?;
    read_settings(connection)
}

pub fn update_silent_start(
    connection: &Connection,
    enabled: bool,
) -> Result<SettingsRecord, SettingsError> {
    write_boolean_setting(connection, "silent_start", enabled)?;
    read_settings(connection)
}

#[tauri::command]
pub fn get_settings_record() -> Result<SettingsRecord, String> {
    with_database(read_settings)
}

#[tauri::command]
pub fn update_auto_reconcile_record(enabled: bool) -> Result<SettingsRecord, String> {
    with_database(|connection| update_auto_reconcile(connection, enabled))
}

#[tauri::command]
pub fn update_discover_page_size_record(page_size: u32) -> Result<SettingsRecord, String> {
    with_database(|connection| update_discover_page_size(connection, page_size))
}

#[tauri::command]
pub fn update_launch_at_startup_record(enabled: bool) -> Result<SettingsRecord, String> {
    with_database(|connection| update_launch_at_startup(connection, enabled))
}

#[tauri::command]
pub fn update_silent_start_record(enabled: bool) -> Result<SettingsRecord, String> {
    with_database(|connection| update_silent_start(connection, enabled))
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, SettingsError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn read_boolean_setting(
    connection: &Connection,
    key: &str,
    default_value: bool,
) -> Result<bool, SettingsError> {
    Ok(connection
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get::<_, String>(0)
        })
        .optional()?
        .map(|value| value.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(default_value))
}

fn write_boolean_setting(
    connection: &Connection,
    key: &str,
    enabled: bool,
) -> Result<(), SettingsError> {
    connection.execute(
        "INSERT INTO settings (key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP",
        [key, if enabled { "true" } else { "false" }],
    )?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::INITIAL_SCHEMA;
    use rusqlite::Connection;

    use super::{
        read_settings, update_auto_reconcile, update_discover_page_size,
        update_launch_at_startup, update_silent_start, SettingsRecord,
    };

    const PROJECT_ONLY_REFACTOR_SCHEMA: &str =
        include_str!("../migrations/0002_project_only_refactor.sql");

    #[test]
    fn reads_default_auto_reconcile_setting() {
        let connection = open_project_only_in_memory_database();

        let settings = read_settings(&connection).expect("settings should read");

        assert_eq!(
            settings,
            SettingsRecord {
                auto_reconcile: true,
                discover_page_size: 25,
                launch_at_startup: false,
                silent_start: false,
            }
        );
    }

    #[test]
    fn updates_auto_reconcile_setting() {
        let connection = open_project_only_in_memory_database();

        let updated = update_auto_reconcile(&connection, false).expect("setting should update");
        assert!(
            !updated.auto_reconcile,
            "updated setting should disable auto reconcile"
        );

        let reread = read_settings(&connection).expect("settings should reread");
        assert!(
            !reread.auto_reconcile,
            "stored setting should remain disabled"
        );
        assert_eq!(reread.discover_page_size, 25);
        assert!(!reread.launch_at_startup);
        assert!(!reread.silent_start);
    }

    #[test]
    fn updates_discover_page_size_setting() {
        let connection = open_project_only_in_memory_database();

        let updated = update_discover_page_size(&connection, 50).expect("page size should update");

        assert_eq!(updated.discover_page_size, 50);
        assert!(
            updated.auto_reconcile,
            "other settings should remain intact"
        );
        assert!(!updated.launch_at_startup);
        assert!(!updated.silent_start);

        let reread = read_settings(&connection).expect("settings should reread");
        assert_eq!(reread.discover_page_size, 50);
    }

    #[test]
    fn reads_auto_reconcile_case_insensitively_after_trimming_whitespace() {
        let connection = open_project_only_in_memory_database();
        connection
            .execute(
                "UPDATE settings
                SET value = '  TRUE  ', updated_at = CURRENT_TIMESTAMP
                WHERE key = 'auto_reconcile'",
                [],
            )
            .expect("setting should update");

        let settings = read_settings(&connection).expect("settings should read");

        assert!(
            settings.auto_reconcile,
            "trimmed mixed-case true value should keep auto reconcile enabled"
        );
        assert_eq!(settings.discover_page_size, 25);
    }

    #[test]
    fn treats_non_true_auto_reconcile_values_as_disabled() {
        let connection = open_project_only_in_memory_database();
        connection
            .execute(
                "UPDATE settings
                SET value = 'sometimes', updated_at = CURRENT_TIMESTAMP
                WHERE key = 'auto_reconcile'",
                [],
            )
            .expect("setting should update");

        let settings = read_settings(&connection).expect("settings should read");

        assert!(
            !settings.auto_reconcile,
            "unexpected values should not silently enable auto reconcile"
        );
        assert_eq!(settings.discover_page_size, 25);
    }

    #[test]
    fn falls_back_to_default_discover_page_size_for_invalid_values() {
        let connection = open_project_only_in_memory_database();
        connection
            .execute(
                "INSERT INTO settings (key, value)
                VALUES ('discover_page_size', 'not-a-number')
                ON CONFLICT(key) DO UPDATE SET
                  value = excluded.value,
                  updated_at = CURRENT_TIMESTAMP",
                [],
            )
            .expect("page size should update");

        let settings = read_settings(&connection).expect("settings should read");

        assert_eq!(settings.discover_page_size, 25);
    }

    #[test]
    fn updates_desktop_startup_settings() {
        let connection = open_project_only_in_memory_database();

        let updated =
            update_launch_at_startup(&connection, true).expect("startup setting should update");
        assert!(updated.launch_at_startup);
        assert!(!updated.silent_start);

        let updated = update_silent_start(&connection, true).expect("silent setting should update");
        assert!(updated.silent_start);
    }

    fn open_project_only_in_memory_database() -> Connection {
        let connection = Connection::open_in_memory().expect("database should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(INITIAL_SCHEMA)
            .expect("initial schema should apply");
        connection
            .execute_batch(PROJECT_ONLY_REFACTOR_SCHEMA)
            .expect("project-only schema should apply");
        connection
    }
}

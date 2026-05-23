use std::path::Path;

use rusqlite::Connection;
use thiserror::Error;

pub(crate) const LEGACY_SCHEMA: &str = include_str!("../migrations/0001_initial.sql");
#[allow(dead_code)]
pub(crate) const INITIAL_SCHEMA: &str = LEGACY_SCHEMA;
pub(crate) const PROJECT_ONLY_SCHEMA: &str =
    include_str!("../migrations/0002_project_only_refactor.sql");
pub(crate) const SKILL_SOURCE_TRACKING_SCHEMA: &str =
    include_str!("../migrations/0003_skill_source_tracking.sql");
pub(crate) const CURRENT_SCHEMA: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  managed_dir_name TEXT NOT NULL,
  installed_version TEXT,
  installed_hash TEXT,
  latest_version TEXT,
  latest_hash TEXT,
  update_available INTEGER NOT NULL DEFAULT 0 CHECK (update_available IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_update_check_at TEXT,
  UNIQUE (source_type, source_ref, skill_path)
);

CREATE TABLE IF NOT EXISTS skill_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS skill_group_skills (
  group_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, skill_id),
  FOREIGN KEY (group_id) REFERENCES skill_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (path)
);

CREATE TABLE IF NOT EXISTS project_skills (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  source_origin TEXT NOT NULL DEFAULT 'manual',
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, skill_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_groups (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, group_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES skill_groups(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value)
VALUES ('auto_reconcile', 'true')
ON CONFLICT(key) DO NOTHING;

INSERT INTO settings (key, value)
VALUES
  ('launch_at_startup', 'false'),
  ('silent_start', 'false')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE IF NOT EXISTS cli_targets (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  is_common INTEGER NOT NULL DEFAULT 0 CHECK (is_common IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (relative_path)
);

INSERT INTO cli_targets (id, display_name, relative_path, is_common)
VALUES
  ('agents-skills', 'Agents Skills', '.agents/skills', 1),
  ('claude-code-skills', 'Claude Code Skills', '.claude/skills', 1),
  ('codex-skills', 'Codex Skills', '.codex/skills', 1)
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  relative_path = excluded.relative_path,
  is_common = excluded.is_common,
  updated_at = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS project_cli_targets (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  cli_target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, cli_target_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (cli_target_id) REFERENCES cli_targets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_project_skills_project_id ON project_skills(project_id);
CREATE INDEX IF NOT EXISTS idx_project_skills_skill_id ON project_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_project_skills_hidden ON project_skills(project_id, hidden);
CREATE INDEX IF NOT EXISTS idx_project_groups_project_id ON project_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_group_id ON project_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_project_cli_targets_project_id ON project_cli_targets(project_id);
"#;

#[derive(Debug, Error)]
pub enum DbError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub fn open_database(path: impl AsRef<Path>) -> Result<Connection, DbError> {
    let path = path.as_ref();
    let initialize_current_schema = !path.exists();
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    run_migrations(&connection, initialize_current_schema)?;
    Ok(connection)
}

#[cfg(test)]
pub fn open_in_memory_database() -> Result<Connection, DbError> {
    let connection = Connection::open_in_memory()?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.execute_batch(LEGACY_SCHEMA)?;
    Ok(connection)
}

fn backfill_source_origin(connection: &Connection) -> Result<(), DbError> {
    if has_table(connection, "skill_group_skills")? {
        connection.execute_batch(
            "UPDATE project_skills
            SET source_origin = 'group'
            WHERE EXISTS (
                SELECT 1 FROM skill_group_skills sgs
                INNER JOIN project_groups pg ON pg.group_id = sgs.group_id
                WHERE pg.project_id = project_skills.project_id
                  AND sgs.skill_id = project_skills.skill_id
            );",
        )?;
    }
    Ok(())
}

fn run_migrations(connection: &Connection, initialize_current_schema: bool) -> Result<(), DbError> {
    if initialize_current_schema {
        connection.execute_batch(CURRENT_SCHEMA)?;
        return Ok(());
    }

    let has_settings = has_table(connection, "settings")?;
    let has_projects = has_table(connection, "projects")?;
    let has_project_groups = has_table(connection, "project_groups")?;
    let has_project_skills = has_table(connection, "project_skills")?;
    let has_project_cli_targets = has_table(connection, "project_cli_targets")?;

    if has_settings
        && has_projects
        && has_project_groups
        && has_project_skills
        && has_project_cli_targets
    {
        if !column_exists(connection, "project_skills", "source_origin")? {
            connection.execute_batch(SKILL_SOURCE_TRACKING_SCHEMA)?;
            backfill_source_origin(connection)?;
        }
        return Ok(());
    }

    if has_settings
        || has_projects
        || has_project_groups
        || has_project_skills
        || has_project_cli_targets
    {
        if has_project_skills && !column_exists(connection, "project_skills", "source_origin")? {
            connection.execute_batch(SKILL_SOURCE_TRACKING_SCHEMA)?;
        }
        connection.execute_batch(CURRENT_SCHEMA)?;
        return Ok(());
    }

    connection.execute_batch(LEGACY_SCHEMA)?;
    if should_upgrade_legacy_schema(connection)? {
        connection.execute_batch(PROJECT_ONLY_SCHEMA)?;
    }

    Ok(())
}

fn should_upgrade_legacy_schema(connection: &Connection) -> Result<bool, DbError> {
    let has_projects = has_table(connection, "projects")?;
    let has_link_mode = column_exists(connection, "skills", "link_mode")?;
    if has_projects || !has_link_mode {
        return Ok(false);
    }

    Ok(count_rows(connection, "skills")? == 0
        && count_rows(connection, "custom_directories")? == 0
        && count_rows(connection, "skill_groups")? == 0
        && count_rows(connection, "project_roots")? == 0)
}

fn has_table(connection: &Connection, table_name: &str) -> Result<bool, DbError> {
    let count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table_name],
        |row| row.get(0),
    )?;

    Ok(count > 0)
}

fn column_exists(
    connection: &Connection,
    table_name: &str,
    column_name: &str,
) -> Result<bool, DbError> {
    let mut statement = connection.prepare(&format!(
        "SELECT name FROM pragma_table_info('{table_name}')"
    ))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0))?;

    for row in rows {
        if row? == column_name {
            return Ok(true);
        }
    }

    Ok(false)
}

fn count_rows(connection: &Connection, table_name: &str) -> Result<i64, DbError> {
    connection
        .query_row(&format!("SELECT COUNT(*) FROM {table_name}"), [], |row| {
            row.get(0)
        })
        .map_err(DbError::from)
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    use rusqlite::Connection;

    use super::{open_database, CURRENT_SCHEMA, LEGACY_SCHEMA, PROJECT_ONLY_SCHEMA};

    #[test]
    fn creates_project_only_core_tables_for_new_databases() {
        let connection = Connection::open_in_memory().expect("database should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(CURRENT_SCHEMA)
            .expect("current schema should apply");
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
                    'skills',
                    'skill_groups',
                    'projects',
                    'project_skills',
                    'project_groups',
                    'project_cli_targets',
                    'settings',
                    'cli_targets'
                )",
                [],
                |row| row.get(0),
            )
            .expect("table count query should work");

        assert_eq!(count, 8);
    }

    #[test]
    fn creates_project_only_schema_for_new_database_files() {
        let temp_path = std::env::temp_dir().join(format!(
            "skills-manager-db-test-{}.sqlite3",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ));
        if temp_path.exists() {
            fs::remove_file(&temp_path).expect("stale temp database should delete");
        }

        let connection = open_database(&temp_path).expect("database should open");

        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
                    'projects',
                    'project_skills',
                    'project_groups',
                    'project_cli_targets',
                    'settings'
                )",
                [],
                |row| row.get(0),
            )
            .expect("project-only tables query should work");

        assert_eq!(count, 5);

        drop(connection);
        fs::remove_file(temp_path).expect("temp database should delete");
    }

    #[test]
    fn creates_project_only_schema_when_database_file_already_exists_but_is_empty() {
        let temp_path = std::env::temp_dir().join(format!(
            "skills-manager-empty-db-test-{}.sqlite3",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ));
        if temp_path.exists() {
            fs::remove_file(&temp_path).expect("stale temp database should delete");
        }

        Connection::open(&temp_path).expect("empty database file should create");

        let connection =
            open_database(&temp_path).expect("existing empty database should initialize");

        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
                    'projects',
                    'project_skills',
                    'project_groups',
                    'project_cli_targets',
                    'settings'
                )",
                [],
                |row| row.get(0),
            )
            .expect("project-only tables query should work");

        assert_eq!(count, 5);

        let auto_reconcile: String = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'auto_reconcile'",
                [],
                |row| row.get(0),
            )
            .expect("default settings row should exist");
        assert_eq!(auto_reconcile, "true");

        let cli_targets: Vec<(String, String)> = {
            let mut statement = connection
                .prepare(
                    "SELECT id, relative_path FROM cli_targets
                    ORDER BY is_common DESC, display_name ASC, id ASC",
                )
                .expect("cli target query should prepare");
            statement
                .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
                .expect("cli targets should query")
                .collect::<Result<Vec<_>, _>>()
                .expect("cli targets should collect")
        };
        assert_eq!(
            cli_targets,
            vec![
                ("agents-skills".to_string(), ".agents/skills".to_string()),
                (
                    "claude-code-skills".to_string(),
                    ".claude/skills".to_string()
                ),
                ("codex-skills".to_string(), ".codex/skills".to_string()),
            ]
        );

        drop(connection);
        fs::remove_file(temp_path).expect("temp database should delete");
    }

    #[test]
    fn backfills_settings_table_for_partial_project_only_database() {
        let temp_path = std::env::temp_dir().join(format!(
            "skills-manager-partial-project-only-db-test-{}.sqlite3",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ));
        if temp_path.exists() {
            fs::remove_file(&temp_path).expect("stale temp database should delete");
        }

        let seed_connection =
            Connection::open(&temp_path).expect("partial project-only database should create");
        seed_connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        seed_connection
            .execute_batch(
                "
                CREATE TABLE projects (
                  id TEXT PRIMARY KEY NOT NULL,
                  name TEXT NOT NULL,
                  path TEXT NOT NULL,
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE (path)
                );

                CREATE TABLE project_skills (
                  id TEXT PRIMARY KEY NOT NULL,
                  project_id TEXT NOT NULL,
                  skill_id TEXT NOT NULL,
                  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE (project_id, skill_id)
                );

                CREATE TABLE project_groups (
                  id TEXT PRIMARY KEY NOT NULL,
                  project_id TEXT NOT NULL,
                  group_id TEXT NOT NULL,
                  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE (project_id, group_id)
                );

                CREATE TABLE cli_targets (
                  id TEXT PRIMARY KEY NOT NULL,
                  display_name TEXT NOT NULL,
                  relative_path TEXT NOT NULL,
                  is_common INTEGER NOT NULL DEFAULT 0 CHECK (is_common IN (0, 1)),
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE (relative_path)
                );

                CREATE TABLE project_cli_targets (
                  id TEXT PRIMARY KEY NOT NULL,
                  project_id TEXT NOT NULL,
                  cli_target_id TEXT NOT NULL,
                  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                  UNIQUE (project_id, cli_target_id)
                );
                ",
            )
            .expect("partial project-only schema should seed");
        drop(seed_connection);

        let connection =
            open_database(&temp_path).expect("partial project-only database should heal");

        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'settings'",
                [],
                |row| row.get(0),
            )
            .expect("settings table query should work");

        assert_eq!(count, 1);

        let auto_reconcile: String = connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'auto_reconcile'",
                [],
                |row| row.get(0),
            )
            .expect("default settings row should exist");
        assert_eq!(auto_reconcile, "true");

        drop(connection);
        fs::remove_file(temp_path).expect("temp database should delete");
    }

    #[test]
    fn project_only_migration_rebuilds_schema() {
        let connection = Connection::open_in_memory().expect("database should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(LEGACY_SCHEMA)
            .expect("legacy schema should apply");
        connection
            .execute_batch(
                "
                INSERT INTO skills (
                    id,
                    name,
                    source_type,
                    source_ref,
                    skill_path,
                    managed_dir_name,
                    link_mode
                ) VALUES
                    ('project-skill', 'project-skill', 'github', 'owner/project-skill', 'skills/project-skill', 'project-skill-11111111', 'project'),
                    ('global-skill', 'global-skill', 'github', 'owner/global-skill', 'skills/global-skill', 'global-skill-22222222', 'global');

                INSERT INTO skill_groups (id, name)
                VALUES ('frontend-group', 'Frontend');

                INSERT INTO skill_group_skills (group_id, skill_id)
                VALUES
                    ('frontend-group', 'project-skill'),
                    ('frontend-group', 'global-skill');

                INSERT INTO project_roots (id, name, path)
                VALUES ('project-root-one', 'Project One', 'D:/code/project-one');

                INSERT INTO skill_group_project_roots (group_id, project_root_id)
                VALUES ('frontend-group', 'project-root-one');

                INSERT INTO project_targets (
                    id,
                    group_id,
                    target_type,
                    target_id,
                    relative_path,
                    is_default
                ) VALUES (
                    'project-target-one',
                    'frontend-group',
                    'custom_project_path',
                    'agents-common',
                    '.agents/skills',
                    1
                );
                ",
            )
            .expect("legacy project-mode fixture should insert");
        connection
            .execute_batch(PROJECT_ONLY_SCHEMA)
            .expect("project-only migration should apply");

        let new_table_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (
                    'projects',
                    'project_skills',
                    'project_groups',
                    'project_cli_targets',
                    'settings'
                )",
                [],
                |row| row.get(0),
            )
            .expect("new table count query should work");

        assert_eq!(new_table_count, 5);
    }
}

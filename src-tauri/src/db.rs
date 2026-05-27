use std::path::Path;

use rusqlite::Connection;
use thiserror::Error;

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
  type TEXT NOT NULL DEFAULT 'manual',
  file TEXT,
  description TEXT NOT NULL DEFAULT '',
  version TEXT,
  total_skills INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_skill_groups_file ON skill_groups(file) WHERE file IS NOT NULL;

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
    let connection = Connection::open(path)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.execute_batch(CURRENT_SCHEMA)?;
    Ok(connection)
}

#[cfg(test)]
pub fn open_in_memory_database() -> Result<Connection, DbError> {
    let connection = Connection::open_in_memory()?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.execute_batch(CURRENT_SCHEMA)?;
    Ok(connection)
}

#[cfg(test)]
mod tests {
    use super::{open_database, CURRENT_SCHEMA};
    use rusqlite::Connection;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn creates_all_tables_for_new_databases() {
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
    fn creates_schema_for_new_database_files() {
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
}

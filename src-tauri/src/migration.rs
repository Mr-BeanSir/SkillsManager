use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

const PROJECT_ONLY_REFACTOR_SCHEMA: &str =
    include_str!("../migrations/0002_project_only_refactor.sql");

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectOnlyMigrationReport {
    pub backup_path: String,
    pub migrated_projects: usize,
    pub migrated_project_skills: usize,
    pub manual_skill_count: usize,
    pub manual_skills: Vec<ManualMigrationSkill>,
    pub warnings: Vec<String>,
    pub next_steps: Vec<String>,
    pub already_migrated: bool,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualMigrationSkill {
    pub id: String,
    pub name: String,
    pub link_mode: String,
}

#[derive(Debug, Error)]
pub enum MigrationError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("filesystem error at {path}: {source}")]
    Filesystem {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("database path has no parent directory: {0}")]
    MissingParent(PathBuf),
    #[error("system clock is before unix epoch")]
    Clock,
}

pub fn migrate_project_only_database(
    database_path: impl AsRef<Path>,
) -> Result<ProjectOnlyMigrationReport, MigrationError> {
    let database_path = database_path.as_ref();
    let connection = Connection::open(database_path)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;

    if is_project_only_schema(&connection)? {
        return Ok(ProjectOnlyMigrationReport {
            backup_path: String::new(),
            migrated_projects: count_rows(&connection, "projects")?,
            migrated_project_skills: count_rows(&connection, "project_skills")?,
            manual_skill_count: 0,
            manual_skills: Vec::new(),
            warnings: Vec::new(),
            next_steps: vec![
                "The database already uses the project-only schema.".to_string(),
                "Continue managing activation from the Projects and Settings pages.".to_string(),
            ],
            already_migrated: true,
        });
    }

    let manual_skills = list_manual_migration_skills(&connection)?;
    drop(connection);

    let backup_path = create_backup(database_path)?;
    let connection = Connection::open(database_path)?;
    connection.pragma_update(None, "foreign_keys", "ON")?;
    connection.execute_batch(PROJECT_ONLY_REFACTOR_SCHEMA)?;
    let manual_skill_count = manual_skills.len();

    Ok(ProjectOnlyMigrationReport {
        backup_path: backup_path.to_string_lossy().to_string(),
        migrated_projects: count_rows(&connection, "projects")?,
        migrated_project_skills: count_rows(&connection, "project_skills")?,
        manual_skill_count,
        manual_skills,
        warnings: build_warnings(manual_skill_count),
        next_steps: build_next_steps(manual_skill_count),
        already_migrated: false,
    })
}

#[tauri::command]
pub fn migrate_project_only_database_record() -> Result<ProjectOnlyMigrationReport, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    migrate_project_only_database(database_path).map_err(|error| error.to_string())
}

fn is_project_only_schema(connection: &Connection) -> Result<bool, MigrationError> {
    let project_tables = table_exists(connection, "projects")?
        && table_exists(connection, "project_skills")?
        && table_exists(connection, "project_groups")?
        && table_exists(connection, "project_cli_targets")?;
    let link_mode_removed = !column_exists(connection, "skills", "link_mode")?;

    Ok(project_tables && link_mode_removed)
}

fn list_manual_migration_skills(
    connection: &Connection,
) -> Result<Vec<ManualMigrationSkill>, MigrationError> {
    let mut statement = connection.prepare(
        "SELECT id, name, link_mode
        FROM skills
        WHERE link_mode IN ('global', 'custom')
        ORDER BY link_mode DESC, name ASC",
    )?;
    let rows = statement.query_map([], |row| {
        Ok(ManualMigrationSkill {
            id: row.get(0)?,
            name: row.get(1)?,
            link_mode: row.get(2)?,
        })
    })?;

    let mut skills = Vec::new();
    for row in rows {
        skills.push(row?);
    }

    Ok(skills)
}

fn create_backup(database_path: &Path) -> Result<PathBuf, MigrationError> {
    let parent = database_path
        .parent()
        .ok_or_else(|| MigrationError::MissingParent(database_path.to_path_buf()))?;
    let stem = database_path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("skills-manager");
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| MigrationError::Clock)?
        .as_secs();
    let backup_path = parent.join(format!("{stem}-project-only-backup-{timestamp}.sqlite3"));

    std::fs::copy(database_path, &backup_path).map_err(|source| MigrationError::Filesystem {
        path: backup_path.clone(),
        source,
    })?;

    Ok(backup_path)
}

fn table_exists(connection: &Connection, table_name: &str) -> Result<bool, MigrationError> {
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
) -> Result<bool, MigrationError> {
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

fn count_rows(connection: &Connection, table_name: &str) -> Result<usize, MigrationError> {
    let count: i64 =
        connection.query_row(&format!("SELECT COUNT(*) FROM {table_name}"), [], |row| {
            row.get(0)
        })?;

    Ok(count as usize)
}

fn build_warnings(manual_skill_count: usize) -> Vec<String> {
    if manual_skill_count == 0 {
        return Vec::new();
    }

    vec![format!(
        "Legacy global/custom skills still need manual follow-up ({manual_skill_count})."
    )]
}

fn build_next_steps(manual_skill_count: usize) -> Vec<String> {
    let mut steps = vec![
        "Keep the backup until project-only workflows are verified.".to_string(),
        "Open the Projects page to confirm migrated project skills and CLI targets.".to_string(),
    ];

    if manual_skill_count > 0 {
        steps.push(
            "Reattach listed legacy skills from the Projects page before removing old link targets."
                .to_string(),
        );
    }

    steps
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::Path;
    use std::time::{SystemTime, UNIX_EPOCH};

    use rusqlite::Connection;

    use super::migrate_project_only_database;
    use crate::db::INITIAL_SCHEMA;

    fn unique_temp_dir(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "skills-manager-{name}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ))
    }

    fn create_legacy_database(path: &std::path::Path) {
        let connection = Connection::open(path).expect("database should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(INITIAL_SCHEMA)
            .expect("initial schema should apply");
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
                    ('global-skill', 'global-skill', 'github', 'owner/global-skill', 'skills/global-skill', 'global-skill-22222222', 'global'),
                    ('custom-skill', 'custom-skill', 'github', 'owner/custom-skill', 'skills/custom-skill', 'custom-skill-33333333', 'custom');

                INSERT INTO skill_groups (id, name)
                VALUES ('frontend-group', 'Frontend');

                INSERT INTO skill_group_skills (group_id, skill_id)
                VALUES
                    ('frontend-group', 'project-skill'),
                    ('frontend-group', 'global-skill'),
                    ('frontend-group', 'custom-skill');

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
            .expect("legacy fixture should insert");
    }

    #[test]
    fn backs_up_database_migrates_project_mode_and_reports_manual_skills() {
        let dir = unique_temp_dir("project-only-migration");
        fs::create_dir_all(&dir).expect("temp dir should be created");
        let database_path = dir.join("skills-manager.sqlite3");
        create_legacy_database(&database_path);

        let report =
            migrate_project_only_database(&database_path).expect("migration should succeed");

        assert!(!report.already_migrated);
        assert_eq!(report.migrated_projects, 1);
        assert_eq!(report.migrated_project_skills, 1);
        assert_eq!(report.manual_skill_count, 2);
        assert_eq!(
            report.warnings,
            vec!["Legacy global/custom skills still need manual follow-up (2).".to_string()]
        );
        assert_eq!(
            report.next_steps,
            vec![
                "Keep the backup until project-only workflows are verified.".to_string(),
                "Open the Projects page to confirm migrated project skills and CLI targets."
                    .to_string(),
                "Reattach listed legacy skills from the Projects page before removing old link targets."
                    .to_string()
            ]
        );
        assert_eq!(
            report
                .manual_skills
                .iter()
                .map(|skill| (&skill.id, &skill.name, &skill.link_mode))
                .collect::<Vec<_>>(),
            vec![
                (
                    &"global-skill".to_string(),
                    &"global-skill".to_string(),
                    &"global".to_string()
                ),
                (
                    &"custom-skill".to_string(),
                    &"custom-skill".to_string(),
                    &"custom".to_string()
                )
            ]
        );
        assert!(Path::new(&report.backup_path).exists());

        let connection = Connection::open(&database_path).expect("migrated database should open");
        let link_mode_columns: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('skills') WHERE name = 'link_mode'",
                [],
                |row| row.get(0),
            )
            .expect("schema query should work");
        let migrated_project_skills: i64 = connection
            .query_row("SELECT COUNT(*) FROM project_skills", [], |row| row.get(0))
            .expect("project skills query should work");

        assert_eq!(link_mode_columns, 0);
        assert_eq!(migrated_project_skills, 1);

        drop(connection);
        fs::remove_dir_all(&dir).expect("temp dir should be removed");
    }

    #[test]
    fn reports_already_migrated_without_creating_backup() {
        let dir = unique_temp_dir("project-only-already-migrated");
        fs::create_dir_all(&dir).expect("temp dir should be created");
        let database_path = dir.join("skills-manager.sqlite3");
        create_legacy_database(&database_path);
        migrate_project_only_database(&database_path).expect("first migration should succeed");

        let second =
            migrate_project_only_database(&database_path).expect("second migration should succeed");

        assert!(second.already_migrated);
        assert_eq!(second.backup_path, "");
        assert_eq!(second.migrated_projects, 1);
        assert_eq!(second.migrated_project_skills, 1);
        assert_eq!(second.manual_skill_count, 0);
        assert!(second.manual_skills.is_empty());
        assert!(second.warnings.is_empty());
        assert_eq!(
            second.next_steps,
            vec![
                "The database already uses the project-only schema.".to_string(),
                "Continue managing activation from the Projects and Settings pages.".to_string()
            ]
        );

        fs::remove_dir_all(&dir).expect("temp dir should be removed");
    }
}

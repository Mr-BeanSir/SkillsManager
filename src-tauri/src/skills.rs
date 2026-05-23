use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSkillUsage {
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkill {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
    pub active_project_count: i64,
    pub attached_project_count: i64,
    pub project_usages: Vec<ProjectSkillUsage>,
    pub update_available: bool,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Error)]
pub enum SkillError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Reconcile(#[from] crate::reconcile::ReconcileError),
}

pub fn list_installed_skills(connection: &Connection) -> Result<Vec<InstalledSkill>, SkillError> {
    if has_project_only_skill_usage_tables(connection)? {
        return list_project_only_installed_skills(connection);
    }

    list_legacy_installed_skills(connection)
}

#[tauri::command]
pub fn list_installed_skill_records() -> Result<Vec<InstalledSkill>, String> {
    with_database(|connection| list_installed_skills(connection))
}

pub fn delete_installed_skill(
    connection: &Connection,
    skill_id: &str,
    managed_skills_root: &Path,
) -> Result<(), SkillError> {
    let (skill_name, managed_dir_name) = connection.query_row(
        "SELECT name, managed_dir_name FROM skills WHERE id = ?1",
        [skill_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
    )?;

    // 1. Find symlink paths from DB records
    let link_paths = list_skill_symlink_paths(connection, skill_id, &skill_name)?;

    // 2. Delete symlink folders
    for link_path in &link_paths {
        let _ = crate::fs_links::delete_managed_skill_link(link_path, managed_skills_root);
    }

    // 3-5 in transaction: delete DB associations → delete appdata dir → delete skill record
    connection.execute_batch("BEGIN IMMEDIATE")?;
    connection.execute(
        "DELETE FROM project_skills WHERE skill_id = ?1",
        [skill_id],
    )?;
    connection.execute(
        "DELETE FROM skill_group_skills WHERE skill_id = ?1",
        [skill_id],
    )?;

    let managed_dir = managed_skills_root.join(&managed_dir_name);
    if managed_dir.exists() {
        let _ = fs::remove_dir_all(&managed_dir);
    }

    connection.execute("DELETE FROM skills WHERE id = ?1", [skill_id])?;
    connection.execute_batch("COMMIT")?;

    Ok(())
}

fn list_skill_symlink_paths(
    connection: &Connection,
    skill_id: &str,
    skill_name: &str,
) -> Result<Vec<PathBuf>, SkillError> {
    let mut statement = connection.prepare(
        "SELECT projects.path, cli_targets.relative_path
        FROM project_skills
        INNER JOIN projects ON projects.id = project_skills.project_id
        INNER JOIN project_cli_targets ON project_cli_targets.project_id = project_skills.project_id
        INNER JOIN cli_targets ON cli_targets.id = project_cli_targets.cli_target_id
        WHERE project_skills.skill_id = ?1",
    )?;

    let paths = statement
        .query_map([skill_id], |row| {
            let project_path = row.get::<_, String>(0)?;
            let relative_path = row.get::<_, String>(1)?;
            Ok((project_path, relative_path))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut link_paths = Vec::new();
    for (project_path, relative_path) in paths {
        let target_dir: PathBuf = relative_path
            .split(['/', '\\'])
            .filter(|part| !part.is_empty())
            .fold(PathBuf::from(&project_path), |path, part| path.join(part));
        link_paths.push(target_dir.join(skill_name));
    }

    Ok(link_paths)
}

#[tauri::command]
pub async fn delete_installed_skill_record(skill_id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let database_path =
            crate::app_paths::database_path().map_err(|error| error.to_string())?;
        let connection =
            crate::db::open_database(database_path).map_err(|error| error.to_string())?;
        let managed_skills_root =
            crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;

        delete_installed_skill(&connection, &skill_id, &managed_skills_root)
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, SkillError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn list_project_only_installed_skills(
    connection: &Connection,
) -> Result<Vec<InstalledSkill>, SkillError> {
    let mut statement = connection.prepare(
        "SELECT
            skills.id,
            skills.name,
            skills.source_type,
            skills.source_ref,
            skills.skill_path,
            SUM(CASE WHEN project_skills.enabled = 1 THEN 1 ELSE 0 END) AS active_project_count,
            COUNT(project_skills.id) AS attached_project_count,
            skills.update_available,
            skills.installed_version,
            skills.latest_version,
            skills.updated_at
        FROM skills
        LEFT JOIN project_skills ON project_skills.skill_id = skills.id
        GROUP BY skills.id
        ORDER BY skills.name ASC, skills.source_ref ASC, skills.skill_path ASC",
    )?;

    let mut rows = statement.query([])?;
    let mut skills = Vec::new();

    while let Some(row) = rows.next()? {
        let skill_id: String = row.get(0)?;

        skills.push(InstalledSkill {
            id: skill_id.clone(),
            name: row.get(1)?,
            source_type: row.get(2)?,
            source_ref: row.get(3)?,
            skill_path: row.get(4)?,
            active_project_count: row.get::<_, Option<i64>>(5)?.unwrap_or(0),
            attached_project_count: row.get::<_, Option<i64>>(6)?.unwrap_or(0),
            project_usages: list_project_usages(connection, &skill_id)?,
            update_available: row.get::<_, i64>(7)? == 1,
            installed_version: row.get(8)?,
            latest_version: row.get(9)?,
            updated_at: row.get(10)?,
        });
    }

    Ok(skills)
}

fn list_project_usages(
    connection: &Connection,
    skill_id: &str,
) -> Result<Vec<ProjectSkillUsage>, SkillError> {
    let mut statement = connection.prepare(
        "SELECT
            projects.id,
            projects.name,
            projects.path,
            project_skills.enabled
        FROM project_skills
        INNER JOIN projects ON projects.id = project_skills.project_id
        WHERE project_skills.skill_id = ?1
        ORDER BY projects.name ASC, projects.path ASC",
    )?;

    let usages = statement
        .query_map([skill_id], |row| {
            Ok(ProjectSkillUsage {
                project_id: row.get(0)?,
                project_name: row.get(1)?,
                project_path: row.get(2)?,
                enabled: row.get::<_, i64>(3)? == 1,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(usages)
}

fn list_legacy_installed_skills(
    connection: &Connection,
) -> Result<Vec<InstalledSkill>, SkillError> {
    let mut statement = connection.prepare(
        "SELECT
            skills.id,
            skills.name,
            skills.source_type,
            skills.source_ref,
            skills.skill_path,
            skills.update_available,
            skills.installed_version,
            skills.latest_version,
            skills.updated_at
        FROM skills
        ORDER BY skills.name ASC, skills.source_ref ASC, skills.skill_path ASC",
    )?;

    let skills = statement
        .query_map([], |row| {
            Ok(InstalledSkill {
                id: row.get(0)?,
                name: row.get(1)?,
                source_type: row.get(2)?,
                source_ref: row.get(3)?,
                skill_path: row.get(4)?,
                active_project_count: 0,
                attached_project_count: 0,
                project_usages: Vec::new(),
                update_available: row.get::<_, i64>(5)? == 1,
                installed_version: row.get(6)?,
                latest_version: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(skills)
}

fn has_project_only_skill_usage_tables(connection: &Connection) -> Result<bool, SkillError> {
    Ok(has_table(connection, "projects")? && has_table(connection, "project_skills")?)
}

fn has_table(connection: &Connection, table_name: &str) -> Result<bool, SkillError> {
    let count: i64 = connection.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?1",
        [table_name],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

#[cfg(test)]
mod tests {
    use super::list_installed_skills;
    use crate::db::{open_in_memory_database, INITIAL_SCHEMA};
    use rusqlite::Connection;
    use std::fs;

    const PROJECT_ONLY_REFACTOR_SCHEMA: &str =
        include_str!("../migrations/0002_project_only_refactor.sql");

    #[test]
    fn lists_installed_skills_with_project_usage_counts_and_assignments() {
        let connection = open_project_only_database();
        connection
            .execute(
                "INSERT INTO skills (
                    id,
                    name,
                    description,
                    source_type,
                    source_ref,
                    skill_path,
                    managed_dir_name,
                    installed_version,
                    latest_version,
                    update_available
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                (
                    "skill-grill",
                    "grill-with-docs",
                    "Plan review skill",
                    "github",
                    "owner/repo",
                    "skills/grill-with-docs",
                    "grill-with-docs-499b7424",
                    "1.0.0",
                    "1.1.0",
                    1,
                ),
            )
            .expect("skill should insert");
        connection
            .execute(
                "INSERT INTO projects (id, name, path)
                VALUES (?1, ?2, ?3), (?4, ?5, ?6)",
                (
                    "project-skills-manager",
                    "Skills Manager",
                    "D:/Development/nodejs/SkillsManager",
                    "project-agents-docs",
                    "Agents Docs",
                    "D:/Development/docs/agents",
                ),
            )
            .expect("projects should insert");
        connection
            .execute(
                "INSERT INTO project_skills (
                    id,
                    project_id,
                    skill_id,
                    enabled
                ) VALUES (?1, ?2, ?3, ?4), (?5, ?6, ?7, ?8)",
                (
                    "project-skill-one",
                    "project-skills-manager",
                    "skill-grill",
                    1,
                    "project-skill-two",
                    "project-agents-docs",
                    "skill-grill",
                    0,
                ),
            )
            .expect("project skill rows should insert");

        let skills = list_installed_skills(&connection).expect("skills should list");

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].id, "skill-grill");
        assert_eq!(skills[0].name, "grill-with-docs");
        assert_eq!(skills[0].source_type, "github");
        assert_eq!(skills[0].source_ref, "owner/repo");
        assert_eq!(skills[0].skill_path, "skills/grill-with-docs");
        assert_eq!(skills[0].active_project_count, 1);
        assert_eq!(skills[0].attached_project_count, 2);
        assert!(skills[0].update_available);
        assert_eq!(skills[0].installed_version.as_deref(), Some("1.0.0"));
        assert_eq!(skills[0].latest_version.as_deref(), Some("1.1.0"));
        assert_eq!(skills[0].project_usages.len(), 2);
        assert_eq!(
            skills[0].project_usages[0].project_id,
            "project-agents-docs"
        );
        assert_eq!(skills[0].project_usages[0].project_name, "Agents Docs");
        assert_eq!(
            skills[0].project_usages[0].project_path,
            "D:/Development/docs/agents"
        );
        assert!(!skills[0].project_usages[0].enabled);
        assert_eq!(
            skills[0].project_usages[1].project_id,
            "project-skills-manager"
        );
        assert_eq!(skills[0].project_usages[1].project_name, "Skills Manager");
        assert_eq!(
            skills[0].project_usages[1].project_path,
            "D:/Development/nodejs/SkillsManager"
        );
        assert!(skills[0].project_usages[1].enabled);
    }

    #[test]
    fn lists_installed_skills_without_project_usage_when_project_tables_are_absent() {
        let connection = open_in_memory_database().expect("database should open");
        connection
            .execute(
                "INSERT INTO skills (
                    id,
                    name,
                    source_type,
                    source_ref,
                    skill_path,
                    managed_dir_name,
                    link_mode
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                (
                    "skill-plain",
                    "plain-skill",
                    "github",
                    "owner/plain",
                    "skills/plain",
                    "plain-skill-11111111",
                    "project",
                ),
            )
            .expect("skill should insert");

        let skills = list_installed_skills(&connection).expect("skills should list");

        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].active_project_count, 0);
        assert_eq!(skills[0].attached_project_count, 0);
        assert!(skills[0].project_usages.is_empty());
    }

    #[test]
    fn delete_installed_skill_removes_symlinks_db_records_and_managed_directory() {
        use super::delete_installed_skill;
        use crate::fs_links::{create_skill_link, SkillLinkStatus};
        use std::fs;

        let connection = open_project_only_database();
        let workspace = TestWorkspace::new("delete-skill");
        let managed_skills_root = workspace.root.join("managed-skills");
        fs::create_dir_all(&managed_skills_root).expect("managed root should exist");

        // Create managed skill directory
        let managed_dir = managed_skills_root.join("grill-with-docs-499b7424");
        fs::create_dir_all(&managed_dir).expect("managed dir should exist");
        fs::write(managed_dir.join("SKILL.md"), "# Skill\n").expect("file should write");

        // Insert skill, project, project_skill, cli_target, project_cli_target
        connection
            .execute(
                "INSERT INTO skills (id, name, source_type, source_ref, skill_path, managed_dir_name)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                ("skill-grill", "grill-with-docs", "github", "owner/repo", "skills/grill-with-docs", "grill-with-docs-499b7424"),
            )
            .expect("skill should insert");
        connection
            .execute(
                "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
                ("project-one", "My Project", workspace.root.join("my-project").to_string_lossy().as_ref()),
            )
            .expect("project should insert");
        connection
            .execute(
                "INSERT INTO project_skills (id, project_id, skill_id, enabled) VALUES (?1, ?2, ?3, 1)",
                ("ps-one", "project-one", "skill-grill"),
            )
            .expect("project_skill should insert");
        connection
            .execute(
                "INSERT INTO project_cli_targets (id, project_id, cli_target_id) VALUES (?1, ?2, ?3)",
                ("pct-one", "project-one", "agents-skills"),
            )
            .expect("project_cli_target should insert");

        // Create symlink
        let link_path = workspace.root.join("my-project").join(".agents").join("skills").join("grill-with-docs");
        fs::create_dir_all(link_path.parent().unwrap()).expect("link parent should exist");
        let check = create_skill_link(&link_path, &managed_dir);
        assert_eq!(check.status, SkillLinkStatus::Linked);

        // Delete
        delete_installed_skill(&connection, "skill-grill", &managed_skills_root)
            .expect("delete should succeed");

        // Symlink removed
        assert!(!link_path.exists(), "symlink should be removed");

        // DB associations removed
        let ps_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM project_skills WHERE skill_id = 'skill-grill'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(ps_count, 0, "project_skills should be empty");

        // Managed directory removed
        assert!(!managed_dir.exists(), "managed directory should be removed");

        // Skill record removed
        let skill_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills WHERE id = 'skill-grill'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(skill_count, 0, "skill record should be deleted");
    }

    struct TestWorkspace {
        root: std::path::PathBuf,
    }

    impl TestWorkspace {
        fn new(name: &str) -> Self {
            let unique = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let root = std::env::temp_dir().join(format!("skills-manager-delete-{name}-{unique}"));
            fs::create_dir_all(&root).expect("workspace should create");
            Self { root }
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            if self.root.exists() {
                let _ = fs::remove_dir_all(&self.root);
            }
        }
    }

    fn open_project_only_database() -> Connection {
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

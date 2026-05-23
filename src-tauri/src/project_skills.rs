use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

use crate::domain::ids::stable_prefixed_id;
use crate::reconcile::{reconcile_project_record_if_enabled, ReconcileEnvironment};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSkillRecord {
    pub id: String,
    pub project_id: String,
    pub skill_id: String,
    pub skill_name: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
    pub enabled: bool,
    pub source_origin: String,
    pub hidden: bool,
    pub group_name: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Error)]
pub enum ProjectSkillError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Reconcile(#[from] crate::reconcile::ReconcileError),
}

pub fn list_project_skills(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ProjectSkillRecord>, ProjectSkillError> {
    let mut statement = connection.prepare(
        "SELECT
            project_skills.id,
            project_skills.project_id,
            project_skills.skill_id,
            skills.name,
            skills.source_type,
            skills.source_ref,
            skills.skill_path,
            project_skills.enabled,
            project_skills.source_origin,
            project_skills.hidden,
            (
                SELECT skill_groups.name
                FROM skill_group_skills
                INNER JOIN project_groups ON project_groups.group_id = skill_group_skills.group_id
                INNER JOIN skill_groups ON skill_groups.id = skill_group_skills.group_id
                WHERE project_groups.project_id = project_skills.project_id
                  AND project_groups.enabled = 1
                  AND skill_group_skills.skill_id = project_skills.skill_id
                LIMIT 1
            ) AS group_name,
            project_skills.created_at,
            project_skills.updated_at
        FROM project_skills
        INNER JOIN skills ON skills.id = project_skills.skill_id
        WHERE project_skills.project_id = ?1 AND NOT (project_skills.source_origin = 'manual' AND project_skills.hidden = 1)
        ORDER BY skills.name ASC, skills.source_ref ASC, skills.skill_path ASC",
    )?;

    let project_skills = statement
        .query_map([project_id], project_skill_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(project_skills)
}

pub fn add_project_skill(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
) -> Result<ProjectSkillRecord, ProjectSkillError> {
    let id = project_skill_id(project_id, skill_id);

    connection.execute(
        "INSERT INTO project_skills (id, project_id, skill_id, enabled, source_origin, hidden)
        VALUES (?1, ?2, ?3, 1, 'manual', 0)
        ON CONFLICT (project_id, skill_id) DO UPDATE SET hidden = 0, updated_at = CURRENT_TIMESTAMP",
        (&id, project_id, skill_id),
    )?;

    get_project_skill(connection, project_id, skill_id)
}

pub fn enable_project_skill(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
) -> Result<ProjectSkillRecord, ProjectSkillError> {
    connection.execute(
        "UPDATE project_skills
        SET enabled = 1, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?1 AND skill_id = ?2",
        (project_id, skill_id),
    )?;

    get_project_skill(connection, project_id, skill_id)
}

pub fn disable_project_skill(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
) -> Result<ProjectSkillRecord, ProjectSkillError> {
    connection.execute(
        "UPDATE project_skills
        SET enabled = 0, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?1 AND skill_id = ?2",
        (project_id, skill_id),
    )?;

    get_project_skill(connection, project_id, skill_id)
}

pub fn remove_project_skill(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
) -> Result<(), ProjectSkillError> {
    connection.execute(
        "DELETE FROM project_skills
        WHERE project_id = ?1 AND skill_id = ?2",
        (project_id, skill_id),
    )?;
    Ok(())
}

fn add_project_skill_and_reconcile(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<ProjectSkillRecord, ProjectSkillError> {
    let record = add_project_skill(connection, project_id, skill_id)?;
    reconcile_project_record_if_enabled(connection, environment, project_id)?;
    Ok(record)
}

fn enable_project_skill_and_reconcile(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<ProjectSkillRecord, ProjectSkillError> {
    let record = enable_project_skill(connection, project_id, skill_id)?;
    if let Err(error) = reconcile_project_record_if_enabled(connection, environment, project_id) {
        // Rollback: disable the skill if reconcile fails
        let _ = disable_project_skill(connection, project_id, skill_id);
        return Err(error.into());
    }
    Ok(record)
}

fn disable_project_skill_and_reconcile(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<ProjectSkillRecord, ProjectSkillError> {
    let record = disable_project_skill(connection, project_id, skill_id)?;
    if let Err(error) = reconcile_project_record_if_enabled(connection, environment, project_id) {
        // Rollback: re-enable the skill if reconcile fails
        let _ = enable_project_skill(connection, project_id, skill_id);
        return Err(error.into());
    }
    Ok(record)
}

fn remove_project_skill_and_reconcile(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<(), ProjectSkillError> {
    remove_project_skill(connection, project_id, skill_id)?;
    reconcile_project_record_if_enabled(connection, environment, project_id)?;
    Ok(())
}

#[tauri::command]
pub fn list_project_skill_records(project_id: String) -> Result<Vec<ProjectSkillRecord>, String> {
    with_database(|connection| list_project_skills(connection, &project_id))
}

#[tauri::command]
pub fn add_project_skill_record(
    project_id: String,
    skill_id: String,
) -> Result<ProjectSkillRecord, String> {
    with_database_and_reconcile(|connection, environment| {
        add_project_skill_and_reconcile(connection, &project_id, &skill_id, environment)
    })
}

#[tauri::command]
pub fn enable_project_skill_record(
    project_id: String,
    skill_id: String,
) -> Result<ProjectSkillRecord, String> {
    with_database_and_reconcile(|connection, environment| {
        enable_project_skill_and_reconcile(connection, &project_id, &skill_id, environment)
    })
}

#[tauri::command]
pub fn disable_project_skill_record(
    project_id: String,
    skill_id: String,
) -> Result<ProjectSkillRecord, String> {
    with_database_and_reconcile(|connection, environment| {
        disable_project_skill_and_reconcile(connection, &project_id, &skill_id, environment)
    })
}

#[tauri::command]
pub fn remove_project_skill_record(project_id: String, skill_id: String) -> Result<(), String> {
    with_database_and_reconcile(|connection, environment| {
        remove_project_skill_and_reconcile(connection, &project_id, &skill_id, environment)
    })
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, ProjectSkillError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn with_database_and_reconcile<T>(
    action: impl FnOnce(&Connection, &ReconcileEnvironment) -> Result<T, ProjectSkillError>,
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

fn get_project_skill(
    connection: &Connection,
    project_id: &str,
    skill_id: &str,
) -> Result<ProjectSkillRecord, ProjectSkillError> {
    connection
        .query_row(
            "SELECT
                project_skills.id,
                project_skills.project_id,
                project_skills.skill_id,
                skills.name,
                skills.source_type,
                skills.source_ref,
                skills.skill_path,
                project_skills.enabled,
                project_skills.source_origin,
                project_skills.hidden,
                (
                    SELECT skill_groups.name
                    FROM skill_group_skills
                    INNER JOIN project_groups ON project_groups.group_id = skill_group_skills.group_id
                    INNER JOIN skill_groups ON skill_groups.id = skill_group_skills.group_id
                    WHERE project_groups.project_id = project_skills.project_id
                      AND project_groups.enabled = 1
                      AND skill_group_skills.skill_id = project_skills.skill_id
                    LIMIT 1
                ) AS group_name,
                project_skills.created_at,
                project_skills.updated_at
            FROM project_skills
            INNER JOIN skills ON skills.id = project_skills.skill_id
            WHERE project_skills.project_id = ?1 AND project_skills.skill_id = ?2",
            (project_id, skill_id),
            project_skill_from_row,
        )
        .map_err(ProjectSkillError::from)
}

fn project_skill_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectSkillRecord> {
    Ok(ProjectSkillRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        skill_id: row.get(2)?,
        skill_name: row.get(3)?,
        source_type: row.get(4)?,
        source_ref: row.get(5)?,
        skill_path: row.get(6)?,
        enabled: row.get::<_, i64>(7)? == 1,
        source_origin: row.get(8)?,
        hidden: row.get::<_, i64>(9)? == 1,
        group_name: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn project_skill_id(project_id: &str, skill_id: &str) -> String {
    stable_prefixed_id("project-skill", &format!("{project_id}|{skill_id}"))
}

#[cfg(test)]
mod tests {
    use super::{
        add_project_skill, add_project_skill_and_reconcile, disable_project_skill,
        enable_project_skill, list_project_skills, remove_project_skill,
    };
    use crate::fs_links::{
        check_skill_link, create_skill_link, delete_managed_skill_link, SkillLinkStatus,
    };
    use crate::reconcile::ReconcileEnvironment;
    use rusqlite::Connection;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::db::{INITIAL_SCHEMA, SKILL_SOURCE_TRACKING_SCHEMA};
    use crate::projects::{create_project, ProjectInput};

    const PROJECT_ONLY_REFACTOR_SCHEMA: &str =
        include_str!("../migrations/0002_project_only_refactor.sql");

    #[test]
    fn adds_and_lists_project_skills_with_skill_metadata() {
        let connection = open_project_only_in_memory_database();
        let project = seed_project(&connection);
        seed_skill(&connection, "skill-one", "grill-with-docs");
        seed_skill(&connection, "skill-two", "systematic-debugging");

        let added = add_project_skill(&connection, &project.id, "skill-one")
            .expect("project skill should add");

        assert_eq!(added.project_id, project.id);
        assert_eq!(added.skill_id, "skill-one");
        assert_eq!(added.skill_name, "grill-with-docs");
        assert!(added.enabled);

        let listed =
            list_project_skills(&connection, &project.id).expect("project skills should list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0], added);

        let duplicate = add_project_skill(&connection, &project.id, "skill-one")
            .expect("duplicate add should reuse existing row");
        assert_eq!(duplicate.id, added.id);

        let relisted =
            list_project_skills(&connection, &project.id).expect("project skills should relist");
        assert_eq!(relisted.len(), 1);
        assert_eq!(relisted[0].skill_name, "grill-with-docs");
    }

    #[test]
    fn disables_and_reenables_project_skill() {
        let connection = open_project_only_in_memory_database();
        let project = seed_project(&connection);
        seed_skill(&connection, "skill-one", "grill-with-docs");
        add_project_skill(&connection, &project.id, "skill-one").expect("project skill should add");

        let disabled = disable_project_skill(&connection, &project.id, "skill-one")
            .expect("project skill should disable");
        assert!(!disabled.enabled);

        let enabled = enable_project_skill(&connection, &project.id, "skill-one")
            .expect("project skill should enable");
        assert!(enabled.enabled);
    }

    #[test]
    fn removes_project_skill_record_without_deleting_skill() {
        let connection = open_project_only_in_memory_database();
        let project = seed_project(&connection);
        seed_skill(&connection, "skill-one", "grill-with-docs");
        add_project_skill(&connection, &project.id, "skill-one").expect("project skill should add");

        remove_project_skill(&connection, &project.id, "skill-one")
            .expect("project skill should remove");

        let listed =
            list_project_skills(&connection, &project.id).expect("project skills should list");
        assert!(listed.is_empty());
        assert_eq!(count_rows(&connection, "skills"), 1);
        assert_eq!(count_rows(&connection, "project_skills"), 0);
    }

    #[test]
    fn add_project_skill_reconciles_links_when_auto_reconcile_is_enabled() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-skill-auto-reconcile");
        let project_root = workspace.root.join("workspace");
        let managed_target = workspace.create_managed_skill("grill-with-docs-hash");
        if !workspace.assert_symlink_capable(&managed_target) {
            return;
        }

        fs::create_dir_all(project_root.join(".agents")).expect("cli parent should exist");

        let project = create_project(
            &connection,
            ProjectInput {
                name: "Workspace".to_string(),
                path: path_string(&project_root),
            },
        )
        .expect("project should create");
        seed_skill(&connection, "skill-one", "grill-with-docs");
        connection
            .execute(
                "UPDATE skills SET managed_dir_name = ?1 WHERE id = ?2",
                ("grill-with-docs-hash", "skill-one"),
            )
            .expect("managed dir name should update");
        connection
            .execute(
                "INSERT INTO project_cli_targets (id, project_id, cli_target_id)
                VALUES (?1, ?2, ?3)",
                ("project-target-one", &project.id, "agents-skills"),
            )
            .expect("project cli target should insert");

        let added = add_project_skill_and_reconcile(
            &connection,
            &project.id,
            "skill-one",
            &workspace.environment(),
        )
        .expect("project skill should add and reconcile");

        assert_eq!(added.skill_name, "grill-with-docs");
        let link_path = project_root
            .join(".agents")
            .join("skills")
            .join("grill-with-docs");
        assert_eq!(
            check_skill_link(&link_path, &managed_target).status,
            SkillLinkStatus::Linked
        );
    }

    fn seed_project(connection: &Connection) -> crate::projects::ProjectRecord {
        create_project(
            connection,
            ProjectInput {
                name: "Workspace".to_string(),
                path: "D:/Code/workspace".to_string(),
            },
        )
        .expect("project should create")
    }

    fn seed_skill(connection: &Connection, id: &str, name: &str) {
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
                    id,
                    name,
                    "github",
                    format!("owner/{name}"),
                    format!("skills/{name}"),
                    format!("{name}-hash"),
                ),
            )
            .expect("skill should insert");
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
            .execute_batch(INITIAL_SCHEMA)
            .expect("initial schema should apply");
        connection
            .execute_batch(PROJECT_ONLY_REFACTOR_SCHEMA)
            .expect("project-only schema should apply");
        connection
            .execute_batch(SKILL_SOURCE_TRACKING_SCHEMA)
            .expect("skill source tracking schema should apply");
        connection
    }

    struct TestWorkspace {
        root: PathBuf,
        home: PathBuf,
    }

    impl TestWorkspace {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time should be available")
                .as_nanos();
            let root =
                std::env::temp_dir().join(format!("skills-manager-project-skills-{name}-{unique}"));
            let home = root.join("home");
            fs::create_dir_all(&home).expect("home should be created");
            Self { root, home }
        }

        fn environment(&self) -> ReconcileEnvironment {
            ReconcileEnvironment {
                home_dir: self.home.clone(),
                managed_skills_root: self.root.join("managed-skills"),
            }
        }

        fn create_managed_skill(&self, managed_dir_name: &str) -> PathBuf {
            let target = self.root.join("managed-skills").join(managed_dir_name);
            fs::create_dir_all(&target).expect("managed skill should be created");
            fs::write(target.join("SKILL.md"), "# Test Skill\n")
                .expect("entrypoint should be written");
            target
        }

        fn assert_symlink_capable(&self, managed_target: &Path) -> bool {
            let probe_link = self.root.join("probe").join("skill");
            let check = create_skill_link(&probe_link, managed_target);
            if check.status == SkillLinkStatus::Linked {
                let _ = delete_managed_skill_link(&probe_link, &self.root.join("managed-skills"));
                return true;
            }

            assert_eq!(check.status, SkillLinkStatus::Failed);
            false
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            if self.root.exists() {
                fs::remove_dir_all(&self.root).expect("workspace should be removed");
            }
        }
    }

    fn path_string(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }
}

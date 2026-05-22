use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashSet;
use thiserror::Error;

use crate::domain::ids::stable_prefixed_id;
use crate::reconcile::{reconcile_project_record_if_enabled, ReconcileEnvironment};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CliTargetRecord {
    pub id: String,
    pub display_name: String,
    pub relative_path: String,
    pub is_common: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCliTargetRecord {
    pub id: String,
    pub project_id: String,
    pub cli_target_id: String,
    pub display_name: String,
    pub relative_path: String,
    pub is_common: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Error)]
pub enum ProjectCliTargetError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Project(#[from] crate::projects::ProjectError),
    #[error("{0}")]
    Reconcile(#[from] crate::reconcile::ReconcileError),
}

pub fn list_available_cli_targets(
    connection: &Connection,
) -> Result<Vec<CliTargetRecord>, ProjectCliTargetError> {
    let mut statement = connection.prepare(
        "SELECT id, display_name, relative_path, is_common
        FROM cli_targets
        ORDER BY is_common DESC, display_name ASC, id ASC",
    )?;

    let targets = statement
        .query_map([], |row| {
            Ok(CliTargetRecord {
                id: row.get(0)?,
                display_name: row.get(1)?,
                relative_path: row.get(2)?,
                is_common: row.get::<_, i64>(3)? == 1,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(targets)
}

pub fn list_project_cli_targets(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ProjectCliTargetRecord>, ProjectCliTargetError> {
    let mut statement = connection.prepare(
        "SELECT
            project_cli_targets.id,
            project_cli_targets.project_id,
            project_cli_targets.cli_target_id,
            cli_targets.display_name,
            cli_targets.relative_path,
            cli_targets.is_common,
            project_cli_targets.created_at,
            project_cli_targets.updated_at
        FROM project_cli_targets
        INNER JOIN cli_targets ON cli_targets.id = project_cli_targets.cli_target_id
        WHERE project_cli_targets.project_id = ?1
        ORDER BY cli_targets.is_common DESC, cli_targets.display_name ASC, cli_targets.id ASC",
    )?;

    let targets = statement
        .query_map([project_id], project_cli_target_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(targets)
}

pub fn add_project_cli_target(
    connection: &Connection,
    project_id: &str,
    cli_target_id: &str,
) -> Result<ProjectCliTargetRecord, ProjectCliTargetError> {
    let id = project_cli_target_id(project_id, cli_target_id);

    connection.execute(
        "INSERT OR IGNORE INTO project_cli_targets (id, project_id, cli_target_id)
        VALUES (?1, ?2, ?3)",
        (&id, project_id, cli_target_id),
    )?;

    get_project_cli_target(connection, project_id, cli_target_id)
}

pub fn remove_project_cli_target(
    connection: &Connection,
    project_id: &str,
    cli_target_id: &str,
) -> Result<(), ProjectCliTargetError> {
    connection.execute(
        "DELETE FROM project_cli_targets
        WHERE project_id = ?1 AND cli_target_id = ?2",
        (project_id, cli_target_id),
    )?;
    Ok(())
}

fn add_project_cli_target_and_reconcile(
    connection: &Connection,
    project_id: &str,
    cli_target_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<ProjectCliTargetRecord, ProjectCliTargetError> {
    let record = add_project_cli_target(connection, project_id, cli_target_id)?;
    reconcile_project_record_if_enabled(connection, environment, project_id)?;
    Ok(record)
}

fn remove_project_cli_target_and_reconcile(
    connection: &Connection,
    project_id: &str,
    cli_target_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<(), ProjectCliTargetError> {
    let removed_target = get_project_cli_target(connection, project_id, cli_target_id)?;
    let project = crate::projects::get_project(connection, project_id)?;
    remove_project_cli_target(connection, project_id, cli_target_id)?;
    let removed_target_dir = removed_target
        .relative_path
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .fold(std::path::PathBuf::from(project.path), |path, part| {
            path.join(part)
        });
    crate::fs_links::delete_managed_skill_links_under_root(
        &removed_target_dir,
        &environment.managed_skills_root,
        &HashSet::new(),
    );
    reconcile_project_record_if_enabled(connection, environment, project_id)?;
    Ok(())
}

#[tauri::command]
pub fn list_available_cli_target_records() -> Result<Vec<CliTargetRecord>, String> {
    with_database(list_available_cli_targets)
}

#[tauri::command]
pub fn list_project_cli_target_records(
    project_id: String,
) -> Result<Vec<ProjectCliTargetRecord>, String> {
    with_database(|connection| list_project_cli_targets(connection, &project_id))
}

#[tauri::command]
pub fn add_project_cli_target_record(
    project_id: String,
    cli_target_id: String,
) -> Result<ProjectCliTargetRecord, String> {
    with_database_and_reconcile(|connection, environment| {
        add_project_cli_target_and_reconcile(connection, &project_id, &cli_target_id, environment)
    })
}

#[tauri::command]
pub fn remove_project_cli_target_record(
    project_id: String,
    cli_target_id: String,
) -> Result<(), String> {
    with_database_and_reconcile(|connection, environment| {
        remove_project_cli_target_and_reconcile(
            connection,
            &project_id,
            &cli_target_id,
            environment,
        )
    })
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, ProjectCliTargetError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn with_database_and_reconcile<T>(
    action: impl FnOnce(&Connection, &ReconcileEnvironment) -> Result<T, ProjectCliTargetError>,
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

fn get_project_cli_target(
    connection: &Connection,
    project_id: &str,
    cli_target_id: &str,
) -> Result<ProjectCliTargetRecord, ProjectCliTargetError> {
    connection
        .query_row(
            "SELECT
                project_cli_targets.id,
                project_cli_targets.project_id,
                project_cli_targets.cli_target_id,
                cli_targets.display_name,
                cli_targets.relative_path,
                cli_targets.is_common,
                project_cli_targets.created_at,
                project_cli_targets.updated_at
            FROM project_cli_targets
            INNER JOIN cli_targets ON cli_targets.id = project_cli_targets.cli_target_id
            WHERE project_cli_targets.project_id = ?1
              AND project_cli_targets.cli_target_id = ?2",
            (project_id, cli_target_id),
            project_cli_target_from_row,
        )
        .map_err(ProjectCliTargetError::from)
}

fn project_cli_target_from_row(
    row: &rusqlite::Row<'_>,
) -> rusqlite::Result<ProjectCliTargetRecord> {
    Ok(ProjectCliTargetRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        cli_target_id: row.get(2)?,
        display_name: row.get(3)?,
        relative_path: row.get(4)?,
        is_common: row.get::<_, i64>(5)? == 1,
        created_at: row.get(6)?,
        updated_at: row.get(7)?,
    })
}

fn project_cli_target_id(project_id: &str, cli_target_id: &str) -> String {
    stable_prefixed_id(
        "project-cli-target",
        &format!("{project_id}|{cli_target_id}"),
    )
}

#[cfg(test)]
mod tests {
    use super::{
        add_project_cli_target, add_project_cli_target_and_reconcile, list_available_cli_targets,
        list_project_cli_targets, remove_project_cli_target,
    };
    use crate::fs_links::{
        check_skill_link, create_skill_link, delete_managed_skill_link, SkillLinkStatus,
    };
    use crate::reconcile::ReconcileEnvironment;
    use rusqlite::Connection;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    use crate::db::INITIAL_SCHEMA;
    use crate::projects::{create_project, ProjectInput};

    const PROJECT_ONLY_REFACTOR_SCHEMA: &str =
        include_str!("../migrations/0002_project_only_refactor.sql");

    #[test]
    fn lists_available_and_selected_project_cli_targets() {
        let connection = open_project_only_in_memory_database();
        let project = seed_project(&connection);

        connection
            .execute(
                "INSERT INTO project_cli_targets (id, project_id, cli_target_id)
                VALUES (?1, ?2, ?3)",
                ("project-cli-target-one", &project.id, "agents-skills"),
            )
            .expect("project cli target should insert");

        let available =
            list_available_cli_targets(&connection).expect("available targets should list");
        let selected = list_project_cli_targets(&connection, &project.id)
            .expect("selected targets should list");

        assert_eq!(available.len(), 3);
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].cli_target_id, "agents-skills");
        assert_eq!(selected[0].relative_path, ".agents/skills");
    }

    #[test]
    fn adds_and_removes_project_cli_target() {
        let connection = open_project_only_in_memory_database();
        let project = seed_project(&connection);

        let added = add_project_cli_target(&connection, &project.id, "codex-skills")
            .expect("project cli target should add");
        assert_eq!(added.cli_target_id, "codex-skills");
        assert_eq!(added.relative_path, ".codex/skills");

        let duplicate = add_project_cli_target(&connection, &project.id, "codex-skills")
            .expect("duplicate add should reuse existing row");
        assert_eq!(duplicate.id, added.id);

        let listed = list_project_cli_targets(&connection, &project.id)
            .expect("selected targets should list");
        assert_eq!(listed.len(), 1);

        remove_project_cli_target(&connection, &project.id, "codex-skills")
            .expect("project cli target should remove");
        let relisted = list_project_cli_targets(&connection, &project.id)
            .expect("selected targets should relist");
        assert!(relisted.is_empty());
    }

    #[test]
    fn add_project_cli_target_reconciles_existing_project_skills_when_auto_reconcile_is_enabled() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-cli-target-auto-reconcile");
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
        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-hash",
        );
        connection
            .execute(
                "INSERT INTO project_skills (id, project_id, skill_id, enabled)
                VALUES (?1, ?2, ?3, 1)",
                ("project-skill-one", &project.id, "skill-one"),
            )
            .expect("project skill should insert");

        let added = add_project_cli_target_and_reconcile(
            &connection,
            &project.id,
            "agents-skills",
            &workspace.environment(),
        )
        .expect("project cli target should add and reconcile");

        assert_eq!(added.cli_target_id, "agents-skills");
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

    fn seed_skill(connection: &Connection, id: &str, name: &str, managed_dir_name: &str) {
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
                    managed_dir_name,
                ),
            )
            .expect("skill should insert");
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
            let root = std::env::temp_dir().join(format!(
                "skills-manager-project-cli-targets-{name}-{unique}"
            ));
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

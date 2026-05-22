use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

use crate::domain::ids::stable_prefixed_id;
use crate::reconcile::{reconcile_project_record_if_enabled, ReconcileEnvironment};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroupRecord {
    pub id: String,
    pub project_id: String,
    pub group_id: String,
    pub group_name: String,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Error)]
pub enum ProjectGroupError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("{0}")]
    Reconcile(#[from] crate::reconcile::ReconcileError),
}

pub fn list_project_groups(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ProjectGroupRecord>, ProjectGroupError> {
    let mut statement = connection.prepare(
        "SELECT
            project_groups.id,
            project_groups.project_id,
            project_groups.group_id,
            skill_groups.name,
            project_groups.enabled,
            project_groups.created_at,
            project_groups.updated_at
        FROM project_groups
        INNER JOIN skill_groups ON skill_groups.id = project_groups.group_id
        WHERE project_groups.project_id = ?1
        ORDER BY skill_groups.name ASC, project_groups.group_id ASC",
    )?;

    let project_groups = statement
        .query_map([project_id], project_group_from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(project_groups)
}

pub fn add_project_group(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
) -> Result<ProjectGroupRecord, ProjectGroupError> {
    let id = project_group_id(project_id, group_id);

    connection.execute(
        "INSERT OR IGNORE INTO project_groups (id, project_id, group_id, enabled)
        VALUES (?1, ?2, ?3, 1)",
        (&id, project_id, group_id),
    )?;

    add_missing_group_skills(connection, project_id, group_id)?;
    get_project_group(connection, project_id, group_id)
}

pub fn enable_project_group(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
) -> Result<ProjectGroupRecord, ProjectGroupError> {
    connection.execute(
        "UPDATE project_groups
        SET enabled = 1, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?1 AND group_id = ?2",
        (project_id, group_id),
    )?;

    add_missing_group_skills(connection, project_id, group_id)?;
    connection.execute(
        "UPDATE project_skills
        SET enabled = 1, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?1
          AND skill_id IN (
              SELECT skill_id FROM skill_group_skills WHERE group_id = ?2
          )",
        (project_id, group_id),
    )?;

    get_project_group(connection, project_id, group_id)
}

pub fn disable_project_group(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
) -> Result<ProjectGroupRecord, ProjectGroupError> {
    connection.execute(
        "UPDATE project_groups
        SET enabled = 0, updated_at = CURRENT_TIMESTAMP
        WHERE project_id = ?1 AND group_id = ?2",
        (project_id, group_id),
    )?;

    let group_skill_ids = list_group_skill_ids(connection, group_id)?;
    let other_enabled_group_skill_ids =
        list_other_enabled_group_skill_ids(connection, project_id, group_id)?;

    for skill_id in group_skill_ids {
        if !other_enabled_group_skill_ids.contains(&skill_id) {
            connection.execute(
                "UPDATE project_skills
                SET enabled = 0, updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ?1 AND skill_id = ?2",
                (project_id, skill_id.as_str()),
            )?;
        }
    }

    get_project_group(connection, project_id, group_id)
}

pub fn remove_project_group(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
) -> Result<(), ProjectGroupError> {
    connection.execute(
        "DELETE FROM project_groups
        WHERE project_id = ?1 AND group_id = ?2",
        (project_id, group_id),
    )?;
    Ok(())
}

fn add_project_group_and_reconcile(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<ProjectGroupRecord, ProjectGroupError> {
    let record = add_project_group(connection, project_id, group_id)?;
    reconcile_project_record_if_enabled(connection, environment, project_id)?;
    Ok(record)
}

fn enable_project_group_and_reconcile(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<ProjectGroupRecord, ProjectGroupError> {
    let record = enable_project_group(connection, project_id, group_id)?;
    reconcile_project_record_if_enabled(connection, environment, project_id)?;
    Ok(record)
}

fn disable_project_group_and_reconcile(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<ProjectGroupRecord, ProjectGroupError> {
    let record = disable_project_group(connection, project_id, group_id)?;
    reconcile_project_record_if_enabled(connection, environment, project_id)?;
    Ok(record)
}

fn remove_project_group_and_reconcile(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
    environment: &ReconcileEnvironment,
) -> Result<(), ProjectGroupError> {
    remove_project_group(connection, project_id, group_id)?;
    reconcile_project_record_if_enabled(connection, environment, project_id)?;
    Ok(())
}

#[tauri::command]
pub fn list_project_group_records(project_id: String) -> Result<Vec<ProjectGroupRecord>, String> {
    with_database(|connection| list_project_groups(connection, &project_id))
}

#[tauri::command]
pub fn add_project_group_record(
    project_id: String,
    group_id: String,
) -> Result<ProjectGroupRecord, String> {
    with_database_and_reconcile(|connection, environment| {
        add_project_group_and_reconcile(connection, &project_id, &group_id, environment)
    })
}

#[tauri::command]
pub fn enable_project_group_record(
    project_id: String,
    group_id: String,
) -> Result<ProjectGroupRecord, String> {
    with_database_and_reconcile(|connection, environment| {
        enable_project_group_and_reconcile(connection, &project_id, &group_id, environment)
    })
}

#[tauri::command]
pub fn disable_project_group_record(
    project_id: String,
    group_id: String,
) -> Result<ProjectGroupRecord, String> {
    with_database_and_reconcile(|connection, environment| {
        disable_project_group_and_reconcile(connection, &project_id, &group_id, environment)
    })
}

#[tauri::command]
pub fn remove_project_group_record(project_id: String, group_id: String) -> Result<(), String> {
    with_database_and_reconcile(|connection, environment| {
        remove_project_group_and_reconcile(connection, &project_id, &group_id, environment)
    })
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, ProjectGroupError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn with_database_and_reconcile<T>(
    action: impl FnOnce(&Connection, &ReconcileEnvironment) -> Result<T, ProjectGroupError>,
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

fn get_project_group(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
) -> Result<ProjectGroupRecord, ProjectGroupError> {
    connection
        .query_row(
            "SELECT
                project_groups.id,
                project_groups.project_id,
                project_groups.group_id,
                skill_groups.name,
                project_groups.enabled,
                project_groups.created_at,
                project_groups.updated_at
            FROM project_groups
            INNER JOIN skill_groups ON skill_groups.id = project_groups.group_id
            WHERE project_groups.project_id = ?1 AND project_groups.group_id = ?2",
            (project_id, group_id),
            project_group_from_row,
        )
        .map_err(ProjectGroupError::from)
}

fn project_group_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ProjectGroupRecord> {
    Ok(ProjectGroupRecord {
        id: row.get(0)?,
        project_id: row.get(1)?,
        group_id: row.get(2)?,
        group_name: row.get(3)?,
        enabled: row.get::<_, i64>(4)? == 1,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

fn add_missing_group_skills(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
) -> Result<(), ProjectGroupError> {
    let skill_ids = list_group_skill_ids(connection, group_id)?;

    for skill_id in skill_ids {
        let id = project_skill_id(project_id, &skill_id);
        connection.execute(
            "INSERT OR IGNORE INTO project_skills (id, project_id, skill_id, enabled)
            VALUES (?1, ?2, ?3, 1)",
            (&id, project_id, skill_id.as_str()),
        )?;
    }

    Ok(())
}

fn list_group_skill_ids(
    connection: &Connection,
    group_id: &str,
) -> Result<Vec<String>, ProjectGroupError> {
    let mut statement = connection.prepare(
        "SELECT skill_id
        FROM skill_group_skills
        WHERE group_id = ?1
        ORDER BY skill_id ASC",
    )?;

    let skill_ids = statement
        .query_map([group_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(skill_ids)
}

fn list_other_enabled_group_skill_ids(
    connection: &Connection,
    project_id: &str,
    group_id: &str,
) -> Result<std::collections::HashSet<String>, ProjectGroupError> {
    let mut statement = connection.prepare(
        "SELECT DISTINCT skill_group_skills.skill_id
        FROM skill_group_skills
        INNER JOIN project_groups ON project_groups.group_id = skill_group_skills.group_id
        WHERE project_groups.project_id = ?1
          AND project_groups.enabled = 1
          AND project_groups.group_id != ?2",
    )?;

    let skill_ids = statement
        .query_map((project_id, group_id), |row| row.get::<_, String>(0))?
        .collect::<Result<std::collections::HashSet<_>, _>>()?;

    Ok(skill_ids)
}

fn project_group_id(project_id: &str, group_id: &str) -> String {
    stable_prefixed_id("project-group", &format!("{project_id}|{group_id}"))
}

fn project_skill_id(project_id: &str, skill_id: &str) -> String {
    stable_prefixed_id("project-skill", &format!("{project_id}|{skill_id}"))
}

#[cfg(test)]
mod tests {
    use super::{
        add_project_group, disable_project_group, enable_project_group, list_project_groups,
        remove_project_group,
    };
    use rusqlite::Connection;

    use crate::db::INITIAL_SCHEMA;
    use crate::projects::{create_project, ProjectInput};

    const PROJECT_ONLY_REFACTOR_SCHEMA: &str =
        include_str!("../migrations/0002_project_only_refactor.sql");

    #[test]
    fn adds_and_lists_project_groups_and_auto_adds_group_skills() {
        let connection = open_project_only_in_memory_database();
        let project = seed_project(&connection);
        seed_skill(&connection, "skill-one", "grill-with-docs");
        seed_skill(&connection, "skill-two", "systematic-debugging");
        seed_group_with_skills(
            &connection,
            "group-one",
            "Frontend",
            &["skill-one", "skill-two"],
        );

        let added = add_project_group(&connection, &project.id, "group-one")
            .expect("project group should add");

        assert_eq!(added.project_id, project.id);
        assert_eq!(added.group_id, "group-one");
        assert_eq!(added.group_name, "Frontend");
        assert!(added.enabled);

        let listed =
            list_project_groups(&connection, &project.id).expect("project groups should list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0], added);
        assert_eq!(count_rows(&connection, "project_skills"), 2);

        let duplicate = add_project_group(&connection, &project.id, "group-one")
            .expect("duplicate add should reuse existing row");
        assert_eq!(duplicate.id, added.id);
        assert_eq!(count_rows(&connection, "project_groups"), 1);
        assert_eq!(count_rows(&connection, "project_skills"), 2);
    }

    #[test]
    fn disables_and_reenables_group_and_preserves_skills_covered_by_other_enabled_groups() {
        let connection = open_project_only_in_memory_database();
        let project = seed_project(&connection);
        seed_skill(&connection, "skill-one", "grill-with-docs");
        seed_skill(&connection, "skill-two", "systematic-debugging");
        seed_group_with_skills(
            &connection,
            "group-one",
            "Frontend",
            &["skill-one", "skill-two"],
        );
        seed_group_with_skills(&connection, "group-two", "Shared", &["skill-one"]);

        add_project_group(&connection, &project.id, "group-one").expect("project group should add");
        add_project_group(&connection, &project.id, "group-two")
            .expect("second project group should add");

        let disabled = disable_project_group(&connection, &project.id, "group-one")
            .expect("project group should disable");
        assert!(!disabled.enabled);

        assert_eq!(
            project_skill_enabled(&connection, &project.id, "skill-one"),
            Some(true)
        );
        assert_eq!(
            project_skill_enabled(&connection, &project.id, "skill-two"),
            Some(false)
        );

        let enabled = enable_project_group(&connection, &project.id, "group-one")
            .expect("project group should enable");
        assert!(enabled.enabled);
        assert_eq!(
            project_skill_enabled(&connection, &project.id, "skill-one"),
            Some(true)
        );
        assert_eq!(
            project_skill_enabled(&connection, &project.id, "skill-two"),
            Some(true)
        );
    }

    #[test]
    fn removing_project_group_keeps_project_skills() {
        let connection = open_project_only_in_memory_database();
        let project = seed_project(&connection);
        seed_skill(&connection, "skill-one", "grill-with-docs");
        seed_group_with_skills(&connection, "group-one", "Frontend", &["skill-one"]);

        add_project_group(&connection, &project.id, "group-one").expect("project group should add");
        remove_project_group(&connection, &project.id, "group-one")
            .expect("project group should remove");

        let listed =
            list_project_groups(&connection, &project.id).expect("project groups should list");
        assert!(listed.is_empty());
        assert_eq!(count_rows(&connection, "project_groups"), 0);
        assert_eq!(count_rows(&connection, "project_skills"), 1);
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

    fn seed_group_with_skills(connection: &Connection, id: &str, name: &str, skill_ids: &[&str]) {
        connection
            .execute(
                "INSERT INTO skill_groups (id, name) VALUES (?1, ?2)",
                (id, name),
            )
            .expect("group should insert");

        for skill_id in skill_ids {
            connection
                .execute(
                    "INSERT INTO skill_group_skills (group_id, skill_id) VALUES (?1, ?2)",
                    (id, skill_id),
                )
                .expect("group skill should insert");
        }
    }

    fn project_skill_enabled(
        connection: &Connection,
        project_id: &str,
        skill_id: &str,
    ) -> Option<bool> {
        connection
            .query_row(
                "SELECT enabled FROM project_skills WHERE project_id = ?1 AND skill_id = ?2",
                (project_id, skill_id),
                |row| row.get::<_, i64>(0),
            )
            .ok()
            .map(|value| value == 1)
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
    }
}

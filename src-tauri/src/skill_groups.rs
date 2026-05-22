use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::domain::ids::stable_prefixed_id;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillGroup {
    pub id: String,
    pub name: String,
    pub skills: Vec<GroupSkill>,
    pub active_project_count: i64,
    pub attached_project_count: i64,
    pub project_usages: Vec<ProjectGroupUsage>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupSkill {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectGroupUsage {
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillGroupInput {
    pub name: String,
}

#[derive(Debug, Error)]
pub enum SkillGroupError {
    #[error("group name is required")]
    GroupNameRequired,
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub fn list_skill_groups(connection: &Connection) -> Result<Vec<SkillGroup>, SkillGroupError> {
    let mut statement = connection.prepare(
        "SELECT id, name, created_at, updated_at
        FROM skill_groups
        ORDER BY name ASC",
    )?;

    let group_headers = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    group_headers
        .into_iter()
        .map(|(id, name, created_at, updated_at)| {
            hydrate_group(connection, id, name, created_at, updated_at)
        })
        .collect()
}

pub fn create_skill_group(
    connection: &Connection,
    input: SkillGroupInput,
) -> Result<SkillGroup, SkillGroupError> {
    let input = normalize_group_input(input)?;
    let id = stable_id("skill-group", &input.name);

    connection.execute(
        "INSERT INTO skill_groups (id, name)
        VALUES (?1, ?2)",
        (&id, &input.name),
    )?;

    get_skill_group(connection, &id)
}

pub fn delete_skill_group(connection: &Connection, id: &str) -> Result<(), SkillGroupError> {
    connection.execute("DELETE FROM skill_groups WHERE id = ?1", [id])?;
    Ok(())
}

pub fn add_skill_to_group(
    connection: &Connection,
    group_id: &str,
    skill_id: &str,
) -> Result<SkillGroup, SkillGroupError> {
    connection.execute(
        "INSERT OR IGNORE INTO skill_group_skills (group_id, skill_id)
        VALUES (?1, ?2)",
        (group_id, skill_id),
    )?;

    get_skill_group(connection, group_id)
}

pub fn remove_skill_from_group(
    connection: &Connection,
    group_id: &str,
    skill_id: &str,
) -> Result<SkillGroup, SkillGroupError> {
    connection.execute(
        "DELETE FROM skill_group_skills
        WHERE group_id = ?1 AND skill_id = ?2",
        (group_id, skill_id),
    )?;

    get_skill_group(connection, group_id)
}

#[tauri::command]
pub fn list_skill_group_records() -> Result<Vec<SkillGroup>, String> {
    with_database(|connection| list_skill_groups(connection))
}

#[tauri::command]
pub fn create_skill_group_record(input: SkillGroupInput) -> Result<SkillGroup, String> {
    with_database(|connection| create_skill_group(connection, input))
}

#[tauri::command]
pub fn delete_skill_group_record(id: String) -> Result<(), String> {
    with_database(|connection| delete_skill_group(connection, &id))
}

#[tauri::command]
pub fn add_skill_to_group_record(group_id: String, skill_id: String) -> Result<SkillGroup, String> {
    with_database(|connection| add_skill_to_group(connection, &group_id, &skill_id))
}

#[tauri::command]
pub fn remove_skill_from_group_record(
    group_id: String,
    skill_id: String,
) -> Result<SkillGroup, String> {
    with_database(|connection| remove_skill_from_group(connection, &group_id, &skill_id))
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, SkillGroupError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;

    action(&connection).map_err(|error| error.to_string())
}

fn get_skill_group(connection: &Connection, id: &str) -> Result<SkillGroup, SkillGroupError> {
    let header = connection.query_row(
        "SELECT id, name, created_at, updated_at
        FROM skill_groups
        WHERE id = ?1",
        [id],
        |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
            ))
        },
    )?;

    hydrate_group(connection, header.0, header.1, header.2, header.3)
}

fn hydrate_group(
    connection: &Connection,
    id: String,
    name: String,
    created_at: String,
    updated_at: String,
) -> Result<SkillGroup, SkillGroupError> {
    let project_usages = list_project_usages(connection, &id)?;
    let active_project_count = project_usages.iter().filter(|usage| usage.enabled).count() as i64;
    let attached_project_count = project_usages.len() as i64;

    Ok(SkillGroup {
        skills: list_group_skills(connection, &id)?,
        project_usages,
        active_project_count,
        attached_project_count,
        id,
        name,
        created_at,
        updated_at,
    })
}

fn list_group_skills(
    connection: &Connection,
    group_id: &str,
) -> Result<Vec<GroupSkill>, SkillGroupError> {
    let mut statement = connection.prepare(
        "SELECT skills.id, skills.name, skills.source_type, skills.source_ref, skills.skill_path
        FROM skills
        INNER JOIN skill_group_skills ON skill_group_skills.skill_id = skills.id
        WHERE skill_group_skills.group_id = ?1
        ORDER BY skills.name ASC, skills.source_ref ASC, skills.skill_path ASC",
    )?;

    let skills = statement
        .query_map([group_id], |row| {
            Ok(GroupSkill {
                id: row.get(0)?,
                name: row.get(1)?,
                source_type: row.get(2)?,
                source_ref: row.get(3)?,
                skill_path: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(SkillGroupError::from)?;

    Ok(skills)
}

fn list_project_usages(
    connection: &Connection,
    group_id: &str,
) -> Result<Vec<ProjectGroupUsage>, SkillGroupError> {
    let mut statement = connection.prepare(
        "SELECT
            projects.id,
            projects.name,
            projects.path,
            project_groups.enabled
        FROM project_groups
        INNER JOIN projects ON projects.id = project_groups.project_id
        WHERE project_groups.group_id = ?1
        ORDER BY projects.name ASC, projects.path ASC",
    )?;

    let usages = statement
        .query_map([group_id], |row| {
            Ok(ProjectGroupUsage {
                project_id: row.get(0)?,
                project_name: row.get(1)?,
                project_path: row.get(2)?,
                enabled: row.get::<_, i64>(3)? == 1,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
        .map_err(SkillGroupError::from)?;

    Ok(usages)
}

fn normalize_group_input(input: SkillGroupInput) -> Result<SkillGroupInput, SkillGroupError> {
    let name = input.name.trim().to_string();

    if name.is_empty() {
        return Err(SkillGroupError::GroupNameRequired);
    }

    Ok(SkillGroupInput { name })
}

fn stable_id(prefix: &str, value: &str) -> String {
    stable_prefixed_id(prefix, value)
}

#[cfg(test)]
mod tests {
    use crate::db::INITIAL_SCHEMA;
    use rusqlite::Connection;

    use super::{
        add_skill_to_group, create_skill_group, delete_skill_group, list_skill_groups,
        remove_skill_from_group, SkillGroupInput,
    };

    const PROJECT_ONLY_REFACTOR_SCHEMA: &str =
        include_str!("../migrations/0002_project_only_refactor.sql");

    #[test]
    fn creates_group_without_legacy_project_targets() {
        let connection = open_project_only_database();

        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Project Agents".to_string(),
            },
        )
        .expect("group should create");

        assert_eq!(group.name, "Project Agents");
        assert!(group.skills.is_empty());
        assert_eq!(group.active_project_count, 0);
        assert_eq!(group.attached_project_count, 0);
        assert!(group.project_usages.is_empty());
    }

    #[test]
    fn deleting_group_keeps_skills_and_removes_project_usage_rows() {
        let connection = open_project_only_database();
        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Workspace Group".to_string(),
            },
        )
        .expect("group should create");
        connection
            .execute(
                "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
                (
                    "project-one",
                    "Skills Manager",
                    "D:/Development/nodejs/SkillsManager",
                ),
            )
            .expect("project should insert");
        connection
            .execute(
                "INSERT INTO project_groups (id, project_id, group_id, enabled)
                VALUES (?1, ?2, ?3, 1)",
                ("project-group-one", "project-one", &group.id),
            )
            .expect("project group should insert");

        delete_skill_group(&connection, &group.id).expect("group should delete");

        let retained_projects: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM projects WHERE id = 'project-one'",
                [],
                |row| row.get(0),
            )
            .expect("project count should query");
        let retained_usage_rows: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM project_groups WHERE group_id = ?1",
                [&group.id],
                |row| row.get(0),
            )
            .expect("usage count should query");

        assert_eq!(retained_projects, 1);
        assert_eq!(retained_usage_rows, 0);
    }

    #[test]
    fn adds_installed_skill_to_group_without_legacy_link_mode() {
        let connection = open_project_only_database();
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
                    "skill-grill",
                    "grill-with-docs",
                    "github",
                    "owner/repo",
                    "skills/grill-with-docs",
                    "grill-with-docs-499b7424",
                ),
            )
            .expect("skill should insert");
        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Docs Group".to_string(),
            },
        )
        .expect("group should create");

        let group =
            add_skill_to_group(&connection, &group.id, "skill-grill").expect("skill should attach");

        assert_eq!(group.skills.len(), 1);
        assert_eq!(group.skills[0].id, "skill-grill");
        assert_eq!(group.skills[0].name, "grill-with-docs");
        assert_eq!(group.skills[0].source_type, "github");
        assert_eq!(group.skills[0].source_ref, "owner/repo");
        assert_eq!(group.skills[0].skill_path, "skills/grill-with-docs");

        delete_skill_group(&connection, &group.id).expect("group should delete");

        let retained_skills: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE id = 'skill-grill'",
                [],
                |row| row.get(0),
            )
            .expect("skill count should query");
        let retained_links: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_group_skills WHERE group_id = ?1",
                [&group.id],
                |row| row.get(0),
            )
            .expect("association count should query");

        assert_eq!(retained_skills, 1);
        assert_eq!(retained_links, 0);
    }

    #[test]
    fn removing_skill_from_group_keeps_skill_record_and_updates_membership() {
        let connection = open_project_only_database();
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
                    "skill-remove",
                    "systematic-debugging",
                    "github",
                    "owner/repo",
                    "skills/systematic-debugging",
                    "systematic-debugging-499b7424",
                ),
            )
            .expect("skill should insert");
        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Debug Group".to_string(),
            },
        )
        .expect("group should create");
        add_skill_to_group(&connection, &group.id, "skill-remove").expect("skill should attach");

        let updated = remove_skill_from_group(&connection, &group.id, "skill-remove")
            .expect("skill should detach");

        assert!(updated.skills.is_empty());

        let retained_skills: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skills WHERE id = 'skill-remove'",
                [],
                |row| row.get(0),
            )
            .expect("skill count should query");
        let retained_links: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM skill_group_skills WHERE group_id = ?1",
                [&group.id],
                |row| row.get(0),
            )
            .expect("association count should query");

        assert_eq!(retained_skills, 1);
        assert_eq!(retained_links, 0);
    }

    #[test]
    fn lists_groups_with_skills_and_project_usage_counts() {
        let connection = open_project_only_database();
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
                    "skill-review",
                    "requesting-code-review",
                    "github",
                    "owner/repo",
                    "skills/requesting-code-review",
                    "requesting-code-review-499b7424",
                ),
            )
            .expect("skill should insert");
        let group = create_skill_group(
            &connection,
            SkillGroupInput {
                name: "Review Group".to_string(),
            },
        )
        .expect("group should create");
        add_skill_to_group(&connection, &group.id, "skill-review").expect("skill should attach");
        connection
            .execute(
                "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3), (?4, ?5, ?6)",
                (
                    "project-one",
                    "Skills Manager",
                    "D:/Development/nodejs/SkillsManager",
                    "project-two",
                    "Docs Site",
                    "D:/Development/docs/site",
                ),
            )
            .expect("projects should insert");
        connection
            .execute(
                "INSERT INTO project_groups (id, project_id, group_id, enabled)
                VALUES (?1, ?2, ?3, 1), (?4, ?5, ?6, 0)",
                (
                    "project-group-one",
                    "project-one",
                    &group.id,
                    "project-group-two",
                    "project-two",
                    &group.id,
                ),
            )
            .expect("project usage rows should insert");

        let groups = list_skill_groups(&connection).expect("groups should list");

        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].name, "Review Group");
        assert_eq!(groups[0].skills.len(), 1);
        assert_eq!(groups[0].active_project_count, 1);
        assert_eq!(groups[0].attached_project_count, 2);
        assert_eq!(groups[0].project_usages.len(), 2);
        assert_eq!(groups[0].project_usages[0].project_name, "Docs Site");
        assert!(!groups[0].project_usages[0].enabled);
        assert_eq!(groups[0].project_usages[1].project_name, "Skills Manager");
        assert!(groups[0].project_usages[1].enabled);
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

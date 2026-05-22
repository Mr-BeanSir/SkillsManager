use std::fs;
use std::path::{Component, Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFileTreeEntry {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub editable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillProjectUsage {
    pub project_id: String,
    pub project_name: String,
    pub project_path: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDetailRecord {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
    pub managed_dir_name: String,
    pub managed_root_path: String,
    pub update_available: bool,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
    pub attached_project_count: i64,
    pub project_usages: Vec<SkillProjectUsage>,
    pub file_tree: Vec<SkillFileTreeEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillFileRecord {
    pub path: String,
    pub contents: String,
}

#[derive(Debug, Clone)]
struct SkillMetadata {
    id: String,
    name: String,
    source_type: String,
    source_ref: String,
    skill_path: String,
    managed_dir_name: String,
    update_available: bool,
    installed_version: Option<String>,
    latest_version: Option<String>,
}

#[derive(Debug, Error)]
pub enum SkillFileError {
    #[error("skill {0} was not found")]
    SkillNotFound(String),
    #[error("unsupported file type for {0}")]
    UnsupportedFileType(String),
    #[error("skill file path must stay inside the managed skill root")]
    InvalidRelativePath,
    #[error("skill file parent directory is missing")]
    MissingParentDirectory,
    #[error("managed skill root is missing")]
    MissingSkillRoot,
    #[error("filesystem error: {0}")]
    Filesystem(#[from] std::io::Error),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
}

pub fn load_skill_detail(
    connection: &Connection,
    skill_root: &Path,
    skill_id: &str,
) -> Result<SkillDetailRecord, SkillFileError> {
    let metadata = get_skill_metadata(connection, skill_id)?;
    let project_usages = list_project_usages(connection, skill_id)?;
    let file_tree = list_skill_tree(skill_root)?;

    Ok(SkillDetailRecord {
        id: metadata.id,
        name: metadata.name,
        source_type: metadata.source_type,
        source_ref: metadata.source_ref,
        skill_path: metadata.skill_path,
        managed_dir_name: metadata.managed_dir_name,
        managed_root_path: skill_root.to_string_lossy().into_owned(),
        update_available: metadata.update_available,
        installed_version: metadata.installed_version,
        latest_version: metadata.latest_version,
        attached_project_count: project_usages.len() as i64,
        project_usages,
        file_tree,
    })
}

pub fn normalize_relative_skill_path(relative_path: &str) -> Result<PathBuf, SkillFileError> {
    let candidate = Path::new(relative_path);

    if relative_path.trim().is_empty() || candidate.is_absolute() {
        return Err(SkillFileError::InvalidRelativePath);
    }

    let mut normalized = PathBuf::new();

    for component in candidate.components() {
        match component {
            Component::Normal(part) => normalized.push(part),
            Component::CurDir => {}
            Component::Prefix(_) | Component::RootDir | Component::ParentDir => {
                return Err(SkillFileError::InvalidRelativePath)
            }
        }
    }

    if normalized.as_os_str().is_empty() {
        return Err(SkillFileError::InvalidRelativePath);
    }

    Ok(normalized)
}

pub fn read_skill_file_contents(
    skill_root: &Path,
    relative_path: &str,
) -> Result<String, SkillFileError> {
    let resolved_path = resolve_skill_file_path(skill_root, relative_path)?;
    Ok(fs::read_to_string(resolved_path)?)
}

pub fn write_skill_file_contents(
    skill_root: &Path,
    relative_path: &str,
    contents: String,
) -> Result<(), SkillFileError> {
    let resolved_path = resolve_skill_file_path(skill_root, relative_path)?;
    fs::write(resolved_path, contents)?;
    Ok(())
}

#[tauri::command]
pub fn get_skill_detail(skill_id: String) -> Result<SkillDetailRecord, String> {
    with_database_and_skill_root(&skill_id, |connection, skill_root| {
        load_skill_detail(connection, skill_root, &skill_id)
    })
}

#[tauri::command]
pub fn read_skill_file(skill_id: String, relative_path: String) -> Result<SkillFileRecord, String> {
    with_database_and_skill_root(&skill_id, |_connection, skill_root| {
        let contents = read_skill_file_contents(skill_root, &relative_path)?;
        Ok(SkillFileRecord {
            path: normalize_relative_skill_path(&relative_path)?
                .to_string_lossy()
                .replace('\\', "/"),
            contents,
        })
    })
}

#[tauri::command]
pub fn write_skill_file(
    skill_id: String,
    relative_path: String,
    contents: String,
) -> Result<(), String> {
    with_database_and_skill_root(&skill_id, |_connection, skill_root| {
        write_skill_file_contents(skill_root, &relative_path, contents)
    })
}

fn with_database_and_skill_root<T>(
    skill_id: &str,
    action: impl FnOnce(&Connection, &Path) -> Result<T, SkillFileError>,
) -> Result<T, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;
    let managed_skills_root =
        crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;
    let metadata = get_skill_metadata(&connection, skill_id).map_err(|error| error.to_string())?;
    let skill_root = managed_skills_root.join(metadata.managed_dir_name);

    action(&connection, &skill_root).map_err(|error| error.to_string())
}

fn get_skill_metadata(
    connection: &Connection,
    skill_id: &str,
) -> Result<SkillMetadata, SkillFileError> {
    connection
        .query_row(
            "SELECT
                id,
                name,
                source_type,
                source_ref,
                skill_path,
                managed_dir_name,
                update_available,
                installed_version,
                latest_version
             FROM skills
             WHERE id = ?1",
            [skill_id],
            |row| {
                Ok(SkillMetadata {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    source_type: row.get(2)?,
                    source_ref: row.get(3)?,
                    skill_path: row.get(4)?,
                    managed_dir_name: row.get(5)?,
                    update_available: row.get::<_, i64>(6)? == 1,
                    installed_version: row.get(7)?,
                    latest_version: row.get(8)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                SkillFileError::SkillNotFound(skill_id.to_string())
            }
            other => SkillFileError::Sqlite(other),
        })
}

fn list_project_usages(
    connection: &Connection,
    skill_id: &str,
) -> Result<Vec<SkillProjectUsage>, SkillFileError> {
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
            Ok(SkillProjectUsage {
                project_id: row.get(0)?,
                project_name: row.get(1)?,
                project_path: row.get(2)?,
                enabled: row.get::<_, i64>(3)? == 1,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(usages)
}

fn list_skill_tree(skill_root: &Path) -> Result<Vec<SkillFileTreeEntry>, SkillFileError> {
    if !skill_root.exists() {
        return Err(SkillFileError::MissingSkillRoot);
    }

    let canonical_root = fs::canonicalize(skill_root)?;
    let mut entries = Vec::new();
    collect_skill_tree_entries(&canonical_root, &canonical_root, &mut entries)?;
    entries.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(entries)
}

fn collect_skill_tree_entries(
    root: &Path,
    current: &Path,
    entries: &mut Vec<SkillFileTreeEntry>,
) -> Result<(), SkillFileError> {
    let mut children = fs::read_dir(current)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(|entry| entry.file_name());

    for child in children {
        let child_path = child.path();
        let file_name = child.file_name().to_string_lossy().into_owned();
        let metadata = child.metadata()?;

        if metadata.is_dir() {
            if file_name.starts_with('.') {
                continue;
            }

            let relative_path = to_relative_display_path(root, &child_path);
            entries.push(SkillFileTreeEntry {
                path: relative_path,
                name: file_name,
                kind: "directory".to_string(),
                editable: false,
            });
            collect_skill_tree_entries(root, &child_path, entries)?;
            continue;
        }

        if metadata.is_file() && is_supported_text_file(&file_name) {
            let relative_path = to_relative_display_path(root, &child_path);
            entries.push(SkillFileTreeEntry {
                path: relative_path,
                name: file_name,
                kind: "file".to_string(),
                editable: true,
            });
        }
    }

    Ok(())
}

fn resolve_skill_file_path(
    skill_root: &Path,
    relative_path: &str,
) -> Result<PathBuf, SkillFileError> {
    if !skill_root.exists() {
        return Err(SkillFileError::MissingSkillRoot);
    }

    let normalized = normalize_relative_skill_path(relative_path)?;
    let file_name = normalized
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or(SkillFileError::InvalidRelativePath)?;

    if !is_supported_text_file(file_name) {
        return Err(SkillFileError::UnsupportedFileType(
            relative_path.to_string(),
        ));
    }

    let canonical_root = fs::canonicalize(skill_root)?;
    let candidate = canonical_root.join(&normalized);
    let parent = candidate
        .parent()
        .ok_or(SkillFileError::MissingParentDirectory)?;

    if !parent.exists() {
        return Err(SkillFileError::MissingParentDirectory);
    }

    let canonical_parent = fs::canonicalize(parent)?;
    if !canonical_parent.starts_with(&canonical_root) {
        return Err(SkillFileError::InvalidRelativePath);
    }

    Ok(candidate)
}

fn to_relative_display_path(root: &Path, path: &Path) -> String {
    path.strip_prefix(root)
        .unwrap_or(path)
        .to_string_lossy()
        .replace('\\', "/")
}

fn is_supported_text_file(file_name: &str) -> bool {
    let lowered = file_name.to_ascii_lowercase();
    lowered.ends_with(".md")
        || lowered.ends_with(".txt")
        || lowered.ends_with(".json")
        || lowered.ends_with(".yaml")
        || lowered.ends_with(".yml")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    use rusqlite::Connection;

    use super::{
        load_skill_detail, normalize_relative_skill_path, read_skill_file_contents,
        write_skill_file_contents,
    };
    use crate::db::CURRENT_SCHEMA;

    #[test]
    fn rejects_absolute_and_traversal_paths() {
        assert!(normalize_relative_skill_path("../outside.md").is_err());
        assert!(normalize_relative_skill_path("..\\outside.md").is_err());
        assert!(normalize_relative_skill_path("C:/temp/outside.md").is_err());
        assert_eq!(
            normalize_relative_skill_path("docs/guide.md").expect("path should normalize"),
            PathBuf::from("docs").join("guide.md")
        );
    }

    #[test]
    fn reads_and_writes_supported_text_files_inside_the_skill_root() {
        let root = temporary_dir("skill-files-read-write");
        fs::write(root.join("SKILL.md"), "# Original").expect("seed file should write");

        let original =
            read_skill_file_contents(&root, "SKILL.md").expect("supported file should read");
        assert_eq!(original, "# Original");

        write_skill_file_contents(&root, "SKILL.md", "# Updated".to_string())
            .expect("supported file should write");

        let updated =
            read_skill_file_contents(&root, "SKILL.md").expect("updated file should read");
        assert_eq!(updated, "# Updated");

        fs::remove_dir_all(root).expect("temp dir should clean up");
    }

    #[test]
    fn rejects_unsupported_file_types_even_inside_the_skill_root() {
        let root = temporary_dir("skill-files-unsupported");
        fs::write(root.join("image.png"), "not really a png").expect("seed file should write");

        let read_attempt = read_skill_file_contents(&root, "image.png");
        assert!(read_attempt.is_err());

        let write_attempt = write_skill_file_contents(&root, "image.png", "binary".to_string());
        assert!(write_attempt.is_err());

        fs::remove_dir_all(root).expect("temp dir should clean up");
    }

    #[test]
    fn loads_skill_detail_with_project_usage_and_a_filtered_file_tree() {
        let connection = Connection::open_in_memory().expect("database should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(CURRENT_SCHEMA)
            .expect("current schema should apply");
        connection
            .execute(
                "INSERT INTO skills (
                    id,
                    name,
                    source_type,
                    source_ref,
                    skill_path,
                    managed_dir_name,
                    installed_version,
                    latest_version,
                    update_available
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                (
                    "skill-grill",
                    "grill-with-docs",
                    "github",
                    "owner/repo",
                    "skills/grill-with-docs",
                    "grill-with-docs-499b7424",
                    "1.0.0",
                    "1.0.0",
                    0,
                ),
            )
            .expect("skill should insert");
        connection
            .execute(
                "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
                (
                    "project-skills-manager",
                    "Skills Manager",
                    "D:/Development/nodejs/SkillsManager",
                ),
            )
            .expect("project should insert");
        connection
            .execute(
                "INSERT INTO project_skills (id, project_id, skill_id, enabled)
                VALUES (?1, ?2, ?3, ?4)",
                (
                    "project-skill-one",
                    "project-skills-manager",
                    "skill-grill",
                    1,
                ),
            )
            .expect("project skill should insert");

        let managed_root = temporary_dir("skill-files-detail");
        fs::create_dir_all(managed_root.join("docs")).expect("docs dir should create");
        fs::write(managed_root.join("SKILL.md"), "# grill-with-docs").expect("skill file writes");
        fs::write(managed_root.join("docs").join("guide.md"), "guide").expect("guide writes");
        fs::write(managed_root.join("preview.png"), "binary").expect("binary writes");

        let detail = load_skill_detail(&connection, &managed_root, "skill-grill")
            .expect("detail should load");

        assert_eq!(detail.id, "skill-grill");
        assert_eq!(detail.name, "grill-with-docs");
        assert_eq!(detail.attached_project_count, 1);
        assert_eq!(detail.project_usages.len(), 1);
        assert_eq!(detail.project_usages[0].project_name, "Skills Manager");
        assert!(detail
            .file_tree
            .iter()
            .any(|entry| entry.path == "SKILL.md" && entry.editable));
        assert!(detail
            .file_tree
            .iter()
            .any(|entry| entry.path == "docs/guide.md" && entry.editable));
        assert!(!detail
            .file_tree
            .iter()
            .any(|entry| entry.path == "preview.png"));

        fs::remove_dir_all(managed_root).expect("temp dir should clean up");
    }

    fn temporary_dir(prefix: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "{prefix}-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time should be after epoch")
                .as_nanos()
        ));
        fs::create_dir_all(&path).expect("temp dir should create");
        path
    }
}

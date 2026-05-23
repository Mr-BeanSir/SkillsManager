use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReconcileEnvironment {
    pub home_dir: PathBuf,
    pub managed_skills_root: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReconcileSummary {
    pub reconciled_links: usize,
}

#[derive(Debug, Error)]
pub enum ReconcileError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("failed to create target directory {path}: {source}")]
    CreateTargetDirectory {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("{message}")]
    SymlinkFailed { message: String },
}

#[tauri::command]
pub fn reconcile_project_group_records() -> Result<ReconcileSummary, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;
    let home_dir =
        dirs::home_dir().ok_or_else(|| "could not resolve the user home directory".to_string())?;
    let managed_skills_root =
        crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;

    reconcile_project_groups(
        &connection,
        &ReconcileEnvironment {
            home_dir,
            managed_skills_root,
        },
    )
    .map_err(|error| error.to_string())
}

pub fn reconcile_project_groups(
    connection: &Connection,
    environment: &ReconcileEnvironment,
) -> Result<ReconcileSummary, ReconcileError> {
    let expected_links = expected_project_links(connection, environment)?;
    let managed_root = normalize_path(&environment.managed_skills_root);
    let mut reconciled_links = 0usize;
    let mut expected_by_target_dir = HashMap::<String, HashSet<String>>::new();
    let mut expected_link_paths = HashSet::<String>::new();

    for expected_link in &expected_links {
        if let Some(target_dir) = ensure_target_directory(&expected_link.target_dir)? {
            let link_path = target_dir.join(&expected_link.skill_name);
            let link_key = path_string(&link_path);
            expected_link_paths.insert(link_key.clone());
            expected_by_target_dir
                .entry(path_string(&target_dir))
                .or_default()
                .insert(link_key.clone());

            let check =
                crate::fs_links::create_skill_link(&link_path, &expected_link.managed_target_path);
            if check.status == crate::fs_links::SkillLinkStatus::Linked {
                reconciled_links += 1;
            }
        }
    }

    let mut first_delete_error: Option<String> = None;

    for target_dir in expected_by_target_dir.keys() {
        if let Err(error_message) = delete_stale_managed_links(
            &PathBuf::from(target_dir),
            expected_by_target_dir
                .get(target_dir)
                .expect("target dir entry should exist"),
            &managed_root,
        ) {
            if first_delete_error.is_none() {
                first_delete_error = Some(error_message);
            }
        }
    }

    if let Some(error_message) = first_delete_error {
        return Err(ReconcileError::SymlinkFailed { message: error_message });
    }

    delete_stale_links_for_removed_targets(
        connection,
        environment,
        &expected_by_target_dir,
        &managed_root,
    )?;

    Ok(ReconcileSummary { reconciled_links })
}

pub fn reconcile_project_groups_if_enabled(
    connection: &Connection,
    environment: &ReconcileEnvironment,
) -> Result<Option<ReconcileSummary>, ReconcileError> {
    if !auto_reconcile_enabled(connection)? {
        return Ok(None);
    }

    reconcile_project_groups(connection, environment).map(Some)
}

pub fn reconcile_project_record(
    connection: &Connection,
    environment: &ReconcileEnvironment,
    project_id: &str,
) -> Result<ReconcileSummary, ReconcileError> {
    let expected_links = expected_project_links_for_project(connection, environment, project_id)?;
    let configured_target_dirs =
        project_cli_target_directories_for_project(connection, project_id)?;

    reconcile_expected_links_for_target_dirs(
        &expected_links,
        &configured_target_dirs,
        &environment.managed_skills_root,
    )
}

pub fn reconcile_project_record_if_enabled(
    connection: &Connection,
    environment: &ReconcileEnvironment,
    project_id: &str,
) -> Result<Option<ReconcileSummary>, ReconcileError> {
    if !auto_reconcile_enabled(connection)? {
        return Ok(None);
    }

    reconcile_project_record(connection, environment, project_id).map(Some)
}

pub fn reconcile_global_and_custom(
    connection: &Connection,
    environment: &ReconcileEnvironment,
) -> Result<ReconcileSummary, ReconcileError> {
    Ok(
        reconcile_project_groups_if_enabled(connection, environment)?.unwrap_or(ReconcileSummary {
            reconciled_links: 0,
        }),
    )
}

#[derive(Debug, Clone)]
struct ExpectedProjectLink {
    target_dir: PathBuf,
    skill_name: String,
    managed_target_path: PathBuf,
}

#[derive(Debug, Clone)]
struct ProjectCliTargetDirectory {
    project_path: PathBuf,
    target_dir: PathBuf,
}

fn expected_project_links(
    connection: &Connection,
    environment: &ReconcileEnvironment,
) -> Result<Vec<ExpectedProjectLink>, ReconcileError> {
    let mut statement = connection.prepare(
        "SELECT
            projects.path,
            cli_targets.relative_path,
            skills.name,
            skills.managed_dir_name
        FROM project_skills
        INNER JOIN projects ON projects.id = project_skills.project_id
        INNER JOIN skills ON skills.id = project_skills.skill_id
        INNER JOIN project_cli_targets ON project_cli_targets.project_id = project_skills.project_id
        INNER JOIN cli_targets ON cli_targets.id = project_cli_targets.cli_target_id
        WHERE project_skills.enabled = 1
        ORDER BY projects.path ASC, cli_targets.relative_path ASC, skills.name ASC",
    )?;

    let rows = statement
        .query_map([], |row| {
            let project_path = PathBuf::from(row.get::<_, String>(0)?);
            let relative_path = row.get::<_, String>(1)?;
            let skill_name = row.get::<_, String>(2)?;
            let managed_dir_name = row.get::<_, String>(3)?;

            Ok(ExpectedProjectLink {
                target_dir: project_target_path(&project_path, &relative_path),
                skill_name,
                managed_target_path: environment.managed_skills_root.join(managed_dir_name),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}

fn expected_project_links_for_project(
    connection: &Connection,
    environment: &ReconcileEnvironment,
    project_id: &str,
) -> Result<Vec<ExpectedProjectLink>, ReconcileError> {
    let mut statement = connection.prepare(
        "SELECT
            projects.path,
            cli_targets.relative_path,
            skills.name,
            skills.managed_dir_name
        FROM project_skills
        INNER JOIN projects ON projects.id = project_skills.project_id
        INNER JOIN skills ON skills.id = project_skills.skill_id
        INNER JOIN project_cli_targets ON project_cli_targets.project_id = project_skills.project_id
        INNER JOIN cli_targets ON cli_targets.id = project_cli_targets.cli_target_id
        WHERE project_skills.project_id = ?1
          AND project_skills.enabled = 1
        ORDER BY cli_targets.relative_path ASC, skills.name ASC",
    )?;

    let rows = statement
        .query_map([project_id], |row| {
            let project_path = PathBuf::from(row.get::<_, String>(0)?);
            let relative_path = row.get::<_, String>(1)?;
            let skill_name = row.get::<_, String>(2)?;
            let managed_dir_name = row.get::<_, String>(3)?;

            Ok(ExpectedProjectLink {
                target_dir: project_target_path(&project_path, &relative_path),
                skill_name,
                managed_target_path: environment.managed_skills_root.join(managed_dir_name),
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}

fn project_cli_target_directories(
    connection: &Connection,
) -> Result<Vec<ProjectCliTargetDirectory>, ReconcileError> {
    let mut statement = connection.prepare(
        "SELECT
            projects.path,
            cli_targets.relative_path
        FROM project_cli_targets
        INNER JOIN projects ON projects.id = project_cli_targets.project_id
        INNER JOIN cli_targets ON cli_targets.id = project_cli_targets.cli_target_id
        ORDER BY projects.path ASC, cli_targets.relative_path ASC",
    )?;

    let rows = statement
        .query_map([], |row| {
            let project_path = PathBuf::from(row.get::<_, String>(0)?);
            let relative_path = row.get::<_, String>(1)?;
            Ok(ProjectCliTargetDirectory {
                target_dir: project_target_path(&project_path, &relative_path),
                project_path,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}

fn project_cli_target_directories_for_project(
    connection: &Connection,
    project_id: &str,
) -> Result<Vec<ProjectCliTargetDirectory>, ReconcileError> {
    let mut statement = connection.prepare(
        "SELECT
            projects.path,
            cli_targets.relative_path
        FROM project_cli_targets
        INNER JOIN projects ON projects.id = project_cli_targets.project_id
        INNER JOIN cli_targets ON cli_targets.id = project_cli_targets.cli_target_id
        WHERE project_cli_targets.project_id = ?1
        ORDER BY cli_targets.relative_path ASC",
    )?;

    let rows = statement
        .query_map([project_id], |row| {
            let project_path = PathBuf::from(row.get::<_, String>(0)?);
            let relative_path = row.get::<_, String>(1)?;
            Ok(ProjectCliTargetDirectory {
                target_dir: project_target_path(&project_path, &relative_path),
                project_path,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(rows)
}

fn auto_reconcile_enabled(connection: &Connection) -> Result<bool, ReconcileError> {
    let value = connection.query_row(
        "SELECT value FROM settings WHERE key = 'auto_reconcile'",
        [],
        |row| row.get::<_, String>(0),
    );

    match value {
        Ok(value) => Ok(value.trim().eq_ignore_ascii_case("true")),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(true),
        Err(error) => Err(ReconcileError::Sqlite(error)),
    }
}

fn ensure_target_directory(target_dir: &Path) -> Result<Option<PathBuf>, ReconcileError> {
    match crate::fs_links::ensure_project_target_directory(target_dir) {
        Ok(true) => Ok(Some(target_dir.to_path_buf())),
        Ok(false) if target_dir.exists() => Ok(Some(target_dir.to_path_buf())),
        Ok(false) => Ok(None),
        Err(source) => Err(ReconcileError::CreateTargetDirectory {
            path: target_dir.to_path_buf(),
            source,
        }),
    }
}

fn reconcile_expected_links_for_target_dirs(
    expected_links: &[ExpectedProjectLink],
    configured_target_dirs: &[ProjectCliTargetDirectory],
    managed_skills_root: &Path,
) -> Result<ReconcileSummary, ReconcileError> {
    let mut reconciled_links = 0usize;
    let managed_root = normalize_path(managed_skills_root);
    let mut expected_by_target_dir = HashMap::<String, HashSet<String>>::new();
    let mut first_link_error: Option<String> = None;

    for configured_target_dir in configured_target_dirs {
        expected_by_target_dir
            .entry(path_string(&configured_target_dir.target_dir))
            .or_default();
    }

    for expected_link in expected_links {
        if let Some(target_dir) = ensure_target_directory(&expected_link.target_dir)? {
            let link_path = target_dir.join(&expected_link.skill_name);
            let link_key = path_string(&link_path);
            expected_by_target_dir
                .entry(path_string(&target_dir))
                .or_default()
                .insert(link_key);

            let check =
                crate::fs_links::create_skill_link(&link_path, &expected_link.managed_target_path);
            if check.status == crate::fs_links::SkillLinkStatus::Linked {
                reconciled_links += 1;
            } else if check.status == crate::fs_links::SkillLinkStatus::Failed {
                if first_link_error.is_none() {
                    first_link_error = check.error_message;
                }
            }
        }
    }

    let mut first_delete_error: Option<String> = None;

    for configured_target_dir in configured_target_dirs {
        let target_dir = &configured_target_dir.target_dir;
        let expected_link_paths = expected_by_target_dir
            .get(&path_string(target_dir))
            .expect("configured target dir entry should exist");
        if let Err(error_message) = delete_stale_managed_links(target_dir, expected_link_paths, &managed_root) {
            if first_delete_error.is_none() {
                first_delete_error = Some(error_message);
            }
        }
    }

    if let Some(error_message) = first_link_error {
        return Err(ReconcileError::SymlinkFailed { message: error_message });
    }

    if let Some(error_message) = first_delete_error {
        return Err(ReconcileError::SymlinkFailed { message: error_message });
    }

    Ok(ReconcileSummary { reconciled_links })
}

fn delete_stale_links_for_removed_targets(
    connection: &Connection,
    environment: &ReconcileEnvironment,
    expected_by_target_dir: &HashMap<String, HashSet<String>>,
    managed_root: &Path,
) -> Result<(), ReconcileError> {
    let configured_target_dirs = project_cli_target_directories(connection)?;
    let configured_target_dir_set = configured_target_dirs
        .iter()
        .map(|entry| path_string(&entry.target_dir))
        .collect::<HashSet<_>>();

    let mut project_paths: Vec<PathBuf> = configured_target_dirs
        .iter()
        .map(|entry| normalize_path(&entry.project_path))
        .collect();
    project_paths.sort();
    project_paths.dedup();

    // When a project is deleted from the database, its cascade-deleted
    // project_cli_targets means the query above returns nothing for that
    // project.  Scan the home directory to find project paths that may still
    // contain stale managed links.
    let db_project_paths: HashSet<String> = project_paths
        .iter()
        .map(|p| path_string(p))
        .collect();
    let home_project_paths = scan_home_for_project_paths(&environment.home_dir, managed_root);
    for path in home_project_paths {
        if !db_project_paths.contains(&path_string(&path)) {
            project_paths.push(path);
        }
    }

    let mut first_delete_error: Option<String> = None;

    for project_path in &project_paths {
        let directories =
            list_managed_target_directories_under_project(project_path, managed_root);
        for target_dir in directories {
            let target_key = path_string(&target_dir);
            // Configured directories that have expected links are handled by the
            // main reconcile loop.  Configured directories with NO expected links
            // (all skills disabled/removed) still need stale-link cleanup.
            if configured_target_dir_set.contains(&target_key) {
                if let Some(expected) = expected_by_target_dir.get(&target_key) {
                    if !expected.is_empty() {
                        continue;
                    }
                }
            }

            if let Err(error_message) = delete_stale_managed_links(&target_dir, &HashSet::new(), managed_root) {
                if first_delete_error.is_none() {
                    first_delete_error = Some(error_message);
                }
            }
        }
    }

    if let Some(error_message) = first_delete_error {
        return Err(ReconcileError::SymlinkFailed { message: error_message });
    }

    let all_expected_links: HashSet<String> = expected_by_target_dir
        .values()
        .flat_map(|set| set.iter().cloned())
        .collect();
    crate::fs_links::delete_managed_skill_links_under_root(
        &environment.home_dir,
        managed_root,
        &all_expected_links,
    );

    for (target_dir, expected_links) in expected_by_target_dir {
        crate::fs_links::delete_managed_skill_links_under_root(
            &PathBuf::from(target_dir),
            managed_root,
            expected_links,
        );
    }
    Ok(())
}

fn scan_home_for_project_paths(home_dir: &Path, managed_root: &Path) -> Vec<PathBuf> {
    let mut project_paths = Vec::new();
    scan_home_recursive(home_dir, managed_root, 0, &mut project_paths);
    project_paths
}

fn scan_home_recursive(
    directory: &Path,
    managed_root: &Path,
    depth: usize,
    results: &mut Vec<PathBuf>,
) {
    // Limit search depth: project dirs are typically at most 2-3 levels deep
    // in the home directory (e.g. ~/projects/my-app, ~/code/my-app).
    const MAX_DEPTH: usize = 3;

    if depth > MAX_DEPTH {
        return;
    }

    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };

        // Skip symlinks/junctions — they are managed links, not project dirs
        if metadata.file_type().is_symlink() {
            continue;
        }

        if !metadata.is_dir() {
            continue;
        }

        if directory_contains_managed_link(&path, managed_root) {
            results.push(normalize_path(&path));
        }

        scan_home_recursive(&path, managed_root, depth + 1, results);
    }
}

fn list_managed_target_directories_under_project(
    project_path: &Path,
    managed_root: &Path,
) -> Vec<PathBuf> {
    let mut directories = Vec::new();
    visit_directories(project_path, &mut |directory| {
        if directory == project_path {
            return;
        }

        if directory_contains_managed_link(directory, managed_root) {
            directories.push(directory.to_path_buf());
        }
    });
    directories
}

fn visit_directories(root: &Path, visitor: &mut impl FnMut(&Path)) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    visitor(root);

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };

        if metadata.file_type().is_dir() {
            visit_directories(&path, visitor);
        }
    }
}

fn directory_contains_managed_link(directory: &Path, managed_root: &Path) -> bool {
    let Ok(entries) = fs::read_dir(directory) else {
        return false;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };

        if !metadata.file_type().is_symlink() {
            continue;
        }

        let Ok(target) = fs::read_link(&path) else {
            continue;
        };

        let resolved_target = if target.is_absolute() {
            normalize_path(&target)
        } else {
            normalize_path(&directory.join(target))
        };

        if resolved_target.starts_with(managed_root) {
            return true;
        }
    }

    false
}

fn delete_stale_managed_links(
    target_dir: &Path,
    expected_link_paths: &HashSet<String>,
    managed_root: &Path,
) -> Result<(), String> {
    let Ok(entries) = fs::read_dir(target_dir) else {
        return Ok(());
    };

    for entry in entries.flatten() {
        let link_path = entry.path();
        let link_key = path_string(&link_path);
        if expected_link_paths.contains(&link_key) {
            continue;
        }

        let result = crate::fs_links::delete_managed_skill_link(&link_path, managed_root);
        if result.status == crate::fs_links::SkillLinkStatus::Failed {
            if let Some(error_message) = result.error_message {
                return Err(error_message);
            }
        }
    }

    Ok(())
}

fn project_target_path(project_root: &Path, relative_path: &str) -> PathBuf {
    relative_path
        .split(['/', '\\'])
        .filter(|part| !part.is_empty())
        .fold(project_root.to_path_buf(), |path, part| path.join(part))
}

fn path_string(path: &Path) -> String {
    strip_verbatim_prefix(path).to_string_lossy().into_owned()
}

/// Strip the `\\?\` Win32 verbatim prefix that `fs::canonicalize` and
/// `fs::read_dir` may add on Windows.  Without this, the same physical path
/// appears as two different strings and comparison breaks.
fn strip_verbatim_prefix(path: &Path) -> PathBuf {
    let s = path.to_string_lossy();
    if let Some(rest) = s.strip_prefix("\\\\?\\") {
        PathBuf::from(rest)
    } else {
        path.to_path_buf()
    }
}

fn normalize_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use super::ReconcileEnvironment;
    use crate::db::INITIAL_SCHEMA;
    use crate::fs_links::{check_skill_link, create_skill_link, SkillLinkStatus};
    use crate::projects::{create_project, ProjectInput};
    use rusqlite::Connection;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    const PROJECT_ONLY_REFACTOR_SCHEMA: &str =
        include_str!("../migrations/0002_project_only_refactor.sql");

    #[test]
    fn project_reconcile_links_enabled_project_skills_into_selected_cli_targets() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-links");
        let project_root = workspace.root.join("workspace");
        let managed_target = workspace.create_managed_skill("grill-with-docs-11111111");
        if !workspace.assert_symlink_capable(&managed_target) {
            return;
        }

        fs::create_dir_all(project_root.join(".agents")).expect("cli target parent should exist");

        let project = seed_project(&connection, &project_root);
        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-11111111",
        );
        seed_project_skill(&connection, &project.id, "skill-one", true);
        seed_project_cli_target(&connection, &project.id, "agents-skills");

        let summary = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("reconcile should complete");

        assert_eq!(summary.reconciled_links, 1);

        let target_dir = project_root.join(".agents").join("skills");
        let link_path = target_dir.join("grill-with-docs");

        assert!(target_dir.is_dir());

        assert_eq!(
            check_skill_link(&link_path, &managed_target).status,
            SkillLinkStatus::Linked
        );
    }

    #[test]
    fn project_reconcile_skips_cli_target_when_parent_directory_is_missing() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-missing-parent");
        let project_root = workspace.root.join("workspace");
        let project = seed_project(&connection, &project_root);
        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-11111111",
        );
        workspace.create_managed_skill("grill-with-docs-11111111");
        seed_project_skill(&connection, &project.id, "skill-one", true);
        seed_project_cli_target(&connection, &project.id, "agents-skills");

        let summary = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("reconcile should complete");

        assert_eq!(summary.reconciled_links, 0);
        assert!(!project_root.join(".agents").join("skills").exists());
    }

    #[test]
    fn project_reconcile_deletes_stale_managed_links_for_disabled_skills() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-disabled-skill");
        let project_root = workspace.root.join("workspace");
        let managed_target = workspace.create_managed_skill("grill-with-docs-11111111");
        if !workspace.assert_symlink_capable(&managed_target) {
            return;
        }

        fs::create_dir_all(project_root.join(".agents")).expect("cli target parent should exist");

        let project = seed_project(&connection, &project_root);
        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-11111111",
        );
        seed_project_skill(&connection, &project.id, "skill-one", true);
        seed_project_cli_target(&connection, &project.id, "agents-skills");

        super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("initial reconcile should complete");

        connection
            .execute(
                "UPDATE project_skills
                SET enabled = 0, updated_at = CURRENT_TIMESTAMP
                WHERE project_id = ?1 AND skill_id = ?2",
                (&project.id, "skill-one"),
            )
            .expect("project skill should disable");

        let summary = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("reconcile should complete");

        let link_path = project_root
            .join(".agents")
            .join("skills")
            .join("grill-with-docs");

        assert_eq!(summary.reconciled_links, 0);
        assert_eq!(
            check_skill_link(&link_path, &managed_target).status,
            SkillLinkStatus::Missing
        );
    }

    #[test]
    fn project_reconcile_deletes_stale_managed_links_for_deselected_cli_targets() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-deselected-target");
        let project_root = workspace.root.join("workspace");
        let managed_target = workspace.create_managed_skill("grill-with-docs-11111111");
        if !workspace.assert_symlink_capable(&managed_target) {
            return;
        }
        let agents_parent = project_root.join(".agents");
        let codex_target_dir = project_root.join(".codex").join("skills");
        let stale_link_path = codex_target_dir.join("grill-with-docs");

        fs::create_dir_all(&agents_parent).expect("agents parent should exist");
        fs::create_dir_all(&codex_target_dir).expect("stale target directory should exist");
        let stale_check = create_skill_link(&stale_link_path, &managed_target);
        assert_eq!(stale_check.status, SkillLinkStatus::Linked);

        let project = seed_project(&connection, &project_root);
        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-11111111",
        );
        seed_project_skill(&connection, &project.id, "skill-one", true);
        seed_project_cli_target(&connection, &project.id, "agents-skills");

        let summary = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("reconcile should complete");

        let expected_link_path = project_root
            .join(".agents")
            .join("skills")
            .join("grill-with-docs");

        assert_eq!(summary.reconciled_links, 1);
        assert_eq!(
            check_skill_link(&expected_link_path, &managed_target).status,
            SkillLinkStatus::Linked
        );
        assert_eq!(
            check_skill_link(&stale_link_path, &managed_target).status,
            SkillLinkStatus::Missing
        );
    }

    #[test]
    fn project_reconcile_deletes_legacy_managed_home_links() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("legacy-home-cleanup");
        let managed_target = workspace.create_managed_skill("legacy-skill-11111111");
        if !workspace.assert_symlink_capable(&managed_target) {
            return;
        }

        let legacy_link = workspace
            .home
            .join(".agents")
            .join("skills")
            .join("legacy-skill");
        fs::create_dir_all(
            legacy_link
                .parent()
                .expect("legacy link should have a parent directory"),
        )
        .expect("legacy home target should exist");
        let created = create_skill_link(&legacy_link, &managed_target);
        assert_eq!(created.status, SkillLinkStatus::Linked);

        let summary = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("reconcile should complete");

        assert_eq!(summary.reconciled_links, 0);
        assert_eq!(
            check_skill_link(&legacy_link, &managed_target).status,
            SkillLinkStatus::Missing
        );
    }

    #[test]
    fn project_reconcile_if_enabled_respects_auto_reconcile_setting() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-auto-reconcile");
        let project_root = workspace.root.join("workspace");

        fs::create_dir_all(project_root.join(".agents")).expect("cli target parent should exist");

        let project = seed_project(&connection, &project_root);
        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-11111111",
        );
        workspace.create_managed_skill("grill-with-docs-11111111");
        seed_project_skill(&connection, &project.id, "skill-one", true);
        seed_project_cli_target(&connection, &project.id, "agents-skills");
        connection
            .execute(
                "UPDATE settings
                SET value = 'false', updated_at = CURRENT_TIMESTAMP
                WHERE key = 'auto_reconcile'",
                [],
            )
            .expect("auto_reconcile should update");

        let summary =
            super::reconcile_project_groups_if_enabled(&connection, &workspace.environment())
                .expect("conditional reconcile should complete");

        assert!(summary.is_none());
        assert!(!project_root
            .join(".agents")
            .join("skills")
            .join("grill-with-docs")
            .exists());
    }

    #[test]
    fn project_reconcile_deletes_stale_managed_links_after_project_delete() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-delete-cleanup");
        // Place project inside home so the home directory scan can find it
        // after the project is deleted from the database.
        let project_root = workspace.home.join("workspace");
        let managed_target = workspace.create_managed_skill("grill-with-docs-11111111");
        if !workspace.assert_symlink_capable(&managed_target) {
            return;
        }

        fs::create_dir_all(project_root.join(".agents")).expect("cli target parent should exist");

        let project = seed_project(&connection, &project_root);
        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-11111111",
        );
        seed_project_skill(&connection, &project.id, "skill-one", true);
        seed_project_cli_target(&connection, &project.id, "agents-skills");

        super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("initial reconcile should complete");

        let link_path = project_root
            .join(".agents")
            .join("skills")
            .join("grill-with-docs");
        assert_eq!(
            check_skill_link(&link_path, &managed_target).status,
            SkillLinkStatus::Linked
        );

        connection
            .execute("DELETE FROM projects WHERE id = ?1", [&project.id])
            .expect("project should delete");

        let summary = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("reconcile should complete");

        assert_eq!(summary.reconciled_links, 0);
        assert_eq!(
            check_skill_link(&link_path, &managed_target).status,
            SkillLinkStatus::Missing
        );
    }

    #[test]
    fn project_reconcile_removes_only_deleted_skill_links_across_multiple_targets() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-multi-skill-target-cleanup");
        let project_root = workspace.root.join("workspace");
        let skill_one_target = workspace.create_managed_skill("grill-with-docs-11111111");
        let skill_two_target = workspace.create_managed_skill("systematic-debugging-22222222");
        if !workspace.assert_symlink_capable(&skill_one_target)
            || !workspace.assert_symlink_capable(&skill_two_target)
        {
            return;
        }

        fs::create_dir_all(project_root.join(".agents")).expect("agents parent should exist");
        fs::create_dir_all(project_root.join(".codex")).expect("codex parent should exist");

        let project = seed_project(&connection, &project_root);
        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-11111111",
        );
        seed_skill(
            &connection,
            "skill-two",
            "systematic-debugging",
            "systematic-debugging-22222222",
        );
        seed_project_skill(&connection, &project.id, "skill-one", true);
        seed_project_skill(&connection, &project.id, "skill-two", true);
        seed_project_cli_target(&connection, &project.id, "agents-skills");
        seed_project_cli_target(&connection, &project.id, "codex-skills");

        let initial = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("initial reconcile should complete");
        assert_eq!(initial.reconciled_links, 4);

        let agents_skill_one = project_root
            .join(".agents")
            .join("skills")
            .join("grill-with-docs");
        let agents_skill_two = project_root
            .join(".agents")
            .join("skills")
            .join("systematic-debugging");
        let codex_skill_one = project_root
            .join(".codex")
            .join("skills")
            .join("grill-with-docs");
        let codex_skill_two = project_root
            .join(".codex")
            .join("skills")
            .join("systematic-debugging");

        assert_eq!(
            check_skill_link(&agents_skill_one, &skill_one_target).status,
            SkillLinkStatus::Linked
        );
        assert_eq!(
            check_skill_link(&agents_skill_two, &skill_two_target).status,
            SkillLinkStatus::Linked
        );
        assert_eq!(
            check_skill_link(&codex_skill_one, &skill_one_target).status,
            SkillLinkStatus::Linked
        );
        assert_eq!(
            check_skill_link(&codex_skill_two, &skill_two_target).status,
            SkillLinkStatus::Linked
        );

        connection
            .execute(
                "DELETE FROM project_skills
                WHERE project_id = ?1 AND skill_id = ?2",
                (&project.id, "skill-one"),
            )
            .expect("project skill should delete");

        let summary = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("reconcile should complete");

        assert_eq!(summary.reconciled_links, 2);
        assert_eq!(
            check_skill_link(&agents_skill_one, &skill_one_target).status,
            SkillLinkStatus::Missing
        );
        assert_eq!(
            check_skill_link(&codex_skill_one, &skill_one_target).status,
            SkillLinkStatus::Missing
        );
        assert_eq!(
            check_skill_link(&agents_skill_two, &skill_two_target).status,
            SkillLinkStatus::Linked
        );
        assert_eq!(
            check_skill_link(&codex_skill_two, &skill_two_target).status,
            SkillLinkStatus::Linked
        );
    }

    #[test]
    fn project_reconcile_keeps_other_projects_links_when_one_project_skill_is_removed() {
        let connection = open_project_only_in_memory_database();
        let workspace = TestWorkspace::new("project-isolation-shared-skill");
        let project_one_root = workspace.root.join("workspace-one");
        let project_two_root = workspace.root.join("workspace-two");
        let managed_target = workspace.create_managed_skill("grill-with-docs-11111111");
        if !workspace.assert_symlink_capable(&managed_target) {
            return;
        }

        fs::create_dir_all(project_one_root.join(".agents"))
            .expect("project one parent should exist");
        fs::create_dir_all(project_two_root.join(".agents"))
            .expect("project two parent should exist");

        let project_one = seed_project(&connection, &project_one_root);
        let project_two = create_project(
            &connection,
            ProjectInput {
                name: "Workspace Two".to_string(),
                path: path_string(&project_two_root),
            },
        )
        .expect("second project should create");

        seed_skill(
            &connection,
            "skill-one",
            "grill-with-docs",
            "grill-with-docs-11111111",
        );
        seed_project_skill(&connection, &project_one.id, "skill-one", true);
        seed_project_skill(&connection, &project_two.id, "skill-one", true);
        seed_project_cli_target(&connection, &project_one.id, "agents-skills");
        seed_project_cli_target(&connection, &project_two.id, "agents-skills");

        let initial = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("initial reconcile should complete");
        assert_eq!(initial.reconciled_links, 2);

        let project_one_link = project_one_root
            .join(".agents")
            .join("skills")
            .join("grill-with-docs");
        let project_two_link = project_two_root
            .join(".agents")
            .join("skills")
            .join("grill-with-docs");

        assert_eq!(
            check_skill_link(&project_one_link, &managed_target).status,
            SkillLinkStatus::Linked
        );
        assert_eq!(
            check_skill_link(&project_two_link, &managed_target).status,
            SkillLinkStatus::Linked
        );

        connection
            .execute(
                "DELETE FROM project_skills
                WHERE project_id = ?1 AND skill_id = ?2",
                (&project_one.id, "skill-one"),
            )
            .expect("project one skill should delete");

        let summary = super::reconcile_project_groups(&connection, &workspace.environment())
            .expect("reconcile should complete");

        assert_eq!(summary.reconciled_links, 1);
        assert_eq!(
            check_skill_link(&project_one_link, &managed_target).status,
            SkillLinkStatus::Missing
        );
        assert_eq!(
            check_skill_link(&project_two_link, &managed_target).status,
            SkillLinkStatus::Linked
        );
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
                std::env::temp_dir().join(format!("skills-manager-reconcile-{name}-{unique}"));
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
            let probe_link = self.root.join("symlink-probe").join("probe-skill");
            let check = create_skill_link(&probe_link, managed_target);
            if check.status == SkillLinkStatus::Linked {
                let _ = crate::fs_links::delete_managed_skill_link(
                    &probe_link,
                    &self.root.join("managed-skills"),
                );
                return true;
            }

            assert_eq!(check.status, SkillLinkStatus::Failed);
            false
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            remove_dir_all_if_exists(&self.root);
        }
    }

    fn seed_project(
        connection: &Connection,
        project_path: &Path,
    ) -> crate::projects::ProjectRecord {
        create_project(
            connection,
            ProjectInput {
                name: "Workspace".to_string(),
                path: path_string(project_path),
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
                ) VALUES (?1, ?2, 'fixture', 'fixtures/skills', ?3, ?4)",
                (id, name, name, managed_dir_name),
            )
            .expect("skill should insert");
    }

    fn seed_project_skill(
        connection: &Connection,
        project_id: &str,
        skill_id: &str,
        enabled: bool,
    ) {
        connection
            .execute(
                "INSERT INTO project_skills (id, project_id, skill_id, enabled)
                VALUES (?1, ?2, ?3, ?4)",
                (
                    format!("project-skill-{project_id}-{skill_id}"),
                    project_id,
                    skill_id,
                    if enabled { 1 } else { 0 },
                ),
            )
            .expect("project skill should insert");
    }

    fn seed_project_cli_target(connection: &Connection, project_id: &str, cli_target_id: &str) {
        connection
            .execute(
                "INSERT INTO project_cli_targets (id, project_id, cli_target_id)
                VALUES (?1, ?2, ?3)",
                (
                    format!("project-cli-target-{project_id}-{cli_target_id}"),
                    project_id,
                    cli_target_id,
                ),
            )
            .expect("project cli target should insert");
    }

    fn path_string(path: &Path) -> String {
        path.to_string_lossy().into_owned()
    }

    fn remove_dir_all_if_exists(path: &Path) {
        if path.exists() {
            fs::remove_dir_all(path).expect("workspace should be removed");
        }
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

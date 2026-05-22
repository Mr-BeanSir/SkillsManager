use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

use rusqlite::Connection;
use serde::Serialize;
use thiserror::Error;

use crate::install::{
    install_local_skill_snapshot, read_skill_snapshot_metadata, LocalSkillInstallRequest,
};
use crate::repository_sources::{
    discover_repository_skills, parse_repository_source, select_repository_skill,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateStatusRecord {
    pub id: String,
    pub update_available: bool,
    pub installed_version: Option<String>,
    pub latest_version: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateRepositoryErrorRecord {
    pub source_ref: String,
    pub skill_count: usize,
    pub message: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillUpdateBatchResult {
    pub statuses: Vec<SkillUpdateStatusRecord>,
    pub repository_errors: Vec<SkillUpdateRepositoryErrorRecord>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SkillSnapshotIdentity {
    id: String,
    name: String,
    source_type: String,
    source_ref: String,
    skill_path: String,
    installed_version: Option<String>,
    installed_hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SkillUpdateCheck {
    latest_version: Option<String>,
    latest_hash: String,
    update_available: bool,
}

#[derive(Debug, Error)]
pub enum SkillUpdateError {
    #[error("skill {0} was not found")]
    SkillNotFound(String),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("app path error: {0}")]
    AppPath(String),
    #[error("unsupported source type for updates: {0}")]
    UnsupportedSourceType(String),
    #[error("failed to inspect skill source: {0}")]
    SourceInspection(String),
    #[error("git clone failed: {0}")]
    GitCloneFailed(String),
    #[error("failed to update managed snapshot: {0}")]
    Install(String),
}

#[tauri::command]
pub async fn check_installed_skill_updates_record() -> Result<Vec<SkillUpdateStatusRecord>, String>
{
    tauri::async_runtime::spawn_blocking(|| {
        with_database(|connection| check_installed_skill_updates(connection))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn update_installed_skill_record(
    skill_id: String,
) -> Result<SkillUpdateStatusRecord, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_database(|connection| update_installed_skill(connection, &skill_id))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn update_installed_skills_record(
    skill_ids: Vec<String>,
) -> Result<SkillUpdateBatchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_database(|connection| update_installed_skills(connection, &skill_ids))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn check_installed_skill_updates_batch_record() -> Result<SkillUpdateBatchResult, String>
{
    tauri::async_runtime::spawn_blocking(|| {
        with_database(|connection| check_installed_skill_updates_batch(connection))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub async fn update_installed_skills_batch_record(
    skill_ids: Vec<String>,
) -> Result<SkillUpdateBatchResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        with_database(|connection| update_installed_skills(connection, &skill_ids))
            .map_err(|error| error.to_string())
    })
    .await
    .map_err(|error| error.to_string())?
}

fn with_database<T>(
    action: impl FnOnce(&Connection) -> Result<T, SkillUpdateError>,
) -> Result<T, SkillUpdateError> {
    let database_path = crate::app_paths::database_path()
        .map_err(|error| SkillUpdateError::AppPath(error.to_string()))?;
    let connection = crate::db::open_database(database_path)
        .map_err(|error| SkillUpdateError::AppPath(error.to_string()))?;

    action(&connection)
}

fn check_installed_skill_updates(
    connection: &Connection,
) -> Result<Vec<SkillUpdateStatusRecord>, SkillUpdateError> {
    Ok(check_installed_skill_updates_batch(connection)?.statuses)
}

fn check_installed_skill_updates_batch(
    connection: &Connection,
) -> Result<SkillUpdateBatchResult, SkillUpdateError> {
    let skills = list_updatable_skills(connection)?;
    let mut statuses = Vec::with_capacity(skills.len());
    let mut repository_cache = HashMap::new();
    let mut repository_errors = Vec::new();
    let grouped_skills = group_skills_by_repository(skills)?;

    for (cache_key, repository_group) in grouped_skills {
        match ensure_repository_cached(&repository_group.parsed, &mut repository_cache) {
            Ok(()) => {
                for skill in repository_group.skills {
                    let check = inspect_remote_skill_update(
                        &skill,
                        &repository_group.parsed,
                        &mut repository_cache,
                    )?;
                    statuses.push(apply_skill_update_check(connection, &skill.id, &check)?);
                }
            }
            Err(error) => {
                repository_errors.push(SkillUpdateRepositoryErrorRecord {
                    source_ref: repository_group.source_ref,
                    skill_count: repository_group.skills.len(),
                    message: error.to_string(),
                });
                repository_cache.remove(&cache_key);
            }
        }
    }

    Ok(SkillUpdateBatchResult {
        statuses,
        repository_errors,
    })
}

fn update_installed_skill(
    connection: &Connection,
    skill_id: &str,
) -> Result<SkillUpdateStatusRecord, SkillUpdateError> {
    let skill = load_skill_snapshot_identity(connection, skill_id)?;
    let parsed = parse_repository_source(&skill.source_ref)
        .map_err(|error| SkillUpdateError::SourceInspection(error.to_string()))?;
    ensure_source_type_supports_updates(&parsed.source_type)?;

    let mut results = update_installed_skills(connection, &[skill_id.to_string()])?.statuses;
    results
        .pop()
        .ok_or_else(|| SkillUpdateError::SkillNotFound(skill_id.to_string()))
}

fn update_installed_skills(
    connection: &Connection,
    skill_ids: &[String],
) -> Result<SkillUpdateBatchResult, SkillUpdateError> {
    let managed_skills_root = crate::app_paths::managed_skills_dir()
        .map_err(|error| SkillUpdateError::AppPath(error.to_string()))?;
    let skills = skill_ids
        .iter()
        .map(|skill_id| load_skill_snapshot_identity(connection, skill_id))
        .collect::<Result<Vec<_>, _>>()?;
    let mut repository_cache = HashMap::new();
    let mut results = Vec::with_capacity(skills.len());
    let mut repository_errors = Vec::new();
    let grouped_skills = group_skills_by_repository(skills)?;

    for (cache_key, repository_group) in grouped_skills {
        match ensure_repository_cached(&repository_group.parsed, &mut repository_cache) {
            Ok(()) => {
                for skill in repository_group.skills {
                    results.push(update_installed_skill_with_cache(
                        connection,
                        &managed_skills_root,
                        &skill,
                        &repository_group.parsed,
                        &mut repository_cache,
                    )?);
                }
            }
            Err(error) => {
                repository_errors.push(SkillUpdateRepositoryErrorRecord {
                    source_ref: repository_group.source_ref,
                    skill_count: repository_group.skills.len(),
                    message: error.to_string(),
                });
                repository_cache.remove(&cache_key);
            }
        }
    }

    Ok(SkillUpdateBatchResult {
        statuses: results,
        repository_errors,
    })
}

fn update_installed_skill_with_cache(
    connection: &Connection,
    managed_skills_root: &Path,
    skill: &SkillSnapshotIdentity,
    parsed: &crate::repository_sources::RepositorySource,
    repository_cache: &mut HashMap<String, CachedRepositoryInspection>,
) -> Result<SkillUpdateStatusRecord, SkillUpdateError> {
    ensure_source_type_supports_updates(&parsed.source_type)?;

    let cached = repository_cache
        .get(&repository_cache_key(parsed))
        .expect("repository cache entry should exist after insertion");
    let selected = select_repository_skill(&cached.discovered, &skill.name)
        .map_err(|error| SkillUpdateError::SourceInspection(error.to_string()))?;
    let snapshot_metadata = read_skill_snapshot_metadata(&selected.directory_path)
        .map_err(|error| SkillUpdateError::Install(error.to_string()))?;

    install_local_skill_snapshot(
        connection,
        managed_skills_root.to_path_buf(),
        LocalSkillInstallRequest {
            name: selected.name,
            description: selected.description,
            source_type: skill.source_type.clone(),
            source_ref: skill.source_ref.clone(),
            skill_path: skill.skill_path.clone(),
            fixture_path: selected.directory_path,
        },
    )
    .map_err(|error| SkillUpdateError::Install(error.to_string()))?;

    connection.execute(
        "UPDATE skills
         SET installed_version = ?2,
             installed_hash = ?3,
             latest_version = ?2,
             latest_hash = ?3,
             update_available = 0,
             last_update_check_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        (
            skill.id.as_str(),
            snapshot_metadata.version.as_deref(),
            snapshot_metadata.hash.as_str(),
        ),
    )?;

    load_skill_update_status(connection, &skill.id)
}

fn inspect_remote_skill_update(
    skill: &SkillSnapshotIdentity,
    parsed: &crate::repository_sources::RepositorySource,
    repository_cache: &mut HashMap<String, CachedRepositoryInspection>,
) -> Result<SkillUpdateCheck, SkillUpdateError> {
    ensure_source_type_supports_updates(&parsed.source_type)?;
    let cached = repository_cache
        .get(&repository_cache_key(parsed))
        .expect("repository cache entry should exist after insertion");
    let selected = select_repository_skill(&cached.discovered, &skill.name)
        .map_err(|error| SkillUpdateError::SourceInspection(error.to_string()))?;
    let metadata = read_skill_snapshot_metadata(&selected.directory_path)
        .map_err(|error| SkillUpdateError::SourceInspection(error.to_string()))?;
    let update_available = skill
        .installed_hash
        .as_deref()
        .map(|installed_hash| installed_hash != metadata.hash)
        .unwrap_or(true);

    Ok(SkillUpdateCheck {
        latest_version: metadata.version,
        latest_hash: metadata.hash,
        update_available,
    })
}

fn ensure_repository_cached(
    parsed: &crate::repository_sources::RepositorySource,
    repository_cache: &mut HashMap<String, CachedRepositoryInspection>,
) -> Result<(), SkillUpdateError> {
    ensure_source_type_supports_updates(&parsed.source_type)?;

    let cache_key = repository_cache_key(parsed);
    if repository_cache.contains_key(&cache_key) {
        return Ok(());
    }

    let checkout = TemporaryCheckout::new()
        .map_err(|error| SkillUpdateError::SourceInspection(error.to_string()))?;
    clone_repository(
        &parsed.clone_url,
        parsed.ref_name.as_deref(),
        checkout.path(),
    )?;
    let discovered = discover_repository_skills(checkout.path(), parsed.subpath.as_deref())
        .map_err(|error| SkillUpdateError::SourceInspection(error.to_string()))?;
    if discovered.is_empty() {
        return Err(SkillUpdateError::SourceInspection(
            "repository has no valid SKILL.md files".to_string(),
        ));
    }

    repository_cache.insert(
        cache_key,
        CachedRepositoryInspection {
            _checkout: checkout,
            discovered,
        },
    );

    Ok(())
}

fn apply_skill_update_check(
    connection: &Connection,
    skill_id: &str,
    check: &SkillUpdateCheck,
) -> Result<SkillUpdateStatusRecord, SkillUpdateError> {
    connection.execute(
        "UPDATE skills
         SET latest_version = ?2,
             latest_hash = ?3,
             update_available = ?4,
             last_update_check_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?1",
        (
            skill_id,
            check.latest_version.as_deref(),
            check.latest_hash.as_str(),
            i64::from(check.update_available),
        ),
    )?;

    load_skill_update_status(connection, skill_id)
}

fn list_updatable_skills(
    connection: &Connection,
) -> Result<Vec<SkillSnapshotIdentity>, SkillUpdateError> {
    let mut statement = connection.prepare(
        "SELECT
            id,
            name,
            description,
            source_type,
            source_ref,
            skill_path,
            installed_version,
            installed_hash
         FROM skills
         ORDER BY name ASC, source_ref ASC, skill_path ASC",
    )?;

    let skills = statement
        .query_map([], |row| {
            Ok(SkillSnapshotIdentity {
                id: row.get(0)?,
                name: row.get(1)?,
                source_type: row.get(3)?,
                source_ref: row.get(4)?,
                skill_path: row.get(5)?,
                installed_version: row.get(6)?,
                installed_hash: row.get(7)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;

    Ok(skills)
}

fn load_skill_snapshot_identity(
    connection: &Connection,
    skill_id: &str,
) -> Result<SkillSnapshotIdentity, SkillUpdateError> {
    connection
        .query_row(
            "SELECT
                id,
                name,
                description,
                source_type,
                source_ref,
                skill_path,
                installed_version,
                installed_hash
             FROM skills
             WHERE id = ?1",
            [skill_id],
            |row| {
                Ok(SkillSnapshotIdentity {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    source_type: row.get(3)?,
                    source_ref: row.get(4)?,
                    skill_path: row.get(5)?,
                    installed_version: row.get(6)?,
                    installed_hash: row.get(7)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                SkillUpdateError::SkillNotFound(skill_id.to_string())
            }
            other => SkillUpdateError::Sqlite(other),
        })
}

fn load_skill_update_status(
    connection: &Connection,
    skill_id: &str,
) -> Result<SkillUpdateStatusRecord, SkillUpdateError> {
    connection
        .query_row(
            "SELECT id, update_available, installed_version, latest_version
             FROM skills
             WHERE id = ?1",
            [skill_id],
            |row| {
                Ok(SkillUpdateStatusRecord {
                    id: row.get(0)?,
                    update_available: row.get::<_, i64>(1)? == 1,
                    installed_version: row.get(2)?,
                    latest_version: row.get(3)?,
                })
            },
        )
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => {
                SkillUpdateError::SkillNotFound(skill_id.to_string())
            }
            other => SkillUpdateError::Sqlite(other),
        })
}

fn clone_repository(
    clone_url: &str,
    ref_name: Option<&str>,
    checkout_path: &Path,
) -> Result<(), SkillUpdateError> {
    let first_attempt = run_git_clone(clone_url, ref_name, checkout_path, false)?;

    if first_attempt.status.success() {
        return Ok(());
    }

    let first_error = stderr_text(&first_attempt);
    if !should_retry_with_http1(&first_error) {
        return Err(SkillUpdateError::GitCloneFailed(first_error));
    }

    std::fs::remove_dir_all(checkout_path).ok();
    std::fs::create_dir_all(checkout_path).ok();

    let fallback_attempt = run_git_clone(clone_url, ref_name, checkout_path, true)?;
    if fallback_attempt.status.success() {
        return Ok(());
    }

    Err(SkillUpdateError::GitCloneFailed(stderr_text(
        &fallback_attempt,
    )))
}

fn run_git_clone(
    clone_url: &str,
    ref_name: Option<&str>,
    checkout_path: &Path,
    force_http1: bool,
) -> Result<std::process::Output, SkillUpdateError> {
    let mut command = Command::new("git");

    if force_http1 {
        command.args(["-c", "http.version=HTTP/1.1"]);
    }

    command.args(["clone", "--depth", "1"]);

    if let Some(value) = ref_name {
        command.args(["--branch", value]);
    }

    command
        .arg(clone_url)
        .arg(checkout_path)
        .output()
        .map_err(|error| SkillUpdateError::GitCloneFailed(error.to_string()))
}

fn stderr_text(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stderr).trim().to_string()
}

fn should_retry_with_http1(error_text: &str) -> bool {
    let normalized = error_text.to_lowercase();

    normalized.contains("http/2")
        || normalized.contains("connection was reset")
        || normalized.contains("recv failure")
        || normalized.contains("gnutls recv error")
        || normalized.contains("curl 56")
}

fn ensure_source_type_supports_updates(source_type: &str) -> Result<(), SkillUpdateError> {
    if source_type == "raw_url" || source_type == "well_known" {
        return Err(SkillUpdateError::UnsupportedSourceType(
            source_type.to_string(),
        ));
    }

    Ok(())
}

fn repository_cache_key(parsed_source: &crate::repository_sources::RepositorySource) -> String {
    format!(
        "{}|{}|{}",
        parsed_source.clone_url,
        parsed_source.ref_name.as_deref().unwrap_or(""),
        parsed_source.subpath.as_deref().unwrap_or("")
    )
}

struct RepositorySkillGroup {
    parsed: crate::repository_sources::RepositorySource,
    source_ref: String,
    skills: Vec<SkillSnapshotIdentity>,
}

fn group_skills_by_repository(
    skills: Vec<SkillSnapshotIdentity>,
) -> Result<Vec<(String, RepositorySkillGroup)>, SkillUpdateError> {
    let mut groups = HashMap::<String, RepositorySkillGroup>::new();

    for skill in skills {
        let parsed = parse_repository_source(&skill.source_ref)
            .map_err(|error| SkillUpdateError::SourceInspection(error.to_string()))?;
        let cache_key = repository_cache_key(&parsed);

        groups
            .entry(cache_key.clone())
            .and_modify(|group| group.skills.push(skill.clone()))
            .or_insert_with(|| RepositorySkillGroup {
                parsed: parsed.clone(),
                source_ref: skill.source_ref.clone(),
                skills: vec![skill],
            });
    }

    Ok(groups.into_iter().collect())
}

#[cfg(test)]
mod async_command_tests {
    #[test]
    fn async_update_commands_compile_as_background_work() {
        let _check = super::check_installed_skill_updates_record;
        let _update = super::update_installed_skill_record;
    }
}

struct TemporaryCheckout {
    path: PathBuf,
}

struct CachedRepositoryInspection {
    _checkout: TemporaryCheckout,
    discovered: Vec<crate::repository_sources::RepositorySkill>,
}

impl TemporaryCheckout {
    fn new() -> Result<Self, std::io::Error> {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("skills-manager-update-{unique}"));
        std::fs::create_dir_all(&path)?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TemporaryCheckout {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = std::fs::remove_dir_all(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        apply_skill_update_check, group_skills_by_repository, load_skill_snapshot_identity,
        update_installed_skill, SkillSnapshotIdentity, SkillUpdateCheck,
    };
    use crate::db::CURRENT_SCHEMA;
    use rusqlite::Connection;

    #[test]
    fn records_update_check_results_on_existing_skills() {
        let connection = open_current_database();
        insert_skill(
            &connection,
            "skill-review",
            "code-review",
            Some("1.0.0"),
            Some("aaa11111"),
        );

        let status = apply_skill_update_check(
            &connection,
            "skill-review",
            &SkillUpdateCheck {
                latest_version: Some("1.2.0".to_string()),
                latest_hash: "bbb22222".to_string(),
                update_available: true,
            },
        )
        .expect("update check should persist");

        assert!(status.update_available);
        assert_eq!(status.installed_version.as_deref(), Some("1.0.0"));
        assert_eq!(status.latest_version.as_deref(), Some("1.2.0"));
    }

    #[test]
    fn loads_skill_snapshot_identity_with_hash_fields() {
        let connection = open_current_database();
        insert_skill(
            &connection,
            "skill-review",
            "code-review",
            Some("1.0.0"),
            Some("aaa11111"),
        );

        let identity = load_skill_snapshot_identity(&connection, "skill-review")
            .expect("skill identity should load");

        assert_eq!(identity.name, "code-review");
        assert_eq!(identity.installed_version.as_deref(), Some("1.0.0"));
        assert_eq!(identity.installed_hash.as_deref(), Some("aaa11111"));
    }

    #[test]
    fn rejects_unsupported_raw_url_updates() {
        let connection = open_current_database();
        connection
            .execute(
                "INSERT INTO skills (
                    id,
                    name,
                    description,
                    source_type,
                    source_ref,
                    skill_path,
                    managed_dir_name
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                (
                    "skill-raw",
                    "raw-skill",
                    "Raw skill",
                    "raw_url",
                    "https://example.com/SKILL.md",
                    "SKILL.md",
                    "raw-skill-12345678",
                ),
            )
            .expect("skill should insert");

        let error = update_installed_skill(&connection, "skill-raw")
            .expect_err("raw url updates should reject");

        assert!(error
            .to_string()
            .contains("unsupported source type for updates"));
    }

    #[test]
    fn groups_multiple_skills_from_the_same_repository_into_one_checkout() {
        let grouped = group_skills_by_repository(vec![
            SkillSnapshotIdentity {
                id: "skill-a".to_string(),
                name: "find-skills".to_string(),
                source_type: "github".to_string(),
                source_ref: "https://github.com/vercel-labs/skills".to_string(),
                skill_path: "skills/find-skills/SKILL.md".to_string(),
                installed_version: Some("1.0.0".to_string()),
                installed_hash: Some("aaa11111".to_string()),
            },
            SkillSnapshotIdentity {
                id: "skill-b".to_string(),
                name: "grill-with-docs".to_string(),
                source_type: "github".to_string(),
                source_ref: "https://github.com/vercel-labs/skills".to_string(),
                skill_path: "skills/grill-with-docs/SKILL.md".to_string(),
                installed_version: Some("1.0.0".to_string()),
                installed_hash: Some("bbb22222".to_string()),
            },
        ])
        .expect("shared repository skills should group");

        assert_eq!(grouped.len(), 1);
        assert_eq!(
            grouped[0].1.source_ref,
            "https://github.com/vercel-labs/skills"
        );
        assert_eq!(grouped[0].1.skills.len(), 2);
    }

    fn open_current_database() -> Connection {
        let connection = Connection::open_in_memory().expect("database should open");
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .expect("foreign keys should enable");
        connection
            .execute_batch(CURRENT_SCHEMA)
            .expect("current schema should apply");
        connection
    }

    fn insert_skill(
        connection: &Connection,
        id: &str,
        name: &str,
        installed_version: Option<&str>,
        installed_hash: Option<&str>,
    ) {
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
                    installed_hash
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                (
                    id,
                    name,
                    "Review code changes.",
                    "github",
                    "https://github.com/acme/skills",
                    "skills/code-review/SKILL.md",
                    "code-review-0f03e0e8",
                    installed_version,
                    installed_hash,
                ),
            )
            .expect("skill should insert");
    }
}

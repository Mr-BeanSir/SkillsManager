use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::domain::ids::{managed_skill_directory_name, skill_id};

const LEGACY_PROJECT_LINK_MODE: &str = "project";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillSnapshotMetadata {
    pub version: Option<String>,
    pub hash: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalSkillInstallRequest {
    pub name: String,
    pub description: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
    pub fixture_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledSkillSnapshot {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
    pub managed_dir_name: String,
}

#[derive(Debug, Error)]
pub enum InstallError {
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("fixture path is not a directory: {0}")]
    FixtureNotDirectory(PathBuf),
    #[error("fixture is missing SKILL.md: {0}")]
    MissingSkillEntrypoint(PathBuf),
    #[error("failed to create directory {path}: {source}")]
    CreateDirectory {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to remove existing snapshot {path}: {source}")]
    RemoveSnapshot {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to copy snapshot from {source_path} to {target_path}: {source}")]
    CopySnapshot {
        source_path: PathBuf,
        target_path: PathBuf,
        source: std::io::Error,
    },
}

pub fn install_local_skill_snapshot(
    connection: &Connection,
    managed_skills_root: PathBuf,
    request: LocalSkillInstallRequest,
) -> Result<InstalledSkillSnapshot, InstallError> {
    validate_fixture(&request.fixture_path)?;
    let snapshot_metadata = read_skill_snapshot_metadata(&request.fixture_path)?;

    fs::create_dir_all(&managed_skills_root).map_err(|source| InstallError::CreateDirectory {
        path: managed_skills_root.clone(),
        source,
    })?;

    let id = skill_id(
        &request.source_type,
        &request.source_ref,
        &request.skill_path,
    );
    let managed_dir_name = existing_managed_dir_name(
        connection,
        &request.source_type,
        &request.source_ref,
        &request.skill_path,
    )?
    .unwrap_or_else(|| {
        managed_skill_directory_name(
            &request.name,
            &request.source_type,
            &request.source_ref,
            &request.skill_path,
        )
    });
    let managed_target = managed_skills_root.join(&managed_dir_name);

    if managed_target.exists() {
        fs::remove_dir_all(&managed_target).map_err(|source| InstallError::RemoveSnapshot {
            path: managed_target.clone(),
            source,
        })?;
    }

    copy_directory(&request.fixture_path, &managed_target)?;

    if skills_table_has_link_mode(connection)? {
        connection.execute(
            "INSERT INTO skills (
                id,
                name,
                description,
                source_type,
                source_ref,
                skill_path,
                managed_dir_name,
                installed_version,
                installed_hash,
                latest_version,
                latest_hash,
                link_mode
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(source_type, source_ref, skill_path) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                managed_dir_name = excluded.managed_dir_name,
                installed_version = excluded.installed_version,
                installed_hash = excluded.installed_hash,
                latest_version = excluded.latest_version,
                latest_hash = excluded.latest_hash,
                link_mode = excluded.link_mode,
                update_available = 0,
                updated_at = CURRENT_TIMESTAMP",
            (
                &id,
                &request.name,
                &request.description,
                &request.source_type,
                &request.source_ref,
                &request.skill_path,
                &managed_dir_name,
                snapshot_metadata.version.as_deref(),
                &snapshot_metadata.hash,
                snapshot_metadata.version.as_deref(),
                &snapshot_metadata.hash,
                LEGACY_PROJECT_LINK_MODE,
            ),
        )?;
    } else {
        connection.execute(
            "INSERT INTO skills (
                id,
                name,
                description,
                source_type,
                source_ref,
                skill_path,
                managed_dir_name,
                installed_version,
                installed_hash,
                latest_version,
                latest_hash
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            ON CONFLICT(source_type, source_ref, skill_path) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                managed_dir_name = excluded.managed_dir_name,
                installed_version = excluded.installed_version,
                installed_hash = excluded.installed_hash,
                latest_version = excluded.latest_version,
                latest_hash = excluded.latest_hash,
                update_available = 0,
                updated_at = CURRENT_TIMESTAMP",
            (
                &id,
                &request.name,
                &request.description,
                &request.source_type,
                &request.source_ref,
                &request.skill_path,
                &managed_dir_name,
                snapshot_metadata.version.as_deref(),
                &snapshot_metadata.hash,
                snapshot_metadata.version.as_deref(),
                &snapshot_metadata.hash,
            ),
        )?;
    }

    Ok(InstalledSkillSnapshot {
        id,
        name: request.name,
        source_type: request.source_type,
        source_ref: request.source_ref,
        skill_path: request.skill_path,
        managed_dir_name,
    })
}

#[tauri::command]
pub fn install_local_fixture_skill(
    fixture_path: PathBuf,
) -> Result<InstalledSkillSnapshot, String> {
    let database_path = crate::app_paths::database_path().map_err(|error| error.to_string())?;
    let connection = crate::db::open_database(database_path).map_err(|error| error.to_string())?;
    let managed_skills_root =
        crate::app_paths::managed_skills_dir().map_err(|error| error.to_string())?;

    install_local_skill_snapshot(
        &connection,
        managed_skills_root,
        LocalSkillInstallRequest {
            name: "sample-skill".to_string(),
            description: "Local fixture skill used to verify snapshot installation.".to_string(),
            source_type: "fixture".to_string(),
            source_ref: "fixtures/skills".to_string(),
            skill_path: "sample-skill".to_string(),
            fixture_path,
        },
    )
    .map_err(|error| error.to_string())
}

fn validate_fixture(path: &Path) -> Result<(), InstallError> {
    if !path.is_dir() {
        return Err(InstallError::FixtureNotDirectory(path.to_path_buf()));
    }

    let entrypoint = path.join("SKILL.md");
    if !entrypoint.is_file() {
        return Err(InstallError::MissingSkillEntrypoint(entrypoint));
    }

    Ok(())
}

pub fn read_skill_snapshot_metadata(path: &Path) -> Result<SkillSnapshotMetadata, InstallError> {
    Ok(SkillSnapshotMetadata {
        version: read_skill_snapshot_version(path)?,
        hash: hash_directory(path)?,
    })
}

fn existing_managed_dir_name(
    connection: &Connection,
    source_type: &str,
    source_ref: &str,
    skill_path: &str,
) -> Result<Option<String>, InstallError> {
    let mut statement = connection.prepare(
        "SELECT managed_dir_name
        FROM skills
        WHERE source_type = ?1 AND source_ref = ?2 AND skill_path = ?3",
    )?;
    let mut rows = statement.query((source_type, source_ref, skill_path))?;

    if let Some(row) = rows.next()? {
        Ok(Some(row.get(0)?))
    } else {
        Ok(None)
    }
}

fn skills_table_has_link_mode(connection: &Connection) -> Result<bool, InstallError> {
    let mut statement = connection.prepare("PRAGMA table_info(skills)")?;
    let columns = statement.query_map([], |row| row.get::<_, String>(1))?;

    for column in columns {
        if column? == "link_mode" {
            return Ok(true);
        }
    }

    Ok(false)
}

fn copy_directory(source_path: &Path, target_path: &Path) -> Result<(), InstallError> {
    fs::create_dir_all(target_path).map_err(|source| InstallError::CreateDirectory {
        path: target_path.to_path_buf(),
        source,
    })?;

    for entry in fs::read_dir(source_path).map_err(|source| InstallError::CopySnapshot {
        source_path: source_path.to_path_buf(),
        target_path: target_path.to_path_buf(),
        source,
    })? {
        let entry = entry.map_err(|source| InstallError::CopySnapshot {
            source_path: source_path.to_path_buf(),
            target_path: target_path.to_path_buf(),
            source,
        })?;
        let source_child = entry.path();
        let target_child = target_path.join(entry.file_name());
        let file_type = entry
            .file_type()
            .map_err(|source| InstallError::CopySnapshot {
                source_path: source_child.clone(),
                target_path: target_child.clone(),
                source,
            })?;

        if file_type.is_dir() {
            copy_directory(&source_child, &target_child)?;
        } else {
            fs::copy(&source_child, &target_child).map_err(|source| {
                InstallError::CopySnapshot {
                    source_path: source_child,
                    target_path: target_child,
                    source,
                }
            })?;
        }
    }

    Ok(())
}

fn read_skill_snapshot_version(path: &Path) -> Result<Option<String>, InstallError> {
    let version_path = path.join("VERSION");

    if !version_path.is_file() {
        return Ok(None);
    }

    let version =
        fs::read_to_string(&version_path).map_err(|source| InstallError::CopySnapshot {
            source_path: version_path.clone(),
            target_path: version_path,
            source,
        })?;
    let trimmed = version.trim();

    if trimmed.is_empty() {
        Ok(None)
    } else {
        Ok(Some(trimmed.to_string()))
    }
}

fn hash_directory(path: &Path) -> Result<String, InstallError> {
    let mut file_paths = Vec::new();
    collect_file_paths(path, path, &mut file_paths)?;
    file_paths.sort();

    let mut hash: u32 = 0x811c9dc5;

    for relative_path in file_paths {
        for byte in relative_path.as_bytes() {
            hash ^= u32::from(*byte);
            hash = hash.wrapping_mul(0x01000193);
        }

        let bytes = fs::read(path.join(relative_path.replace('/', "\\"))).map_err(|source| {
            InstallError::CopySnapshot {
                source_path: path.join(relative_path.replace('/', "\\")),
                target_path: path.join(relative_path.replace('/', "\\")),
                source,
            }
        })?;

        for byte in bytes {
            hash ^= u32::from(byte);
            hash = hash.wrapping_mul(0x01000193);
        }
    }

    Ok(format!("{hash:08x}"))
}

fn collect_file_paths(
    root: &Path,
    current: &Path,
    file_paths: &mut Vec<String>,
) -> Result<(), InstallError> {
    for entry in fs::read_dir(current).map_err(|source| InstallError::CopySnapshot {
        source_path: current.to_path_buf(),
        target_path: current.to_path_buf(),
        source,
    })? {
        let entry = entry.map_err(|source| InstallError::CopySnapshot {
            source_path: current.to_path_buf(),
            target_path: current.to_path_buf(),
            source,
        })?;
        let path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|source| InstallError::CopySnapshot {
                source_path: path.clone(),
                target_path: path.clone(),
                source,
            })?;

        if file_type.is_dir() {
            collect_file_paths(root, &path, file_paths)?;
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .expect("child path should stay inside snapshot root")
            .components()
            .map(|component| component.as_os_str().to_string_lossy().into_owned())
            .collect::<Vec<_>>()
            .join("/");
        file_paths.push(relative);
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{install_local_skill_snapshot, LocalSkillInstallRequest};
    use crate::db::open_in_memory_database;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn installs_fixture_as_managed_snapshot_and_inserts_skill_row() {
        let connection = open_in_memory_database().expect("database should open");
        let workspace = TestWorkspace::new("install-fixture");
        let fixture = workspace.create_fixture("sample-skill", "# Sample Skill\n");
        let managed_root = workspace.root.join("managed-skills");

        let installed = install_local_skill_snapshot(
            &connection,
            managed_root.clone(),
            LocalSkillInstallRequest {
                name: "Sample Skill".to_string(),
                description: "Fixture skill for install tests".to_string(),
                source_type: "fixture".to_string(),
                source_ref: "fixtures/skills".to_string(),
                skill_path: "sample-skill".to_string(),
                fixture_path: fixture.clone(),
            },
        )
        .expect("fixture should install");

        assert_eq!(installed.name, "Sample Skill");
        assert!(installed.managed_dir_name.starts_with("sample-skill-"));
        assert!(managed_root
            .join(&installed.managed_dir_name)
            .join("SKILL.md")
            .exists());

        let row = connection
            .query_row(
                "SELECT id, name, source_type, source_ref, skill_path, managed_dir_name
                FROM skills
                WHERE source_type = 'fixture' AND source_ref = 'fixtures/skills' AND skill_path = 'sample-skill'",
                [],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                        row.get::<_, String>(4)?,
                        row.get::<_, String>(5)?,
                    ))
                },
            )
            .expect("skill row should exist");

        assert_eq!(
            row,
            (
                installed.id,
                "Sample Skill".to_string(),
                "fixture".to_string(),
                "fixtures/skills".to_string(),
                "sample-skill".to_string(),
                installed.managed_dir_name,
            )
        );
    }

    #[test]
    fn reinstalling_same_source_updates_existing_row_instead_of_duplicating() {
        let connection = open_in_memory_database().expect("database should open");
        let workspace = TestWorkspace::new("reinstall-fixture");
        let fixture = workspace.create_fixture("sample-skill", "# Sample Skill\n");
        let managed_root = workspace.root.join("managed-skills");

        let first = install_local_skill_snapshot(
            &connection,
            managed_root.clone(),
            LocalSkillInstallRequest {
                name: "Sample Skill".to_string(),
                description: "First description".to_string(),
                source_type: "fixture".to_string(),
                source_ref: "fixtures/skills".to_string(),
                skill_path: "sample-skill".to_string(),
                fixture_path: fixture.clone(),
            },
        )
        .expect("first install should work");

        fs::write(fixture.join("README.md"), "updated snapshot").expect("fixture should update");

        let second = install_local_skill_snapshot(
            &connection,
            managed_root.clone(),
            LocalSkillInstallRequest {
                name: "Sample Skill Renamed".to_string(),
                description: "Second description".to_string(),
                source_type: "fixture".to_string(),
                source_ref: "fixtures/skills".to_string(),
                skill_path: "sample-skill".to_string(),
                fixture_path: fixture,
            },
        )
        .expect("reinstall should work");

        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM skills", [], |row| row.get(0))
            .expect("count should query");

        assert_eq!(count, 1);
        assert_eq!(second.id, first.id);
        assert_eq!(second.managed_dir_name, first.managed_dir_name);
        assert_eq!(second.name, "Sample Skill Renamed");
        assert!(managed_root
            .join(&second.managed_dir_name)
            .join("README.md")
            .exists());
    }

    struct TestWorkspace {
        root: PathBuf,
    }

    impl TestWorkspace {
        fn new(name: &str) -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("time should be available")
                .as_nanos();
            let root = std::env::temp_dir().join(format!("skills-manager-{name}-{unique}"));
            fs::create_dir_all(&root).expect("workspace should be created");
            Self { root }
        }

        fn create_fixture(&self, name: &str, skill_md: &str) -> PathBuf {
            let fixture = self.root.join("fixtures").join(name);
            fs::create_dir_all(&fixture).expect("fixture should be created");
            fs::write(fixture.join("SKILL.md"), skill_md).expect("skill file should be written");
            fixture
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            remove_dir_all_if_exists(&self.root);
        }
    }

    fn remove_dir_all_if_exists(path: &Path) {
        if path.exists() {
            fs::remove_dir_all(path).expect("test workspace should be removed");
        }
    }
}

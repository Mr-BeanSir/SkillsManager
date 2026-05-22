use std::collections::HashSet;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Deserialize;
use serde::Serialize;
use thiserror::Error;

use crate::install::{
    install_local_skill_snapshot, InstalledSkillSnapshot, LocalSkillInstallRequest,
};

const SKIP_DIRS: &[&str] = &["node_modules", ".git", "dist", "build", "__pycache__"];
const PRIORITY_SEARCH_DIRS: &[&str] = &[
    "",
    "skills",
    "skills/.curated",
    "skills/.experimental",
    "skills/.system",
    ".agents/skills",
    ".claude/skills",
    ".cline/skills",
    ".codebuddy/skills",
    ".codex/skills",
    ".commandcode/skills",
    ".continue/skills",
    ".github/skills",
    ".goose/skills",
    ".iflow/skills",
    ".junie/skills",
    ".kilocode/skills",
    ".kiro/skills",
    ".mux/skills",
    ".neovate/skills",
    ".opencode/skills",
    ".openhands/skills",
    ".pi/skills",
    ".qoder/skills",
    ".roo/skills",
    ".trae/skills",
    ".windsurf/skills",
    ".zencoder/skills",
];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositorySource {
    pub source_type: String,
    pub source_ref: String,
    pub clone_url: String,
    pub ref_name: Option<String>,
    pub subpath: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RepositorySkill {
    pub name: String,
    pub description: String,
    pub skill_path: String,
    pub directory_path: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySkillInstallRequest {
    pub source: String,
    pub skill_name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySkillCheckResult {
    pub source_ref: String,
    pub skill_name: String,
    pub skill_path: String,
    pub description: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositorySkillCheckAllResult {
    pub source_ref: String,
    pub total: usize,
    pub names: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(untagged)]
pub enum RepositoryCheckOutcome {
    Single(RepositorySkillCheckResult),
    All(RepositorySkillCheckAllResult),
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInstallProgress {
    pub stage: String,
    pub message: String,
    pub current: Option<usize>,
    pub total: Option<usize>,
}

#[derive(Debug, Error)]
pub enum RepositorySourceError {
    #[error("unsupported repository source: {0}")]
    UnsupportedSource(String),
    #[error("unsafe repository subpath: {0}")]
    UnsafeSubpath(String),
    #[error("raw skill URL must point to SKILL.md: {0}")]
    RawSkillUrlMustPointToEntrypoint(String),
    #[error("repository checkout is not a directory: {0}")]
    CheckoutNotDirectory(PathBuf),
    #[error("repository has no valid SKILL.md files")]
    NoSkillsFound,
    #[error("skill not found: {0}")]
    SkillNotFound(String),
    #[error("failed to read directory {path}: {source}")]
    ReadDirectory {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to read SKILL.md {path}: {source}")]
    ReadSkillEntrypoint {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to create temporary checkout directory {path}: {source}")]
    CreateTemporaryCheckout {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to create raw skill directory {path}: {source}")]
    CreateRawSkillDirectory {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("failed to write raw SKILL.md {path}: {source}")]
    WriteRawSkillEntrypoint {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("git clone failed: {0}")]
    GitCloneFailed(String),
    #[error("raw skill download failed: {0}")]
    RawSkillDownloadFailed(String),
    #[error("install failed: {0}")]
    Install(#[from] crate::install::InstallError),
    #[error("sqlite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("app path error: {0}")]
    AppPath(String),
}

pub fn parse_repository_source(input: &str) -> Result<RepositorySource, RepositorySourceError> {
    let trimmed = input.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err(RepositorySourceError::UnsupportedSource(input.to_string()));
    }

    if let Some(source) = parse_github_tree_url(trimmed)? {
        return Ok(source);
    }

    if let Some(source) = parse_github_repo_url(trimmed) {
        return Ok(source);
    }

    if let Some(source) = parse_github_shorthand(trimmed)? {
        return Ok(source);
    }

    if let Some(source) = parse_gitlab_tree_url(trimmed)? {
        return Ok(source);
    }

    if let Some(source) = parse_gitlab_repo_url(trimmed) {
        return Ok(source);
    }

    if let Some(source) = parse_well_known_manifest_url(trimmed)? {
        return Ok(source);
    }

    if let Some(source) = parse_raw_skill_url(trimmed)? {
        return Ok(source);
    }

    Err(RepositorySourceError::UnsupportedSource(input.to_string()))
}

pub fn discover_repository_skills(
    checkout_root: &Path,
    subpath: Option<&str>,
) -> Result<Vec<RepositorySkill>, RepositorySourceError> {
    if !checkout_root.is_dir() {
        return Err(RepositorySourceError::CheckoutNotDirectory(
            checkout_root.to_path_buf(),
        ));
    }

    let search_path = match subpath {
        Some(value) if !value.trim().is_empty() => checkout_root.join(sanitize_subpath(value)?),
        _ => checkout_root.to_path_buf(),
    };
    if !search_path.is_dir() {
        return Ok(Vec::new());
    }

    let mut skills = Vec::new();
    let mut seen_names = HashSet::new();

    if has_skill_md(&search_path) {
        if let Some(skill) = parse_skill_directory(checkout_root, &search_path)? {
            remember_skill(&mut skills, &mut seen_names, skill);
            return Ok(skills);
        }
    }

    for priority in PRIORITY_SEARCH_DIRS {
        let priority_path = if priority.is_empty() {
            search_path.clone()
        } else {
            search_path.join(path_from_forward_slashes(priority))
        };
        if !priority_path.is_dir() {
            continue;
        }

        for entry in
            fs::read_dir(&priority_path).map_err(|source| RepositorySourceError::ReadDirectory {
                path: priority_path.clone(),
                source,
            })?
        {
            let entry = entry.map_err(|source| RepositorySourceError::ReadDirectory {
                path: priority_path.clone(),
                source,
            })?;
            let path = entry.path();
            if path.is_dir() && has_skill_md(&path) {
                if let Some(skill) = parse_skill_directory(checkout_root, &path)? {
                    remember_skill(&mut skills, &mut seen_names, skill);
                }
            }
        }
    }

    if skills.is_empty() {
        for skill_dir in find_skill_dirs(&search_path, 0, 5)? {
            if let Some(skill) = parse_skill_directory(checkout_root, &skill_dir)? {
                remember_skill(&mut skills, &mut seen_names, skill);
            }
        }
    }

    Ok(skills)
}

pub fn select_repository_skill(
    skills: &[RepositorySkill],
    skill_name: &str,
) -> Result<RepositorySkill, RepositorySourceError> {
    let normalized = skill_name.trim().to_lowercase();
    skills
        .iter()
        .find(|skill| {
            skill.name.to_lowercase() == normalized
                || skill
                    .directory_path
                    .file_name()
                    .and_then(|name| name.to_str())
                    .map(|folder_name| folder_name.to_lowercase() == normalized)
                    .unwrap_or(false)
        })
        .cloned()
        .ok_or_else(|| RepositorySourceError::SkillNotFound(skill_name.to_string()))
}

pub fn install_repository_skill_from_checkout(
    connection: &Connection,
    managed_skills_root: PathBuf,
    checkout_root: &Path,
    source_type: &str,
    source_ref: &str,
    subpath: Option<&str>,
    skill_name: &str,
    progress: &Option<tauri::ipc::Channel<RepositoryInstallProgress>>,
) -> Result<Vec<InstalledSkillSnapshot>, RepositorySourceError> {
    let skills = discover_repository_skills(checkout_root, subpath)?;
    if skills.is_empty() {
        return Err(RepositorySourceError::NoSkillsFound);
    }

    if skill_name.trim() == "*" {
        let total = skills.len();
        send_progress(progress, RepositoryInstallProgress {
            stage: "discovered".to_string(),
            message: format!("Found {total} skills"),
            current: None,
            total: Some(total),
        });
        let mut installed = Vec::new();
        for (index, skill) in skills.into_iter().enumerate() {
            let current = index + 1;
            send_progress(progress, RepositoryInstallProgress {
                stage: "installing".to_string(),
                message: format!("Installing {current}/{total}: {}", skill.name),
                current: Some(current),
                total: Some(total),
            });
            let snapshot = install_local_skill_snapshot(
                connection,
                managed_skills_root.clone(),
                LocalSkillInstallRequest {
                    name: skill.name,
                    description: skill.description,
                    source_type: source_type.to_string(),
                    source_ref: source_ref.to_string(),
                    skill_path: skill.skill_path,
                    fixture_path: skill.directory_path,
                },
            )
            .map_err(RepositorySourceError::Install)?;
            installed.push(snapshot);
        }
        return Ok(installed);
    }

    let skill = select_repository_skill(&skills, skill_name)?;
    send_progress(progress, RepositoryInstallProgress {
        stage: "installing".to_string(),
        message: format!("Installing: {}", skill.name),
        current: Some(1),
        total: Some(1),
    });
    let snapshot = install_local_skill_snapshot(
        connection,
        managed_skills_root,
        LocalSkillInstallRequest {
            name: skill.name,
            description: skill.description,
            source_type: source_type.to_string(),
            source_ref: source_ref.to_string(),
            skill_path: skill.skill_path,
            fixture_path: skill.directory_path,
        },
    )
    .map_err(RepositorySourceError::Install)?;
    Ok(vec![snapshot])
}

pub fn check_repository_skill_from_checkout(
    checkout_root: &Path,
    source_ref: &str,
    subpath: Option<&str>,
    skill_name: &str,
) -> Result<RepositoryCheckOutcome, RepositorySourceError> {
    let skills = discover_repository_skills(checkout_root, subpath)?;
    if skills.is_empty() {
        return Err(RepositorySourceError::NoSkillsFound);
    }

    if skill_name.trim() == "*" {
        return Ok(RepositoryCheckOutcome::All(
            RepositorySkillCheckAllResult {
                source_ref: source_ref.to_string(),
                total: skills.len(),
                names: skills.into_iter().map(|s| s.name).collect(),
            },
        ));
    }

    let selected = select_repository_skill(&skills, skill_name)?;

    Ok(RepositoryCheckOutcome::Single(RepositorySkillCheckResult {
        source_ref: source_ref.to_string(),
        skill_name: selected.name,
        skill_path: selected.skill_path,
        description: selected.description,
    }))
}

fn send_progress(channel: &Option<tauri::ipc::Channel<RepositoryInstallProgress>>, progress: RepositoryInstallProgress) {
    if let Some(ch) = channel {
        let _ = ch.send(progress);
    }
}

pub fn install_repository_skill(
    connection: &Connection,
    managed_skills_root: PathBuf,
    request: RepositorySkillInstallRequest,
    progress: Option<tauri::ipc::Channel<RepositoryInstallProgress>>,
) -> Result<Vec<InstalledSkillSnapshot>, RepositorySourceError> {
    let source = parse_repository_source(&request.source)?;
    if source.source_type == "raw_url" {
        if request.skill_name.trim() == "*" {
            return Err(RepositorySourceError::UnsupportedSource(
                "wildcard * is not supported for raw SKILL.md URLs".to_string(),
            ));
        }
        send_progress(&progress, RepositoryInstallProgress {
            stage: "downloading".to_string(),
            message: "Downloading SKILL.md…".to_string(),
            current: None,
            total: None,
        });
        let checkout = TemporaryCheckout::new()?;
        let raw_entrypoint = download_raw_skill_entrypoint(&source.clone_url, checkout.path())?;
        return install_raw_skill_entrypoint_from_path(
            connection,
            managed_skills_root,
            &raw_entrypoint,
            &source.source_ref,
            &request.skill_name,
        );
    }

    if source.source_type == "well_known" {
        send_progress(&progress, RepositoryInstallProgress {
            stage: "fetching".to_string(),
            message: "Fetching skill manifest…".to_string(),
            current: None,
            total: None,
        });
        let manifest_body = fetch_text_url(&source.clone_url, "application/json")?;
        return install_well_known_skill_from_manifest_body(
            connection,
            managed_skills_root,
            &source.source_ref,
            &manifest_body,
            &request.skill_name,
        );
    }

    send_progress(&progress, RepositoryInstallProgress {
        stage: "cloning".to_string(),
        message: "Cloning repository…".to_string(),
        current: None,
        total: None,
    });
    let checkout = TemporaryCheckout::new()?;
    clone_repository(&source, checkout.path())?;

    send_progress(&progress, RepositoryInstallProgress {
        stage: "discovering".to_string(),
        message: "Discovering skills…".to_string(),
        current: None,
        total: None,
    });
    install_repository_skill_from_checkout(
        connection,
        managed_skills_root,
        checkout.path(),
        &source.source_type,
        &source.source_ref,
        source.subpath.as_deref(),
        &request.skill_name,
        &progress,
    )
}

pub fn check_repository_skill(
    source: &str,
    skill_name: &str,
) -> Result<RepositoryCheckOutcome, RepositorySourceError> {
    let parsed = parse_repository_source(source)?;

    if parsed.source_type == "raw_url" {
        if skill_name.trim() == "*" {
            return Err(RepositorySourceError::UnsupportedSource(
                "wildcard * is not supported for raw SKILL.md URLs".to_string(),
            ));
        }
        let checkout = TemporaryCheckout::new()?;
        let raw_entrypoint = download_raw_skill_entrypoint(&parsed.clone_url, checkout.path())?;
        let parent =
            raw_entrypoint
                .parent()
                .ok_or_else(|| RepositorySourceError::ReadSkillEntrypoint {
                    path: raw_entrypoint.clone(),
                    source: std::io::Error::other("raw skill parent directory missing"),
                })?;
        let parsed_skill =
            parse_skill_directory(parent, parent)?.ok_or(RepositorySourceError::NoSkillsFound)?;
        let selected = select_repository_skill(&[parsed_skill], skill_name)?;

        return Ok(RepositoryCheckOutcome::Single(RepositorySkillCheckResult {
            source_ref: parsed.source_ref,
            skill_name: selected.name,
            skill_path: selected.skill_path,
            description: selected.description,
        }));
    }

    if parsed.source_type == "well_known" {
        let manifest_body = fetch_text_url(&parsed.clone_url, "application/json")?;
        let manifest: WellKnownSkillsManifest = serde_json::from_str(&manifest_body)
            .map_err(|error| RepositorySourceError::RawSkillDownloadFailed(error.to_string()))?;

        if skill_name.trim() == "*" {
            return Ok(RepositoryCheckOutcome::All(
                RepositorySkillCheckAllResult {
                    source_ref: parsed.source_ref,
                    total: manifest.skills.len(),
                    names: manifest.skills.into_iter().map(|s| s.name).collect(),
                },
            ));
        }

        let entry = manifest
            .skills
            .into_iter()
            .find(|candidate| candidate.name.eq_ignore_ascii_case(skill_name.trim()))
            .ok_or_else(|| RepositorySourceError::SkillNotFound(skill_name.to_string()))?;

        return Ok(RepositoryCheckOutcome::Single(RepositorySkillCheckResult {
            source_ref: parsed.source_ref,
            skill_name: entry.name,
            skill_path: entry.url,
            description: String::new(),
        }));
    }

    let checkout = TemporaryCheckout::new()?;
    clone_repository(&parsed, checkout.path())?;
    check_repository_skill_from_checkout(
        checkout.path(),
        &parsed.source_ref,
        parsed.subpath.as_deref(),
        skill_name,
    )
}

#[tauri::command]
pub async fn install_repository_skill_record(
    source: String,
    skill_name: String,
    on_progress: tauri::ipc::Channel<RepositoryInstallProgress>,
) -> Result<Vec<InstalledSkillSnapshot>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let database_path = crate::app_paths::database_path()
            .map_err(|error| RepositorySourceError::AppPath(error.to_string()).to_string())?;
        let connection =
            crate::db::open_database(database_path).map_err(|error| error.to_string())?;
        let managed_skills_root = crate::app_paths::managed_skills_dir()
            .map_err(|error| RepositorySourceError::AppPath(error.to_string()).to_string())?;

        let installed = install_repository_skill(
            &connection,
            managed_skills_root.clone(),
            RepositorySkillInstallRequest { source, skill_name },
            Some(on_progress),
        )
        .map_err(|error| error.to_string())?;

        Ok(installed)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn check_repository_skill_record(
    source: String,
    skill_name: String,
) -> Result<RepositoryCheckOutcome, String> {
    check_repository_skill(&source, &skill_name).map_err(|error| error.to_string())
}

fn parse_github_repo_url(input: &str) -> Option<RepositorySource> {
    let marker = "github.com/";
    let marker_index = input.find(marker)?;
    let path = &input[(marker_index + marker.len())..];
    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() < 2 || parts[0].is_empty() || parts[1].is_empty() {
        return None;
    }

    let owner = parts[0];
    let repo = clean_repo_name(parts[1]);
    Some(github_source(owner, &repo, None, None))
}

fn parse_github_tree_url(input: &str) -> Result<Option<RepositorySource>, RepositorySourceError> {
    let marker = "github.com/";
    let Some(marker_index) = input.find(marker) else {
        return Ok(None);
    };
    let path = &input[(marker_index + marker.len())..];
    let parts = path.split('/').collect::<Vec<_>>();
    if parts.len() < 4 || parts[2] != "tree" {
        return Ok(None);
    }

    let owner = parts[0];
    let repo = clean_repo_name(parts[1]);
    let ref_name = parts[3].to_string();
    let subpath = if parts.len() > 4 {
        Some(sanitize_subpath(&parts[4..].join("/"))?)
    } else {
        None
    };
    Ok(Some(github_source(owner, &repo, Some(ref_name), subpath)))
}

fn parse_github_shorthand(input: &str) -> Result<Option<RepositorySource>, RepositorySourceError> {
    if input.contains(':') || input.starts_with('.') || input.starts_with('/') {
        return Ok(None);
    }

    let mut repo_and_filter = input.split('@');
    let repo_part = repo_and_filter.next().unwrap_or_default();
    let parts = repo_part.split('/').collect::<Vec<_>>();
    if parts.len() < 2 || parts[0].is_empty() || parts[1].is_empty() {
        return Ok(None);
    }

    let subpath = if parts.len() > 2 {
        Some(sanitize_subpath(&parts[2..].join("/"))?)
    } else {
        None
    };

    Ok(Some(github_source(parts[0], parts[1], None, subpath)))
}

fn parse_gitlab_repo_url(input: &str) -> Option<RepositorySource> {
    let marker = "gitlab.com/";
    let marker_index = input.find(marker)?;
    let path = &input[(marker_index + marker.len())..];
    if path.contains("/-/") {
        return None;
    }

    let source_ref = clean_gitlab_source_ref(path)?;
    Some(gitlab_source(&source_ref, None, None))
}

fn parse_gitlab_tree_url(input: &str) -> Result<Option<RepositorySource>, RepositorySourceError> {
    let marker = "gitlab.com/";
    let Some(marker_index) = input.find(marker) else {
        return Ok(None);
    };
    let path = &input[(marker_index + marker.len())..];
    let Some((source_ref, tree_part)) = path.split_once("/-/tree/") else {
        return Ok(None);
    };

    let source_ref = clean_gitlab_source_ref(source_ref)
        .ok_or_else(|| RepositorySourceError::UnsupportedSource(input.to_string()))?;
    let parts = tree_part.split('/').collect::<Vec<_>>();
    if parts.is_empty() || parts[0].is_empty() {
        return Ok(None);
    }

    let ref_name = parts[0].to_string();
    let subpath = if parts.len() > 1 {
        Some(sanitize_subpath(&parts[1..].join("/"))?)
    } else {
        None
    };
    Ok(Some(gitlab_source(&source_ref, Some(ref_name), subpath)))
}

fn parse_raw_skill_url(input: &str) -> Result<Option<RepositorySource>, RepositorySourceError> {
    if !(input.starts_with("https://") || input.starts_with("http://")) {
        return Ok(None);
    }
    if input.contains("github.com/") || input.contains("gitlab.com/") {
        return Ok(None);
    }

    if !input
        .split('?')
        .next()
        .unwrap_or(input)
        .trim_end_matches('/')
        .ends_with("/SKILL.md")
    {
        return Err(RepositorySourceError::RawSkillUrlMustPointToEntrypoint(
            input.to_string(),
        ));
    }

    Ok(Some(RepositorySource {
        source_type: "raw_url".to_string(),
        source_ref: input.to_string(),
        clone_url: input.to_string(),
        ref_name: None,
        subpath: None,
    }))
}

fn parse_well_known_manifest_url(
    input: &str,
) -> Result<Option<RepositorySource>, RepositorySourceError> {
    if !(input.starts_with("https://") || input.starts_with("http://")) {
        return Ok(None);
    }
    if !input
        .split('?')
        .next()
        .unwrap_or(input)
        .trim_end_matches('/')
        .ends_with("/.well-known/skills.json")
    {
        return Ok(None);
    }

    Ok(Some(RepositorySource {
        source_type: "well_known".to_string(),
        source_ref: input.to_string(),
        clone_url: input.to_string(),
        ref_name: None,
        subpath: None,
    }))
}

fn github_source(
    owner: &str,
    repo: &str,
    ref_name: Option<String>,
    subpath: Option<String>,
) -> RepositorySource {
    RepositorySource {
        source_type: "github".to_string(),
        source_ref: format!("{owner}/{repo}"),
        clone_url: format!("https://github.com/{owner}/{repo}.git"),
        ref_name,
        subpath,
    }
}

fn gitlab_source(
    source_ref: &str,
    ref_name: Option<String>,
    subpath: Option<String>,
) -> RepositorySource {
    RepositorySource {
        source_type: "gitlab".to_string(),
        source_ref: source_ref.to_string(),
        clone_url: format!("https://gitlab.com/{source_ref}.git"),
        ref_name,
        subpath,
    }
}

fn clean_repo_name(repo: &str) -> String {
    repo.trim_end_matches(".git").to_string()
}

fn clean_gitlab_source_ref(path: &str) -> Option<String> {
    let cleaned = path
        .trim_matches('/')
        .trim_end_matches(".git")
        .split('?')
        .next()
        .unwrap_or_default()
        .trim_matches('/');
    let parts = cleaned
        .split('/')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>();
    if parts.len() < 2 {
        return None;
    }
    Some(parts.join("/"))
}

fn sanitize_subpath(subpath: &str) -> Result<String, RepositorySourceError> {
    let normalized = subpath.replace('\\', "/");
    if normalized
        .split('/')
        .any(|part| part == ".." || part.is_empty())
    {
        return Err(RepositorySourceError::UnsafeSubpath(subpath.to_string()));
    }
    Ok(normalized)
}

fn has_skill_md(dir: &Path) -> bool {
    dir.join("SKILL.md").is_file()
}

fn parse_skill_directory(
    checkout_root: &Path,
    skill_dir: &Path,
) -> Result<Option<RepositorySkill>, RepositorySourceError> {
    let entrypoint = skill_dir.join("SKILL.md");
    let content = fs::read_to_string(&entrypoint).map_err(|source| {
        RepositorySourceError::ReadSkillEntrypoint {
            path: entrypoint.clone(),
            source,
        }
    })?;

    let Some(frontmatter) = frontmatter_block(&content) else {
        return Ok(None);
    };
    let Some(name) = frontmatter_value(frontmatter, "name") else {
        return Ok(None);
    };
    let Some(description) = frontmatter_value(frontmatter, "description") else {
        return Ok(None);
    };

    let skill_path = entrypoint
        .strip_prefix(checkout_root)
        .unwrap_or(&entrypoint)
        .components()
        .filter_map(component_to_string)
        .collect::<Vec<_>>()
        .join("/");

    Ok(Some(RepositorySkill {
        name,
        description,
        skill_path,
        directory_path: skill_dir.to_path_buf(),
    }))
}

pub fn install_raw_skill_entrypoint_from_path(
    connection: &Connection,
    managed_skills_root: PathBuf,
    entrypoint: &Path,
    source_ref: &str,
    skill_name: &str,
) -> Result<Vec<InstalledSkillSnapshot>, RepositorySourceError> {
    let skill_dir =
        entrypoint
            .parent()
            .ok_or_else(|| RepositorySourceError::ReadSkillEntrypoint {
                path: entrypoint.to_path_buf(),
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "SKILL.md has no parent directory",
                ),
            })?;
    let Some(skill) = parse_skill_directory(skill_dir, skill_dir)? else {
        return Err(RepositorySourceError::NoSkillsFound);
    };
    let selected = select_repository_skill(&[skill], skill_name)?;

    let snapshot = install_local_skill_snapshot(
        connection,
        managed_skills_root,
        LocalSkillInstallRequest {
            name: selected.name,
            description: selected.description,
            source_type: "raw_url".to_string(),
            source_ref: source_ref.to_string(),
            skill_path: selected.skill_path,
            fixture_path: selected.directory_path,
        },
    )
    .map_err(RepositorySourceError::Install)?;
    Ok(vec![snapshot])
}

pub fn install_well_known_skill_from_manifest_body(
    connection: &Connection,
    managed_skills_root: PathBuf,
    manifest_url: &str,
    manifest_body: &str,
    skill_name: &str,
) -> Result<Vec<InstalledSkillSnapshot>, RepositorySourceError> {
    let manifest: WellKnownSkillsManifest = serde_json::from_str(manifest_body)
        .map_err(|error| RepositorySourceError::RawSkillDownloadFailed(error.to_string()))?;

    if skill_name.trim() == "*" {
        let mut installed = Vec::new();
        for entry in manifest.skills {
            let checkout = TemporaryCheckout::new()?;
            let entrypoint = load_skill_entrypoint_reference(&entry.url, checkout.path())?;
            let skill_dir =
                entrypoint
                    .parent()
                    .ok_or_else(|| RepositorySourceError::ReadSkillEntrypoint {
                        path: entrypoint.clone(),
                        source: std::io::Error::new(
                            std::io::ErrorKind::InvalidInput,
                            "SKILL.md has no parent directory",
                        ),
                    })?;
            let Some(parsed_skill) = parse_skill_directory(skill_dir, skill_dir)? else {
                continue;
            };
            let snapshot = install_local_skill_snapshot(
                connection,
                managed_skills_root.clone(),
                LocalSkillInstallRequest {
                    name: parsed_skill.name,
                    description: parsed_skill.description,
                    source_type: "well_known".to_string(),
                    source_ref: manifest_url.to_string(),
                    skill_path: entry.url.replace('\\', "/"),
                    fixture_path: parsed_skill.directory_path,
                },
            )
            .map_err(RepositorySourceError::Install)?;
            installed.push(snapshot);
        }
        return Ok(installed);
    }

    let normalized = skill_name.trim().to_lowercase();
    let selected = manifest
        .skills
        .into_iter()
        .find(|skill| skill.name.to_lowercase() == normalized)
        .ok_or_else(|| RepositorySourceError::SkillNotFound(skill_name.to_string()))?;

    let checkout = TemporaryCheckout::new()?;
    let entrypoint = load_skill_entrypoint_reference(&selected.url, checkout.path())?;
    let skill_dir =
        entrypoint
            .parent()
            .ok_or_else(|| RepositorySourceError::ReadSkillEntrypoint {
                path: entrypoint.clone(),
                source: std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "SKILL.md has no parent directory",
                ),
            })?;
    let Some(parsed_skill) = parse_skill_directory(skill_dir, skill_dir)? else {
        return Err(RepositorySourceError::NoSkillsFound);
    };
    let selected_skill = select_repository_skill(&[parsed_skill], skill_name)?;

    let snapshot = install_local_skill_snapshot(
        connection,
        managed_skills_root,
        LocalSkillInstallRequest {
            name: selected_skill.name,
            description: selected_skill.description,
            source_type: "well_known".to_string(),
            source_ref: manifest_url.to_string(),
            skill_path: selected.url.replace('\\', "/"),
            fixture_path: selected_skill.directory_path,
        },
    )
    .map_err(RepositorySourceError::Install)?;
    Ok(vec![snapshot])
}

#[derive(Debug, Deserialize)]
struct WellKnownSkillsManifest {
    skills: Vec<WellKnownSkillEntry>,
}

#[derive(Debug, Deserialize)]
struct WellKnownSkillEntry {
    name: String,
    url: String,
}

fn frontmatter_block(content: &str) -> Option<&str> {
    let normalized = content
        .strip_prefix("---\r\n")
        .or_else(|| content.strip_prefix("---\n"))?;
    normalized
        .split_once("\r\n---")
        .or_else(|| normalized.split_once("\n---"))
        .map(|(block, _)| block)
}

fn frontmatter_value(block: &str, key: &str) -> Option<String> {
    for line in block.lines() {
        let trimmed = line.trim();
        let (candidate, value) = trimmed.split_once(':')?;
        if candidate.trim() != key {
            continue;
        }
        let value = value.trim().trim_matches('"').trim_matches('\'');
        if value.is_empty() {
            return None;
        }
        return Some(value.to_string());
    }
    None
}

fn remember_skill(
    skills: &mut Vec<RepositorySkill>,
    seen_names: &mut HashSet<String>,
    skill: RepositorySkill,
) {
    let normalized = skill.name.to_lowercase();
    if seen_names.insert(normalized) {
        skills.push(skill);
    }
}

fn find_skill_dirs(
    dir: &Path,
    depth: usize,
    max_depth: usize,
) -> Result<Vec<PathBuf>, RepositorySourceError> {
    if depth > max_depth {
        return Ok(Vec::new());
    }

    let mut dirs = Vec::new();
    if has_skill_md(dir) {
        dirs.push(dir.to_path_buf());
    }

    for entry in fs::read_dir(dir).map_err(|source| RepositorySourceError::ReadDirectory {
        path: dir.to_path_buf(),
        source,
    })? {
        let entry = entry.map_err(|source| RepositorySourceError::ReadDirectory {
            path: dir.to_path_buf(),
            source,
        })?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().into_owned();
        if path.is_dir() && !SKIP_DIRS.contains(&name.as_str()) {
            dirs.extend(find_skill_dirs(&path, depth + 1, max_depth)?);
        }
    }

    Ok(dirs)
}

fn clone_repository(source: &RepositorySource, target: &Path) -> Result<(), RepositorySourceError> {
    let mut command = Command::new("git");
    command.arg("clone").arg("--depth").arg("1");
    if let Some(ref_name) = &source.ref_name {
        command.arg("--branch").arg(ref_name);
    }
    command.arg(&source.clone_url).arg(target);

    let output = command
        .output()
        .map_err(|error| RepositorySourceError::GitCloneFailed(error.to_string()))?;
    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(RepositorySourceError::GitCloneFailed(
        if stderr.is_empty() { stdout } else { stderr },
    ))
}

fn download_raw_skill_entrypoint(
    url: &str,
    target: &Path,
) -> Result<PathBuf, RepositorySourceError> {
    let skill_dir = target.join("raw-skill");
    fs::create_dir_all(&skill_dir).map_err(|source| {
        RepositorySourceError::CreateRawSkillDirectory {
            path: skill_dir.clone(),
            source,
        }
    })?;
    let body = fetch_text_url(url, "text/plain,text/markdown")?;
    let entrypoint = skill_dir.join("SKILL.md");
    fs::write(&entrypoint, body).map_err(|source| {
        RepositorySourceError::WriteRawSkillEntrypoint {
            path: entrypoint.clone(),
            source,
        }
    })?;
    Ok(entrypoint)
}

fn load_skill_entrypoint_reference(
    reference: &str,
    target: &Path,
) -> Result<PathBuf, RepositorySourceError> {
    if reference.starts_with("https://") || reference.starts_with("http://") {
        return download_raw_skill_entrypoint(reference, target);
    }

    let path = PathBuf::from(reference);
    if path
        .file_name()
        .and_then(|name| name.to_str())
        .map(|name| name == "SKILL.md")
        .unwrap_or(false)
    {
        return Ok(path);
    }

    Err(RepositorySourceError::RawSkillUrlMustPointToEntrypoint(
        reference.to_string(),
    ))
}

fn fetch_text_url(url: &str, accept: &str) -> Result<String, RepositorySourceError> {
    ureq::get(url)
        .set("User-Agent", "SkillsManager/0.1")
        .set("Accept", accept)
        .call()
        .map_err(|error| RepositorySourceError::RawSkillDownloadFailed(error.to_string()))?
        .into_string()
        .map_err(|error| RepositorySourceError::RawSkillDownloadFailed(error.to_string()))
}

fn path_from_forward_slashes(value: &str) -> PathBuf {
    value
        .split('/')
        .filter(|part| !part.is_empty())
        .fold(PathBuf::new(), |path, part| path.join(part))
}

fn component_to_string(component: Component<'_>) -> Option<String> {
    match component {
        Component::Normal(value) => Some(value.to_string_lossy().into_owned()),
        _ => None,
    }
}

struct TemporaryCheckout {
    path: PathBuf,
}

impl TemporaryCheckout {
    fn new() -> Result<Self, RepositorySourceError> {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path = std::env::temp_dir().join(format!("skills-manager-checkout-{unique}"));
        fs::create_dir_all(&path).map_err(|source| {
            RepositorySourceError::CreateTemporaryCheckout {
                path: path.clone(),
                source,
            }
        })?;
        Ok(Self { path })
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TemporaryCheckout {
    fn drop(&mut self) {
        if self.path.exists() {
            let _ = fs::remove_dir_all(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::db::open_in_memory_database;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn parses_github_repository_sources() {
        let url = super::parse_repository_source("https://github.com/vercel-labs/skills")
            .expect("github url should parse");
        assert_eq!(url.source_type, "github");
        assert_eq!(url.source_ref, "vercel-labs/skills");
        assert_eq!(url.clone_url, "https://github.com/vercel-labs/skills.git");
        assert_eq!(url.ref_name, None);
        assert_eq!(url.subpath, None);

        let shorthand =
            super::parse_repository_source("vercel-labs/skills").expect("shorthand should parse");
        assert_eq!(shorthand.source_ref, "vercel-labs/skills");
        assert_eq!(
            shorthand.clone_url,
            "https://github.com/vercel-labs/skills.git"
        );

        let tree = super::parse_repository_source(
            "https://github.com/vercel-labs/skills/tree/main/skills/find-skills",
        )
        .expect("tree url should parse");
        assert_eq!(tree.source_ref, "vercel-labs/skills");
        assert_eq!(tree.ref_name, Some("main".to_string()));
        assert_eq!(tree.subpath, Some("skills/find-skills".to_string()));
    }

    #[test]
    fn parses_gitlab_repository_sources() {
        let url = super::parse_repository_source("https://gitlab.com/agent-tools/skills")
            .expect("gitlab url should parse");
        assert_eq!(url.source_type, "gitlab");
        assert_eq!(url.source_ref, "agent-tools/skills");
        assert_eq!(url.clone_url, "https://gitlab.com/agent-tools/skills.git");
        assert_eq!(url.ref_name, None);
        assert_eq!(url.subpath, None);

        let tree = super::parse_repository_source(
            "https://gitlab.com/agent-tools/skills/-/tree/main/skills/review",
        )
        .expect("gitlab tree url should parse");
        assert_eq!(tree.source_type, "gitlab");
        assert_eq!(tree.source_ref, "agent-tools/skills");
        assert_eq!(tree.ref_name, Some("main".to_string()));
        assert_eq!(tree.subpath, Some("skills/review".to_string()));
    }

    #[test]
    fn installs_raw_skill_entrypoint_as_managed_snapshot() {
        let connection = open_in_memory_database().expect("database should open");
        let workspace = TestWorkspace::new("raw-skill-install");
        let raw_entrypoint = workspace.root.join("raw").join("review").join("SKILL.md");
        fs::create_dir_all(raw_entrypoint.parent().expect("raw parent should exist"))
            .expect("raw parent should be created");
        fs::write(
            &raw_entrypoint,
            "---\nname: code-review\ndescription: Review code changes.\n---\n",
        )
        .expect("raw entrypoint should be written");

        let installed = super::install_raw_skill_entrypoint_from_path(
            &connection,
            workspace.root.join("managed-skills"),
            &raw_entrypoint,
            "https://raw.githubusercontent.com/acme/skills/main/review/SKILL.md",
            "code-review",
        )
        .expect("raw skill should install");

        assert_eq!(installed.len(), 1);
        assert_eq!(installed[0].name, "code-review");
        assert_eq!(installed[0].source_type, "raw_url");
        assert_eq!(
            installed[0].source_ref,
            "https://raw.githubusercontent.com/acme/skills/main/review/SKILL.md"
        );
        assert_eq!(installed[0].skill_path, "SKILL.md");
    }

    #[test]
    fn parses_well_known_skill_manifest_sources() {
        let manifest =
            super::parse_repository_source("https://example.com/.well-known/skills.json")
                .expect("well-known manifest url should parse");

        assert_eq!(manifest.source_type, "well_known");
        assert_eq!(
            manifest.source_ref,
            "https://example.com/.well-known/skills.json"
        );
        assert_eq!(
            manifest.clone_url,
            "https://example.com/.well-known/skills.json"
        );
        assert_eq!(manifest.ref_name, None);
        assert_eq!(manifest.subpath, None);
    }

    #[test]
    fn installs_skill_from_well_known_manifest_payload() {
        let connection = open_in_memory_database().expect("database should open");
        let workspace = TestWorkspace::new("well-known-install");
        let raw_entrypoint = workspace
            .root
            .join("well-known")
            .join("lint")
            .join("SKILL.md");
        fs::create_dir_all(raw_entrypoint.parent().expect("raw parent should exist"))
            .expect("raw parent should be created");
        fs::write(
            &raw_entrypoint,
            "---\nname: lint-rules\ndescription: Keep lint rules consistent.\n---\n",
        )
        .expect("raw entrypoint should be written");

        let manifest_body = format!(
            r#"{{
                "skills": [
                    {{
                        "name": "lint-rules",
                        "description": "Keep lint rules consistent.",
                        "url": "{}"
                    }}
                ]
            }}"#,
            raw_entrypoint.display().to_string().replace('\\', "\\\\")
        );

        let installed = super::install_well_known_skill_from_manifest_body(
            &connection,
            workspace.root.join("managed-skills"),
            "https://example.com/.well-known/skills.json",
            &manifest_body,
            "lint-rules",
        )
        .expect("well-known skill should install");

        assert_eq!(installed.len(), 1);
        assert_eq!(installed[0].name, "lint-rules");
        assert_eq!(installed[0].source_type, "well_known");
        assert_eq!(
            installed[0].source_ref,
            "https://example.com/.well-known/skills.json"
        );
        assert_eq!(
            installed[0].skill_path,
            raw_entrypoint.display().to_string().replace('\\', "/")
        );
    }

    #[test]
    fn rejects_raw_urls_that_do_not_point_to_skill_entrypoints() {
        let error = super::parse_repository_source(
            "https://raw.githubusercontent.com/acme/skills/main/review/README.md",
        )
        .expect_err("raw non-skill file should be rejected");

        assert!(error
            .to_string()
            .contains("raw skill URL must point to SKILL.md"));
    }

    #[test]
    fn discovers_skills_from_priority_locations_and_matches_requested_name() {
        let workspace = TestWorkspace::new("repository-discovery");
        workspace.create_skill(
            "skills/find-skills",
            "---\nname: find-skills\ndescription: Find and install agent skills.\n---\n",
        );
        workspace.create_skill(
            "nested/deep/frontmatter-name",
            "---\nname: Convex Best Practices\ndescription: Framework conventions.\n---\n",
        );

        let skills = super::discover_repository_skills(&workspace.root, None)
            .expect("skills should discover");
        assert_eq!(skills.len(), 1);
        assert_eq!(skills[0].name, "find-skills");
        assert_eq!(skills[0].skill_path, "skills/find-skills/SKILL.md");

        let selected = super::select_repository_skill(&skills, "find-skills")
            .expect("folder/frontmatter name should match");
        assert_eq!(selected.name, "find-skills");

        let fallback = super::discover_repository_skills(&workspace.root.join("nested"), None)
            .expect("recursive fallback should discover");
        let selected_by_frontmatter =
            super::select_repository_skill(&fallback, "Convex Best Practices")
                .expect("frontmatter display name should match");
        assert_eq!(
            selected_by_frontmatter.skill_path,
            "deep/frontmatter-name/SKILL.md"
        );
    }

    #[test]
    fn installs_repository_skill_as_managed_snapshot() {
        let connection = open_in_memory_database().expect("database should open");
        let workspace = TestWorkspace::new("repository-install");
        workspace.create_skill(
            "skills/find-skills",
            "---\nname: find-skills\ndescription: Find and install agent skills.\n---\n",
        );
        let managed_root = workspace.root.join("managed-skills");

        let installed = super::install_repository_skill_from_checkout(
            &connection,
            managed_root.clone(),
            &workspace.root,
            "github",
            "vercel-labs/skills",
            None,
            "find-skills",
            &None,
        )
        .expect("repository skill should install");

        assert_eq!(installed.len(), 1);
        assert_eq!(installed[0].name, "find-skills");
        assert_eq!(installed[0].source_type, "github");
        assert_eq!(installed[0].source_ref, "vercel-labs/skills");
        assert_eq!(installed[0].skill_path, "skills/find-skills/SKILL.md");
        assert!(managed_root
            .join(&installed[0].managed_dir_name)
            .join("SKILL.md")
            .is_file());

        let row = connection
            .query_row(
                "SELECT description, source_type, source_ref, skill_path
                FROM skills
                WHERE id = ?1",
                [&installed[0].id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                        row.get::<_, String>(3)?,
                    ))
                },
            )
            .expect("installed skill row should exist");

        assert_eq!(
            row,
            (
                "Find and install agent skills.".to_string(),
                "github".to_string(),
                "vercel-labs/skills".to_string(),
                "skills/find-skills/SKILL.md".to_string(),
            )
        );
    }

    #[test]
    fn checks_repository_skill_before_install() {
        let workspace = TestWorkspace::new("repository-check");
        workspace.create_skill(
            "skills/find-skills",
            "---\nname: find-skills\ndescription: Find and install agent skills.\n---\n",
        );

        let outcome = super::check_repository_skill_from_checkout(
            &workspace.root,
            "vercel-labs/skills",
            None,
            "find-skills",
        )
        .expect("skill should be detected");

        let result = match outcome {
            super::RepositoryCheckOutcome::Single(r) => r,
            _ => panic!("expected single check result"),
        };
        assert_eq!(result.source_ref, "vercel-labs/skills");
        assert_eq!(result.skill_name, "find-skills");
        assert_eq!(result.skill_path, "skills/find-skills/SKILL.md");
        assert_eq!(result.description, "Find and install agent skills.");
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

        fn create_skill(&self, relative_dir: &str, skill_md: &str) {
            let skill_dir = relative_dir
                .split('/')
                .fold(self.root.clone(), |path, part| path.join(part));
            fs::create_dir_all(&skill_dir).expect("skill dir should be created");
            fs::write(skill_dir.join("SKILL.md"), skill_md).expect("skill file should be written");
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            remove_dir_all_if_exists(&self.root);
        }
    }

    fn remove_dir_all_if_exists(path: &Path) {
        if path.exists() {
            fs::remove_dir_all(path).expect("workspace should be removed");
        }
    }
}

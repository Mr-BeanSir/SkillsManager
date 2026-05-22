use std::collections::HashSet;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};

pub use crate::domain::links::SkillLinkStatus;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillLinkCheck {
    pub status: SkillLinkStatus,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillLinkDelete {
    pub removed: bool,
    pub status: SkillLinkStatus,
    pub error_message: Option<String>,
}

pub fn check_skill_link(link_path: &Path, managed_target_path: &Path) -> SkillLinkCheck {
    match fs::symlink_metadata(link_path) {
        Ok(metadata) => check_existing_path(link_path, managed_target_path, &metadata),
        Err(error) if error.kind() == io::ErrorKind::NotFound => SkillLinkCheck {
            status: SkillLinkStatus::Missing,
            error_message: None,
        },
        Err(error) => SkillLinkCheck {
            status: SkillLinkStatus::Failed,
            error_message: Some(format!(
                "failed to inspect Skill Link {}: {}",
                link_path.display(),
                error
            )),
        },
    }
}

pub fn create_skill_link(link_path: &Path, managed_target_path: &Path) -> SkillLinkCheck {
    let current = check_skill_link(link_path, managed_target_path);
    if current.status != SkillLinkStatus::Missing {
        return current;
    }

    if let Some(parent) = link_path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            return create_failed(link_path, error);
        }
    }

    if let Err(error) = create_dir_symlink(managed_target_path, link_path) {
        return create_failed(link_path, error);
    }

    check_skill_link(link_path, managed_target_path)
}

pub fn delete_managed_skill_link(link_path: &Path, managed_skills_root: &Path) -> SkillLinkDelete {
    let metadata = match fs::symlink_metadata(link_path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return SkillLinkDelete {
                removed: false,
                status: SkillLinkStatus::Missing,
                error_message: None,
            };
        }
        Err(error) => {
            return SkillLinkDelete {
                removed: false,
                status: SkillLinkStatus::Failed,
                error_message: Some(format!(
                    "failed to inspect Skill Link {} before deletion: {}",
                    link_path.display(),
                    error
                )),
            };
        }
    };

    if !metadata.file_type().is_symlink() {
        return SkillLinkDelete {
            removed: false,
            status: SkillLinkStatus::Conflict,
            error_message: None,
        };
    }

    let target = match fs::read_link(link_path) {
        Ok(target) => target,
        Err(error) => {
            return SkillLinkDelete {
                removed: false,
                status: SkillLinkStatus::Failed,
                error_message: Some(format!(
                    "failed to read Skill Link target {} before deletion: {}",
                    link_path.display(),
                    error
                )),
            };
        }
    };
    let resolved_target = resolve_link_target(link_path, &target);

    if !path_is_inside(&resolved_target, managed_skills_root) {
        return SkillLinkDelete {
            removed: false,
            status: SkillLinkStatus::Conflict,
            error_message: None,
        };
    }

    match fs::remove_file(link_path) {
        Ok(()) => SkillLinkDelete {
            removed: true,
            status: SkillLinkStatus::Missing,
            error_message: None,
        },
        Err(error) => SkillLinkDelete {
            removed: false,
            status: SkillLinkStatus::Failed,
            error_message: Some(format!(
                "failed to delete managed Skill Link {}: {}",
                link_path.display(),
                error
            )),
        },
    }
}

pub fn ensure_project_target_directory(_target_dir: &Path) -> io::Result<bool> {
    let Some(parent) = _target_dir.parent() else {
        return Ok(false);
    };

    if !parent.exists() {
        return Ok(false);
    }

    if _target_dir.exists() {
        return Ok(false);
    }

    fs::create_dir(_target_dir)?;
    Ok(true)
}

pub fn delete_managed_skill_links_under_root(
    root: &Path,
    managed_skills_root: &Path,
    preserved_link_paths: &HashSet<String>,
) {
    visit_directories(root, &mut |directory| {
        let Ok(entries) = fs::read_dir(directory) else {
            return;
        };

        for entry in entries.flatten() {
            let path = entry.path();
            let preserved = path.to_string_lossy().into_owned();
            if preserved_link_paths.contains(&preserved) {
                continue;
            }

            let _ = delete_managed_skill_link(&path, managed_skills_root);
        }
    });
}

fn check_existing_path(
    link_path: &Path,
    managed_target_path: &Path,
    metadata: &fs::Metadata,
) -> SkillLinkCheck {
    if !metadata.file_type().is_symlink() {
        return SkillLinkCheck {
            status: SkillLinkStatus::Conflict,
            error_message: None,
        };
    }

    match fs::read_link(link_path) {
        Ok(target) => {
            let resolved_target = resolve_link_target(link_path, &target);
            if paths_equivalent(&resolved_target, managed_target_path) {
                SkillLinkCheck {
                    status: SkillLinkStatus::Linked,
                    error_message: None,
                }
            } else {
                SkillLinkCheck {
                    status: SkillLinkStatus::Conflict,
                    error_message: None,
                }
            }
        }
        Err(error) => SkillLinkCheck {
            status: SkillLinkStatus::Failed,
            error_message: Some(format!(
                "failed to read Skill Link target {}: {}",
                link_path.display(),
                error
            )),
        },
    }
}

#[cfg(windows)]
fn create_dir_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::windows::fs::symlink_dir(target, link)
}

#[cfg(unix)]
fn create_dir_symlink(target: &Path, link: &Path) -> io::Result<()> {
    std::os::unix::fs::symlink(target, link)
}

fn create_failed(link_path: &Path, source: io::Error) -> SkillLinkCheck {
    SkillLinkCheck {
        status: SkillLinkStatus::Failed,
        error_message: Some(format!(
            "failed to create filesystem symlink {}: {}{}",
            link_path.display(),
            source,
            symlink_remediation(&source)
        )),
    }
}

#[cfg(windows)]
fn symlink_remediation(source: &io::Error) -> &'static str {
    if source.raw_os_error() == Some(1314) {
        " Enable Windows Developer Mode or run Skills Manager as administrator; Skills Manager will not fall back to copies or .lnk shortcuts."
    } else {
        " Skills Manager will not fall back to copies or .lnk shortcuts."
    }
}

#[cfg(not(windows))]
fn symlink_remediation(_source: &io::Error) -> &'static str {
    " Skills Manager will not fall back to copied folders."
}

fn resolve_link_target(link_path: &Path, target: &Path) -> PathBuf {
    if target.is_absolute() {
        normalize_path(target)
    } else {
        normalize_path(
            &link_path
                .parent()
                .map(|parent| parent.join(target))
                .unwrap_or_else(|| target.to_path_buf()),
        )
    }
}

fn paths_equivalent(left: &Path, right: &Path) -> bool {
    normalize_path(left) == normalize_path(right)
}

fn path_is_inside(path: &Path, root: &Path) -> bool {
    let normalized_path = normalize_path(path);
    let normalized_root = normalize_path(root);

    normalized_path.starts_with(normalized_root)
}

fn normalize_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
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

#[cfg(test)]
mod tests {
    use super::{
        check_skill_link, create_skill_link, delete_managed_skill_link,
        delete_managed_skill_links_under_root, ensure_project_target_directory, SkillLinkStatus,
    };
    use std::collections::HashSet;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn maps_missing_link_path_to_missing_status() {
        let workspace = TestWorkspace::new("missing-link");
        let target = workspace.create_managed_skill("sample-skill");
        let link_path = workspace.root.join("targets").join("sample-skill");

        let check = check_skill_link(&link_path, &target);

        assert_eq!(check.status, SkillLinkStatus::Missing);
        assert_eq!(check.error_message, None);
    }

    #[test]
    fn maps_existing_matching_symlink_to_linked_status() {
        let workspace = TestWorkspace::new("linked-link");
        let target = workspace.create_managed_skill("sample-skill");
        let link_path = workspace.root.join("target-skills").join("sample-skill");

        if !assert_symlink_created_or_permission_error(create_skill_link(&link_path, &target)) {
            return;
        }

        let check = check_skill_link(&link_path, &target);

        assert_eq!(check.status, SkillLinkStatus::Linked);
        assert_eq!(check.error_message, None);
    }

    #[test]
    fn maps_non_symlink_path_to_conflict_status() {
        let workspace = TestWorkspace::new("conflict-file");
        let target = workspace.create_managed_skill("sample-skill");
        let link_path = workspace.root.join("target-skills").join("sample-skill");
        fs::create_dir_all(link_path.parent().expect("link should have parent"))
            .expect("target parent should be created");
        fs::write(&link_path, "not a symlink").expect("conflicting file should be written");

        let check = check_skill_link(&link_path, &target);

        assert_eq!(check.status, SkillLinkStatus::Conflict);
        assert_eq!(check.error_message, None);
    }

    #[test]
    fn maps_symlink_pointing_elsewhere_to_conflict_status() {
        let workspace = TestWorkspace::new("conflict-symlink");
        let expected_target = workspace.create_managed_skill("expected-skill");
        let other_target = workspace.create_managed_skill("other-skill");
        let link_path = workspace.root.join("target-skills").join("expected-skill");

        if !assert_symlink_created_or_permission_error(create_skill_link(&link_path, &other_target))
        {
            return;
        }

        let check = check_skill_link(&link_path, &expected_target);

        assert_eq!(check.status, SkillLinkStatus::Conflict);
        assert_eq!(check.error_message, None);
    }

    #[test]
    fn create_reports_conflict_without_replacing_existing_paths() {
        let workspace = TestWorkspace::new("create-conflict");
        let target = workspace.create_managed_skill("sample-skill");
        let link_path = workspace.root.join("target-skills").join("sample-skill");
        fs::create_dir_all(link_path.parent().expect("link should have parent"))
            .expect("target parent should be created");
        fs::write(&link_path, "keep me").expect("conflicting file should be written");

        let created = create_skill_link(&link_path, &target);

        assert_eq!(created.status, SkillLinkStatus::Conflict);
        assert_eq!(
            fs::read_to_string(&link_path).expect("file should remain"),
            "keep me"
        );
    }

    #[test]
    fn create_maps_filesystem_errors_to_failed_status_without_fallback() {
        let workspace = TestWorkspace::new("create-failed");
        let target = workspace.create_managed_skill("sample-skill");
        let blocked_parent = workspace.root.join("blocked-parent");
        fs::write(&blocked_parent, "not a directory").expect("blocking file should be written");
        let link_path = blocked_parent.join("sample-skill");

        let created = create_skill_link(&link_path, &target);

        assert_eq!(created.status, SkillLinkStatus::Failed);
        let error_message = created
            .error_message
            .expect("failed create should include an error message");
        assert!(error_message.contains("failed to create filesystem symlink"));
        assert!(error_message.contains("will not fall back"));
    }

    #[test]
    fn delete_removes_symlink_only_when_target_points_inside_managed_skills_root() {
        let workspace = TestWorkspace::new("delete-managed");
        let managed_root = workspace.root.join("managed-skills");
        let target = workspace.create_managed_skill("sample-skill");
        let link_path = workspace.root.join("target-skills").join("sample-skill");
        if !assert_symlink_created_or_permission_error(create_skill_link(&link_path, &target)) {
            return;
        }

        let deleted = delete_managed_skill_link(&link_path, &managed_root);

        assert!(deleted.removed);
        assert_eq!(deleted.status, SkillLinkStatus::Missing);
        assert!(!symlink_exists(&link_path));
    }

    #[test]
    fn delete_preserves_symlink_that_points_outside_managed_skills_root() {
        let workspace = TestWorkspace::new("delete-outside");
        let managed_root = workspace.root.join("managed-skills");
        let outside_target = workspace.root.join("outside").join("skill");
        fs::create_dir_all(&outside_target).expect("outside target should be created");
        let link_path = workspace.root.join("target-skills").join("outside-skill");
        if !assert_symlink_created_or_permission_error(create_skill_link(
            &link_path,
            &outside_target,
        )) {
            return;
        }

        let deleted = delete_managed_skill_link(&link_path, &managed_root);

        assert!(!deleted.removed);
        assert_eq!(deleted.status, SkillLinkStatus::Conflict);
        assert!(symlink_exists(&link_path));
    }

    #[test]
    fn delete_preserves_regular_files() {
        let workspace = TestWorkspace::new("delete-file");
        let managed_root = workspace.root.join("managed-skills");
        let link_path = workspace.root.join("target-skills").join("sample-skill");
        fs::create_dir_all(link_path.parent().expect("link should have parent"))
            .expect("target parent should be created");
        fs::write(&link_path, "not a symlink").expect("file should be written");

        let deleted = delete_managed_skill_link(&link_path, &managed_root);

        assert!(!deleted.removed);
        assert_eq!(deleted.status, SkillLinkStatus::Conflict);
        assert_eq!(
            fs::read_to_string(&link_path).expect("file should remain"),
            "not a symlink"
        );
    }

    #[test]
    fn ensure_project_target_directory_creates_only_the_final_directory_when_parent_exists() {
        let workspace = TestWorkspace::new("ensure-project-target");
        let target_dir = workspace
            .root
            .join("project")
            .join(".agents")
            .join("skills");
        fs::create_dir_all(workspace.root.join("project").join(".agents"))
            .expect("parent directory should exist");

        let created = ensure_project_target_directory(&target_dir)
            .expect("target directory preparation should succeed");

        assert!(created);
        assert!(target_dir.is_dir());
    }

    #[test]
    fn ensure_project_target_directory_skips_when_parent_directory_is_missing() {
        let workspace = TestWorkspace::new("skip-project-target");
        let target_dir = workspace
            .root
            .join("project")
            .join(".agents")
            .join("skills");

        let created = ensure_project_target_directory(&target_dir)
            .expect("target directory preparation should succeed");

        assert!(!created);
        assert!(!target_dir.exists());
    }

    #[test]
    fn delete_managed_skill_links_under_root_removes_only_unpreserved_managed_symlinks() {
        let workspace = TestWorkspace::new("cleanup-under-root");
        let managed_root = workspace.root.join("managed-skills");
        let keep_target = workspace.create_managed_skill("keep-skill");
        let stale_target = workspace.create_managed_skill("stale-skill");
        let outside_target = workspace.root.join("outside").join("external-skill");
        fs::create_dir_all(&outside_target).expect("outside target should exist");

        let active_link = workspace
            .root
            .join("project")
            .join(".agents")
            .join("skills")
            .join("keep-skill");
        let stale_link = workspace
            .root
            .join("legacy-home")
            .join(".codex")
            .join("skills")
            .join("stale-skill");
        let outside_link = workspace
            .root
            .join("custom")
            .join("skills")
            .join("external-skill");
        let regular_file = workspace
            .root
            .join("custom")
            .join("skills")
            .join("notes.txt");

        if !assert_symlink_created_or_permission_error(create_skill_link(
            &active_link,
            &keep_target,
        )) {
            return;
        }
        if !assert_symlink_created_or_permission_error(create_skill_link(
            &stale_link,
            &stale_target,
        )) {
            return;
        }
        if !assert_symlink_created_or_permission_error(create_skill_link(
            &outside_link,
            &outside_target,
        )) {
            return;
        }
        fs::write(
            regular_file
                .parent()
                .expect("regular file should have parent")
                .join("notes.txt"),
            "keep me",
        )
        .expect("regular file should be written");

        let preserved = HashSet::from([active_link.to_string_lossy().into_owned()]);

        delete_managed_skill_links_under_root(&workspace.root, &managed_root, &preserved);

        assert!(symlink_exists(&active_link));
        assert!(!symlink_exists(&stale_link));
        assert!(symlink_exists(&outside_link));
        assert_eq!(
            fs::read_to_string(&regular_file).expect("regular file should remain"),
            "keep me"
        );
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
            let root =
                std::env::temp_dir().join(format!("skills-manager-fs-links-{name}-{unique}"));
            fs::create_dir_all(&root).expect("workspace should be created");
            Self { root }
        }

        fn create_managed_skill(&self, name: &str) -> PathBuf {
            let target = self.root.join("managed-skills").join(name);
            fs::create_dir_all(&target).expect("managed skill should be created");
            fs::write(target.join("SKILL.md"), format!("# {name}\n"))
                .expect("skill entrypoint should be written");
            target
        }
    }

    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            remove_dir_all_if_exists(&self.root);
        }
    }

    fn symlink_exists(path: &Path) -> bool {
        fs::symlink_metadata(path).is_ok()
    }

    fn assert_symlink_created_or_permission_error(check: super::SkillLinkCheck) -> bool {
        if check.status == SkillLinkStatus::Linked {
            return true;
        }

        assert_eq!(check.status, SkillLinkStatus::Failed);
        let error_message = check
            .error_message
            .expect("failed symlink creation should include guidance");
        assert!(error_message.contains("failed to create filesystem symlink"));

        #[cfg(windows)]
        {
            assert!(error_message.contains("Developer Mode"));
            assert!(error_message.contains("administrator"));
            assert!(error_message.contains(".lnk"));
        }

        #[cfg(not(windows))]
        {
            assert!(error_message.contains("will not fall back"));
        }

        false
    }

    fn remove_dir_all_if_exists(path: &Path) {
        if path.exists() {
            fs::remove_dir_all(path).expect("test workspace should be removed");
        }
    }
}

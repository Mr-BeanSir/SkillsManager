pub mod ids;
pub mod links;
pub mod project;
pub mod skill;
pub mod targets;

#[cfg(test)]
mod tests {
    use super::ids::{managed_skill_directory_name, skill_id, source_identity};
    use super::links::{SkillLinkState, SkillLinkStatus};
    use super::project::{Project, ProjectCliTarget, ProjectGroup, ProjectSkill};
    use super::skill::ManagedSkill;
    use super::targets::{CliTargetDefinition, LinkTargetType};
    use std::path::PathBuf;

    #[test]
    fn derives_skill_identity_from_source_type_reference_and_path() {
        assert_eq!(
            source_identity(
                "github",
                "mattpocock/skills",
                "skills/engineering/grill-with-docs/SKILL.md",
            ),
            "github|mattpocock/skills|skills/engineering/grill-with-docs/SKILL.md",
        );
    }

    #[test]
    fn keeps_same_skill_names_distinct_by_source_identity() {
        let first = managed_skill_directory_name(
            "shared-name",
            "github",
            "owner-one/skills",
            "skills/shared-name/SKILL.md",
        );
        let second = managed_skill_directory_name(
            "shared-name",
            "github",
            "owner-two/skills",
            "skills/shared-name/SKILL.md",
        );

        assert!(first.starts_with("shared-name-"));
        assert!(second.starts_with("shared-name-"));
        assert_ne!(first, second);
        assert_eq!(
            skill_id("github", "owner-one/skills", "skills/shared-name/SKILL.md"),
            first.trim_start_matches("shared-name-"),
        );
    }

    #[test]
    fn exposes_database_strings_for_project_link_statuses_and_targets() {
        assert_eq!(SkillLinkStatus::Linked.as_str(), "linked");
        assert_eq!(SkillLinkStatus::Missing.as_str(), "missing");
        assert_eq!(SkillLinkStatus::Conflict.as_str(), "conflict");
        assert_eq!(SkillLinkStatus::Failed.as_str(), "failed");

        assert_eq!(
            LinkTargetType::ProjectCliTarget.as_str(),
            "project_cli_target"
        );
    }

    #[test]
    fn models_project_only_domain_values() {
        let skill = ManagedSkill {
            id: "499b7424".to_string(),
            name: "grill-with-docs".to_string(),
            source_type: "github".to_string(),
            source_ref: "owner/repo".to_string(),
            skill_path: "skills/grill-with-docs".to_string(),
            managed_dir_name: "grill-with-docs-499b7424".to_string(),
        };
        let project = Project {
            id: "project-1".to_string(),
            name: "Workspace".to_string(),
            path: "D:/Work/repo".to_string(),
        };
        let cli_target = CliTargetDefinition {
            id: "agents-skills".to_string(),
            display_name: "Agents Skills".to_string(),
            relative_path: ".agents/skills".to_string(),
            is_common: true,
        };
        let project_skill = ProjectSkill {
            id: "project-skill-1".to_string(),
            project_id: project.id.clone(),
            skill_id: skill.id.clone(),
            enabled: true,
        };
        let project_group = ProjectGroup {
            id: "project-group-1".to_string(),
            project_id: project.id.clone(),
            group_id: "frontend".to_string(),
            enabled: true,
        };
        let project_cli_target = ProjectCliTarget {
            id: "project-cli-target-1".to_string(),
            project_id: project.id.clone(),
            cli_target_id: cli_target.id.clone(),
        };
        let link_state = SkillLinkState {
            skill_id: skill.id.clone(),
            target_type: LinkTargetType::ProjectCliTarget,
            target_id: project_cli_target.id.clone(),
            link_path: PathBuf::from("D:/Work/repo/.agents/skills/grill-with-docs"),
            managed_target_path: PathBuf::from("D:/App/managed-skills/grill-with-docs-499b7424"),
            status: SkillLinkStatus::Linked,
            error_message: None,
        };

        assert_eq!(project.path, "D:/Work/repo");
        assert_eq!(cli_target.relative_path, ".agents/skills");
        assert!(project_skill.enabled);
        assert_eq!(project_group.group_id, "frontend");
        assert_eq!(project_cli_target.cli_target_id, "agents-skills");
        assert_eq!(link_state.target_type.as_str(), "project_cli_target");
        assert_eq!(link_state.status.as_str(), "linked");
    }
}

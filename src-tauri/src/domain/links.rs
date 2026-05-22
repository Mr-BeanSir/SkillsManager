use std::path::PathBuf;

use super::targets::LinkTargetType;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SkillLinkStatus {
    Linked,
    Missing,
    Conflict,
    Failed,
}

impl SkillLinkStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Linked => "linked",
            Self::Missing => "missing",
            Self::Conflict => "conflict",
            Self::Failed => "failed",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SkillLinkState {
    pub skill_id: String,
    pub target_type: LinkTargetType,
    pub target_id: String,
    pub link_path: PathBuf,
    pub managed_target_path: PathBuf,
    pub status: SkillLinkStatus,
    pub error_message: Option<String>,
}

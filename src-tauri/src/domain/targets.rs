#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LinkTargetType {
    ProjectCliTarget,
}

impl LinkTargetType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::ProjectCliTarget => "project_cli_target",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CliTargetDefinition {
    pub id: String,
    pub display_name: String,
    pub relative_path: String,
    pub is_common: bool,
}

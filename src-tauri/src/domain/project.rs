#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub path: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectSkill {
    pub id: String,
    pub project_id: String,
    pub skill_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectGroup {
    pub id: String,
    pub project_id: String,
    pub group_id: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectCliTarget {
    pub id: String,
    pub project_id: String,
    pub cli_target_id: String,
}

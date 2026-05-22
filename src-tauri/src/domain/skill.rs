#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ManagedSkill {
    pub id: String,
    pub name: String,
    pub source_type: String,
    pub source_ref: String,
    pub skill_path: String,
    pub managed_dir_name: String,
}

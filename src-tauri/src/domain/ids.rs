use std::hash::{Hash, Hasher};

pub fn source_identity(source_type: &str, source_ref: &str, skill_path: &str) -> String {
    format!("{source_type}|{source_ref}|{skill_path}")
}

pub fn skill_id(source_type: &str, source_ref: &str, skill_path: &str) -> String {
    short_stable_hash(&source_identity(source_type, source_ref, skill_path))
}

pub fn managed_skill_directory_name(
    name: &str,
    source_type: &str,
    source_ref: &str,
    skill_path: &str,
) -> String {
    format!(
        "{}-{}",
        safe_skill_name(name),
        skill_id(source_type, source_ref, skill_path)
    )
}

pub fn safe_skill_name(name: &str) -> String {
    let mut output = String::new();
    let mut previous_dash = false;

    for character in name.trim().to_lowercase().chars() {
        let character = if character.is_ascii_alphanumeric() || character == '.' || character == '_'
        {
            character
        } else {
            '-'
        };

        if character == '-' {
            if !previous_dash {
                output.push(character);
            }
            previous_dash = true;
        } else {
            output.push(character);
            previous_dash = false;
        }
    }

    let safe = output
        .trim_matches(|character| character == '.' || character == '_' || character == '-')
        .to_string();

    if safe.is_empty() {
        "skill".to_string()
    } else {
        safe
    }
}

pub fn stable_prefixed_id(prefix: &str, value: &str) -> String {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    value.hash(&mut hasher);

    format!("{prefix}-{:016x}", hasher.finish())
}

pub fn short_stable_hash(value: &str) -> String {
    let mut hash: u32 = 0x811c9dc5;

    for byte in value.as_bytes() {
        hash ^= u32::from(*byte);
        hash = hash.wrapping_mul(0x01000193);
    }

    format!("{hash:08x}")
}

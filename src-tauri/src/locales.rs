const MANIFEST_JSON: &[u8] = include_bytes!("../../public/locales/manifest.json");
const EN_JSON: &[u8] = include_bytes!("../../public/locales/en.json");
const ZH_JSON: &[u8] = include_bytes!("../../public/locales/zh.json");
const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

const LOCALE_FILES: &[(&str, &[u8])] = &[
    ("manifest.json", MANIFEST_JSON),
    ("en.json", EN_JSON),
    ("zh.json", ZH_JSON),
];

pub fn ensure_locales() -> Result<(), String> {
    let locales_dir = crate::app_paths::locales_dir()
        .map_err(|e| format!("Failed to resolve locales directory: {e}"))?;

    let version_file = locales_dir.join(".version");
    let needs_extract = match std::fs::read_to_string(&version_file) {
        Ok(v) => v.trim() != APP_VERSION,
        Err(_) => true,
    };

    if !needs_extract {
        return Ok(());
    }

    for (filename, content) in LOCALE_FILES {
        let file_path = locales_dir.join(filename);
        std::fs::write(&file_path, content)
            .map_err(|e| format!("Failed to write {filename}: {e}"))?;
    }

    std::fs::write(&version_file, APP_VERSION)
        .map_err(|e| format!("Failed to write version stamp: {e}"))?;

    Ok(())
}

#[tauri::command]
pub fn read_locale_file(filename: String) -> Result<String, String> {
    let locales_dir = crate::app_paths::locales_dir()
        .map_err(|e| format!("Failed to resolve locales directory: {e}"))?;

    let file_path = locales_dir.join(&filename);

    if !file_path.exists() {
        return Err(format!("Locale file not found: {filename}"));
    }

    std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read {filename}: {e}"))
}

const MANIFEST_JSON: &[u8] = include_bytes!("../../public/locales/manifest.json");
const EN_JSON: &[u8] = include_bytes!("../../public/locales/en.json");
const ZH_JSON: &[u8] = include_bytes!("../../public/locales/zh.json");

const LOCALE_FILES: &[(&str, &[u8])] = &[
    ("manifest.json", MANIFEST_JSON),
    ("en.json", EN_JSON),
    ("zh.json", ZH_JSON),
];

pub fn ensure_locales() -> Result<(), String> {
    let locales_dir = crate::app_paths::locales_dir()
        .map_err(|e| format!("Failed to resolve locales directory: {e}"))?;

    std::fs::create_dir_all(&locales_dir)
        .map_err(|e| format!("Failed to create locales directory: {e}"))?;

    for (filename, content) in LOCALE_FILES {
        let file_path = locales_dir.join(filename);
        std::fs::write(&file_path, content)
            .map_err(|e| format!("Failed to write {filename}: {e}"))?;
    }

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

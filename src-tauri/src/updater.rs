use serde::{Deserialize, Serialize};


const GITHUB_REPO: &str = "Mr-BeanSir/SkillsManager";

#[derive(Debug, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub title: String,
    pub body: String,
    pub download_url: String,
    pub asset_name: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: u64,
    pub percent: u8,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    body: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn parse_version(tag: &str) -> &str {
    tag.strip_prefix('v').unwrap_or(tag)
}

fn is_newer(current: &str, remote: &str) -> bool {
    let parse_part = |s: &str| -> Vec<u32> {
        s.split('.').filter_map(|p| p.parse().ok()).collect()
    };
    let current_parts = parse_part(current);
    let remote_parts = parse_part(remote);

    for i in 0..remote_parts.len().max(current_parts.len()) {
        let c = current_parts.get(i).copied().unwrap_or(0);
        let r = remote_parts.get(i).copied().unwrap_or(0);
        if r > c {
            return true;
        }
        if r < c {
            return false;
        }
    }
    false
}

fn find_installer_asset(release: &GitHubRelease) -> Option<&GitHubAsset> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;

    let suffix = match (os, arch) {
        ("windows", _) => ".exe",
        ("macos", "aarch64") => "_aarch64.dmg",
        ("macos", _) => "_x64.dmg",
        ("linux", "aarch64") => "_aarch64.AppImage",
        ("linux", _) => "_amd64.AppImage",
        _ => return None,
    };

    release
        .assets
        .iter()
        .find(|asset| asset.name.ends_with(suffix) && !asset.name.ends_with(".msi"))
}

#[tauri::command]
pub fn get_app_version() -> String {
    current_version()
}

#[tauri::command]
pub async fn check_app_update() -> Result<Option<UpdateInfo>, String> {
    let url = format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest");

    let mut headers = std::collections::HashMap::new();
    headers.insert("Accept", "application/vnd.github+json");
    let body = crate::http::fetch_text(&url, &headers)
        .map_err(|e| format!("Failed to fetch release info: {e}"))?;

    let release: GitHubRelease =
        serde_json::from_str(&body).map_err(|e| format!("Failed to parse release: {e}"))?;

    let remote_version = parse_version(&release.tag_name);
    let current = current_version();

    if !is_newer(&current, remote_version) {
        return Ok(None);
    }

    let asset = find_installer_asset(&release)
        .ok_or("No compatible installer found for your platform")?;

    let download_url = asset.browser_download_url.clone();
    let asset_name = asset.name.clone();

    Ok(Some(UpdateInfo {
        version: remote_version.to_string(),
        title: release.name.unwrap_or(release.tag_name.clone()),
        body: release.body.unwrap_or_default(),
        download_url,
        asset_name,
    }))
}

#[tauri::command]
pub async fn download_app_update(
    url: String,
    on_progress: tauri::ipc::Channel<DownloadProgress>,
) -> Result<String, String> {
    let temp_dir = std::env::temp_dir();
    let filename = url
        .rsplit('/')
        .next()
        .unwrap_or("update-installer")
        .to_string();
    let file_path = temp_dir.join(&filename);

    let mut file =
        std::fs::File::create(&file_path).map_err(|e| format!("Failed to create file: {e}"))?;

    let progress_channel = &on_progress;
    crate::http::download_to_writer(&url, &mut file, Some(&|downloaded, total_size| {
        let percent = if total_size > 0 {
            ((downloaded as f64 / total_size as f64) * 100.0) as u8
        } else {
            0
        };
        let _ = progress_channel.send(DownloadProgress {
            downloaded,
            total: total_size,
            percent,
        });
    }))
    .map_err(|e| format!("Download failed: {e}"))?;

    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn install_update_and_restart(installer_path: String) -> Result<(), String> {
    let path = std::path::Path::new(&installer_path);

    if !path.exists() {
        return Err("Installer file not found".to_string());
    }

    let os = std::env::consts::OS;

    match os {
        "windows" => {
            let needs_unzip = installer_path.ends_with(".zip");
            let exe_path = if needs_unzip {
                let file = std::fs::File::open(path)
                    .map_err(|e| format!("Failed to open zip: {e}"))?;
                let mut archive = zip::ZipArchive::new(file)
                    .map_err(|e| format!("Failed to read zip: {e}"))?;

                let temp_dir = std::env::temp_dir().join("skills-manager-update");
                let _ = std::fs::remove_dir_all(&temp_dir);
                std::fs::create_dir_all(&temp_dir)
                    .map_err(|e| format!("Failed to create temp dir: {e}"))?;

                let mut exe_file = None;
                for i in 0..archive.len() {
                    let mut file = archive
                        .by_index(i)
                        .map_err(|e| format!("Failed to read zip entry: {e}"))?;
                    let outpath = temp_dir.join(file.name());

                    if file.name().ends_with(".exe") {
                        let mut outfile = std::fs::File::create(&outpath)
                            .map_err(|e| format!("Failed to create exe: {e}"))?;
                        std::io::copy(&mut file, &mut outfile)
                            .map_err(|e| format!("Failed to extract exe: {e}"))?;
                        exe_file = Some(outpath);
                    }
                }

                exe_file.ok_or("No .exe found in zip archive")?
            } else {
                path.to_path_buf()
            };

            // 运行NSIS安装程序（显示安装界面）
            std::process::Command::new(&exe_path)
                .spawn()
                .map_err(|e| format!("Failed to launch installer: {e}"))?;

            std::process::exit(0);
        }
        "macos" => {
            // Mount DMG
            let mount_output = std::process::Command::new("hdiutil")
                .args(["attach", &installer_path, "-nobrowse"])
                .output()
                .map_err(|e| format!("Failed to mount DMG: {e}"))?;

            let mount_stdout = String::from_utf8_lossy(&mount_output.stdout);
            let volume_path = mount_stdout
                .lines()
                .find_map(|line| {
                    let trimmed = line.trim();
                    if trimmed.starts_with("/Volumes/") {
                        trimmed.split('\t').last().map(|s| s.trim().to_string())
                    } else {
                        None
                    }
                })
                .ok_or("Could not find mount point")?;

            // Find .app bundle in volume
            let entries = std::fs::read_dir(&volume_path)
                .map_err(|e| format!("Failed to read volume: {e}"))?;

            let app_entry = entries
                .filter_map(|e| e.ok())
                .find(|e| {
                    e.path()
                        .extension()
                        .map_or(false, |ext| ext == "app")
                })
                .ok_or("No .app found in DMG")?;

            let app_name = app_entry.file_name();
            let dest = std::path::PathBuf::from("/Applications").join(&app_name);

            // Remove existing installation
            if dest.exists() {
                let _ = std::fs::remove_dir_all(&dest);
            }

            // Copy .app to /Applications
            let status = std::process::Command::new("cp")
                .args(["-R", &app_entry.path().to_string_lossy(), "/Applications/"])
                .status()
                .map_err(|e| format!("Failed to copy app: {e}"))?;

            // Unmount DMG
            let _ = std::process::Command::new("hdiutil")
                .args(["detach", &volume_path])
                .status();

            if !status.success() {
                return Err("Failed to install application".to_string());
            }

            // Open the installed app
            std::process::Command::new("open")
                .arg(&dest)
                .spawn()
                .map_err(|e| format!("Failed to open app: {e}"))?;

            std::process::exit(0);
        }
        "linux" => {
            std::process::Command::new("chmod")
                .arg("+x")
                .arg(path)
                .spawn()
                .map_err(|e| format!("Failed to set executable: {e}"))?;

            std::process::Command::new(path)
                .spawn()
                .map_err(|e| format!("Failed to launch installer: {e}"))?;

            std::process::exit(0);
        }
        _ => Err(format!("Unsupported platform: {os}")),
    }
}

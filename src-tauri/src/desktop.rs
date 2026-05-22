use serde::Serialize;
use std::process::Command;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};

const ADMIN_RESTART_ARG: &str = "--admin-restarted";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRuntimeRecord {
    pub is_windows: bool,
    pub is_administrator: bool,
    pub should_prompt_for_admin_restart: bool,
}

pub fn desktop_runtime_record() -> Result<DesktopRuntimeRecord, DesktopRuntimeError> {
    let is_windows = cfg!(target_os = "windows");
    let is_administrator = if is_windows {
        current_process_is_administrator()?
    } else {
        false
    };

    Ok(DesktopRuntimeRecord {
        is_windows,
        is_administrator,
        should_prompt_for_admin_restart: is_windows && !is_administrator,
    })
}

#[tauri::command]
pub fn get_desktop_runtime_record() -> Result<DesktopRuntimeRecord, String> {
    desktop_runtime_record().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn restart_as_administrator() -> Result<(), String> {
    restart_current_executable_as_administrator().map_err(|error| error.to_string())
}

#[tauri::command]
pub fn exit_application(app: AppHandle) {
    app.exit(0);
}

pub fn apply_startup_window_state<R: Runtime>(
    app: &AppHandle<R>,
    silent_start: bool,
) -> Result<(), DesktopRuntimeError> {
    let runtime = desktop_runtime_record()?;
    if silent_start && !runtime.should_prompt_for_admin_restart {
        if let Some(window) = main_window(app) {
            let _ = window.hide();
        }
    }

    Ok(())
}

pub fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = main_window(app) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window("main")
}

fn current_process_is_administrator() -> Result<bool, DesktopRuntimeError> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)"
            ])
            .output()?;

        if !output.status.success() {
            return Err(DesktopRuntimeError::CommandFailed(
                String::from_utf8_lossy(&output.stderr).trim().to_string(),
            ));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        Ok(stdout.trim().eq_ignore_ascii_case("true"))
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(false)
    }
}

fn restart_current_executable_as_administrator() -> Result<(), DesktopRuntimeError> {
    #[cfg(target_os = "windows")]
    {
        let current_exe = std::env::current_exe()?;
        let current_exe = current_exe.to_string_lossy().replace('\'', "''");
        let script = format!(
            "Start-Process -FilePath '{current_exe}' -Verb RunAs -ArgumentList '{ADMIN_RESTART_ARG}'"
        );
        let status = Command::new("powershell")
            .args(["-NoProfile", "-NonInteractive", "-Command", &script])
            .status()?;

        if !status.success() {
            return Err(DesktopRuntimeError::CommandFailed(
                "Failed to relaunch application as administrator.".to_string(),
            ));
        }

        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err(DesktopRuntimeError::CommandFailed(
            "Administrator relaunch is only supported on Windows.".to_string(),
        ))
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DesktopRuntimeError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("desktop runtime command failed: {0}")]
    CommandFailed(String),
}

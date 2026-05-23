use tauri::{Manager, Runtime, WebviewWindow};

#[derive(Debug, thiserror::Error)]
pub enum DesktopRuntimeError {
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
}

pub fn apply_startup_window_state<R: Runtime>(
    app: &tauri::AppHandle<R>,
    silent_start: bool,
) -> Result<(), DesktopRuntimeError> {
    if silent_start {
        if let Some(window) = main_window(app) {
            let _ = window.hide();
        }
    }

    Ok(())
}

pub fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = main_window(app) {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main_window<R: Runtime>(app: &tauri::AppHandle<R>) -> Option<WebviewWindow<R>> {
    app.get_webview_window("main")
}

import { invoke } from "@tauri-apps/api/core";

export type DesktopRuntimeRecord = {
  isWindows: boolean;
  isAdministrator: boolean;
  shouldPromptForAdminRestart: boolean;
};

export function readDesktopRuntime() {
  if (!isTauriRuntime()) {
    return Promise.resolve<DesktopRuntimeRecord>({
      isWindows: false,
      isAdministrator: false,
      shouldPromptForAdminRestart: false
    });
  }

  return invoke<DesktopRuntimeRecord>("get_desktop_runtime_record");
}

export function restartAsAdministrator() {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to restart as administrator."));
  }

  return invoke<void>("restart_as_administrator");
}

export function exitApplication() {
  if (!isTauriRuntime()) {
    return Promise.resolve();
  }

  return invoke<void>("exit_application");
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

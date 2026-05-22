import { invoke, Channel } from "@tauri-apps/api/core";
import {
  disable as disableAutostart,
  enable as enableAutostart,
  isEnabled as isAutostartEnabled
} from "@tauri-apps/plugin-autostart";

export type SettingsRecord = {
  autoReconcile: boolean;
  discoverPageSize: number;
  launchAtStartup: boolean;
  silentStart: boolean;
};

export type UpdateInfo = {
  version: string;
  title: string;
  body: string;
  download_url: string;
  asset_name: string;
};

export type DownloadProgress = {
  downloaded: number;
  total: number;
  percent: number;
};

const defaultSettings: SettingsRecord = {
  autoReconcile: true,
  discoverPageSize: 25,
  launchAtStartup: false,
  silentStart: false
};

export function readSettings() {
  if (!isTauriRuntime()) {
    return Promise.resolve(defaultSettings);
  }

  return invoke<SettingsRecord>("get_settings_record").then(async (record) => ({
    ...record,
    launchAtStartup: await isAutostartEnabled().catch(() => record.launchAtStartup)
  }));
}

export function updateAutoReconcileSetting(enabled: boolean) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update settings."));
  }

  return invoke<SettingsRecord>("update_auto_reconcile_record", { enabled });
}

export function updateDiscoverPageSizeSetting(pageSize: number) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update settings."));
  }

  return invoke<SettingsRecord>("update_discover_page_size_record", { pageSize });
}

export async function updateLaunchAtStartupSetting(enabled: boolean) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update settings."));
  }

  if (enabled) {
    await enableAutostart();
  } else {
    await disableAutostart();
  }

  return invoke<SettingsRecord>("update_launch_at_startup_record", { enabled });
}

export function updateSilentStartSetting(enabled: boolean) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update settings."));
  }

  return invoke<SettingsRecord>("update_silent_start_record", { enabled });
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

export function getAppVersion(): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.resolve("0.1.0");
  }
  return invoke<string>("get_app_version");
}

export function checkAppUpdate(): Promise<UpdateInfo | null> {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }
  return invoke<UpdateInfo | null>("check_app_update");
}

export function downloadAppUpdate(
  url: string,
  onProgress: (progress: DownloadProgress) => void
): Promise<string> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update."));
  }

  const onProgressChannel = new Channel<DownloadProgress>();
  onProgressChannel.onmessage = onProgress;

  return invoke<string>("download_app_update", { url, onProgress: onProgressChannel });
}

export function installUpdateAndRestart(installerPath: string): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update."));
  }
  return invoke("install_update_and_restart", { installerPath });
}

import { afterEach, describe, expect, test, vi } from "vitest";
import {
  readSettings,
  updateDiscoverPageSizeSetting,
  updateAutoReconcileSetting,
  updateLaunchAtStartupSetting,
  updateSilentStartSetting,
  type SettingsRecord
} from "./settingsApi";

const invokeMock = vi.hoisted(() => vi.fn());
const autostartEnableMock = vi.hoisted(() => vi.fn());
const autostartDisableMock = vi.hoisted(() => vi.fn());
const autostartIsEnabledMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

vi.mock("@tauri-apps/plugin-autostart", () => ({
  enable: autostartEnableMock,
  disable: autostartDisableMock,
  isEnabled: autostartIsEnabledMock
}));

describe("settingsApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
    autostartEnableMock.mockReset();
    autostartDisableMock.mockReset();
    autostartIsEnabledMock.mockReset();
  });

  test("returns the default project-only settings outside the Tauri runtime", async () => {
    await expect(readSettings()).resolves.toEqual({
      autoReconcile: true,
      closeToTray: true,
      discoverPageSize: 25,
      launchAtStartup: false,
      silentStart: false
    } satisfies SettingsRecord);
  });

  test("rejects settings updates outside the Tauri runtime", async () => {
    await expect(updateAutoReconcileSetting(false)).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(updateLaunchAtStartupSetting(true)).rejects.toThrow("Open the Tauri app");
  });

  test("uses project-only settings commands in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });

    autostartIsEnabledMock.mockResolvedValueOnce(true);
    invokeMock
      .mockResolvedValueOnce({
        autoReconcile: true,
        closeToTray: true,
        discoverPageSize: 25,
        launchAtStartup: false,
        silentStart: false
      } satisfies SettingsRecord)
      .mockResolvedValueOnce({
        autoReconcile: false,
        closeToTray: true,
        discoverPageSize: 25,
        launchAtStartup: false,
        silentStart: false
      } satisfies SettingsRecord)
      .mockResolvedValueOnce({
        autoReconcile: false,
        closeToTray: true,
        discoverPageSize: 50,
        launchAtStartup: true,
        silentStart: false
      } satisfies SettingsRecord)
      .mockResolvedValueOnce({
        autoReconcile: false,
        closeToTray: true,
        discoverPageSize: 50,
        launchAtStartup: true,
        silentStart: false
      } satisfies SettingsRecord)
      .mockResolvedValueOnce({
        autoReconcile: false,
        closeToTray: true,
        discoverPageSize: 50,
        launchAtStartup: true,
        silentStart: true
      } satisfies SettingsRecord);

    const initial = await readSettings();
    const updated = await updateAutoReconcileSetting(false);
    const resized = await updateDiscoverPageSizeSetting(50);
    const launchAtStartup = await updateLaunchAtStartupSetting(true);
    const silentStart = await updateSilentStartSetting(true);

    expect(initial.autoReconcile).toBe(true);
    expect(initial.launchAtStartup).toBe(true);
    expect(updated.autoReconcile).toBe(false);
    expect(resized.discoverPageSize).toBe(50);
    expect(launchAtStartup.launchAtStartup).toBe(true);
    expect(silentStart.silentStart).toBe(true);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_settings_record");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "update_auto_reconcile_record", {
      enabled: false
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "update_discover_page_size_record", {
      pageSize: 50
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "update_launch_at_startup_record", {
      enabled: true
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, "update_silent_start_record", {
      enabled: true
    });
    expect(autostartEnableMock).toHaveBeenCalledTimes(1);
  });
});

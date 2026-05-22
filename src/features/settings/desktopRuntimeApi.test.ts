import { afterEach, describe, expect, test, vi } from "vitest";
import {
  readDesktopRuntime,
  restartAsAdministrator,
  exitApplication,
  type DesktopRuntimeRecord
} from "./desktopRuntimeApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("desktopRuntimeApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
  });

  test("returns non-admin defaults outside the Tauri runtime", async () => {
    await expect(readDesktopRuntime()).resolves.toEqual({
      isWindows: false,
      isAdministrator: false,
      shouldPromptForAdminRestart: false
    } satisfies DesktopRuntimeRecord);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("rejects restartAsAdministrator outside the Tauri runtime", async () => {
    await expect(restartAsAdministrator()).rejects.toThrow("Open the Tauri app");
  });

  test("resolves exitApplication outside the Tauri runtime", async () => {
    await expect(exitApplication()).resolves.toBeUndefined();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  test("invokes get_desktop_runtime_record in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });

    const record: DesktopRuntimeRecord = {
      isWindows: true,
      isAdministrator: true,
      shouldPromptForAdminRestart: false
    };
    invokeMock.mockResolvedValueOnce(record);

    await expect(readDesktopRuntime()).resolves.toEqual(record);
    expect(invokeMock).toHaveBeenCalledWith("get_desktop_runtime_record");
  });

  test("invokes restart_as_administrator in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });

    invokeMock.mockResolvedValueOnce(undefined);
    await expect(restartAsAdministrator()).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("restart_as_administrator");
  });

  test("invokes exit_application in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });

    invokeMock.mockResolvedValueOnce(undefined);
    await expect(exitApplication()).resolves.toBeUndefined();
    expect(invokeMock).toHaveBeenCalledWith("exit_application");
  });
});

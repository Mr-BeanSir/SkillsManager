import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createCliTarget,
  deleteCliTarget,
  listCliTargets,
  updateCliTarget
} from "./cliTargetsApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("cliTargetsApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
  });

  test("returns an empty cli target list outside the Tauri runtime", async () => {
    await expect(listCliTargets()).resolves.toEqual([]);
  });

  test("rejects cli target writes outside the Tauri runtime", async () => {
    await expect(
      createCliTarget({ displayName: "Team Skills", relativePath: "tools/skills" })
    ).rejects.toThrow("Open the Tauri app");
    await expect(
      updateCliTarget("custom-target", {
        displayName: "Team Skills",
        relativePath: "tools/skills"
      })
    ).rejects.toThrow("Open the Tauri app");
    await expect(deleteCliTarget("custom-target")).rejects.toThrow("Open the Tauri app");
  });

  test("uses cli target management commands in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invokeMock
      .mockResolvedValueOnce([
        {
          id: "agents-skills",
          displayName: "Agents Skills",
          relativePath: ".agents/skills",
          isCommon: true,
          isBuiltIn: true,
          createdAt: "2026-05-20T08:00:00Z",
          updatedAt: "2026-05-20T08:00:00Z"
        }
      ])
      .mockResolvedValueOnce({
        id: "custom-target",
        displayName: "Team Skills",
        relativePath: "tools/skills",
        isCommon: false,
        isBuiltIn: false,
        createdAt: "2026-05-20T08:00:00Z",
        updatedAt: "2026-05-20T08:00:00Z"
      })
      .mockResolvedValueOnce({
        id: "custom-target",
        displayName: "Team Skills Updated",
        relativePath: "workspace/skills",
        isCommon: false,
        isBuiltIn: false,
        createdAt: "2026-05-20T08:00:00Z",
        updatedAt: "2026-05-20T09:00:00Z"
      })
      .mockResolvedValueOnce(undefined);

    const listed = await listCliTargets();
    const created = await createCliTarget({
      displayName: "Team Skills",
      relativePath: "tools/skills"
    });
    const updated = await updateCliTarget("custom-target", {
      displayName: "Team Skills Updated",
      relativePath: "workspace/skills"
    });
    await deleteCliTarget("custom-target");

    expect(listed).toHaveLength(1);
    expect(created.id).toBe("custom-target");
    expect(updated.relativePath).toBe("workspace/skills");
    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_cli_target_records");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "create_cli_target_record", {
      input: {
        displayName: "Team Skills",
        relativePath: "tools/skills"
      }
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "update_cli_target_record", {
      cliTargetId: "custom-target",
      input: {
        displayName: "Team Skills Updated",
        relativePath: "workspace/skills"
      }
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "delete_cli_target_record", {
      cliTargetId: "custom-target"
    });
  });
});

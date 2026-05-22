import { afterEach, describe, expect, test, vi } from "vitest";
import {
  addProjectCliTarget,
  listAvailableCliTargets,
  listProjectCliTargets,
  removeProjectCliTarget
} from "./projectCliTargetsApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("projectCliTargetsApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
  });

  test("returns empty cli target lists outside the Tauri runtime", async () => {
    await expect(listAvailableCliTargets()).resolves.toEqual([]);
    await expect(listProjectCliTargets("project-one")).resolves.toEqual([]);
  });

  test("rejects project cli target writes outside the Tauri runtime", async () => {
    await expect(addProjectCliTarget("project-one", "agents-skills")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(removeProjectCliTarget("project-one", "agents-skills")).rejects.toThrow(
      "Open the Tauri app"
    );
  });

  test("uses project cli target commands in the Tauri runtime", async () => {
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
          isCommon: true
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "project-cli-target-one",
          projectId: "project-one",
          cliTargetId: "agents-skills",
          displayName: "Agents Skills",
          relativePath: ".agents/skills",
          isCommon: true,
          createdAt: "2026-05-18T12:00:00Z",
          updatedAt: "2026-05-18T12:00:00Z"
        }
      ])
      .mockResolvedValueOnce({
        id: "project-cli-target-one",
        projectId: "project-one",
        cliTargetId: "agents-skills",
        displayName: "Agents Skills",
        relativePath: ".agents/skills",
        isCommon: true,
        createdAt: "2026-05-18T12:00:00Z",
        updatedAt: "2026-05-18T12:00:00Z"
      })
      .mockResolvedValueOnce(undefined);

    const available = await listAvailableCliTargets();
    const selected = await listProjectCliTargets("project-one");
    const added = await addProjectCliTarget("project-one", "agents-skills");
    await removeProjectCliTarget("project-one", "agents-skills");

    expect(available).toHaveLength(1);
    expect(selected).toHaveLength(1);
    expect(added.cliTargetId).toBe("agents-skills");
    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_available_cli_target_records");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "list_project_cli_target_records", {
      projectId: "project-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "add_project_cli_target_record", {
      projectId: "project-one",
      cliTargetId: "agents-skills"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "remove_project_cli_target_record", {
      projectId: "project-one",
      cliTargetId: "agents-skills"
    });
  });
});

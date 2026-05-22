import { afterEach, describe, expect, test, vi } from "vitest";
import {
  checkInstalledSkillUpdates,
  listInstalledSkills,
  updateInstalledSkill,
  updateInstalledSkills
} from "./skillsApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("skillsApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    Reflect.deleteProperty(globalThis, "window");
    invokeMock.mockReset();
  });

  test("returns an empty installed-skill list outside the Tauri runtime", async () => {
    await expect(listInstalledSkills()).resolves.toEqual([]);
  });

  test("rejects update actions outside the Tauri runtime", async () => {
    await expect(checkInstalledSkillUpdates()).rejects.toThrow("Open the Tauri app");
    await expect(updateInstalledSkill("skill-review")).rejects.toThrow("Open the Tauri app");
    await expect(updateInstalledSkills(["skill-review"])).rejects.toThrow("Open the Tauri app");
  });

  test("uses the batch update command for update-all in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: globalThis
    });
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });

    invokeMock
      .mockResolvedValueOnce({
        statuses: [],
        repositoryErrors: []
      })
      .mockResolvedValueOnce({
        id: "skill-review",
        updateAvailable: false,
        installedVersion: "1.1.0",
        latestVersion: "1.1.0"
      })
      .mockResolvedValueOnce({
        statuses: [
          {
            id: "skill-review",
            updateAvailable: false,
            installedVersion: "1.1.0",
            latestVersion: "1.1.0"
          }
        ],
        repositoryErrors: []
      });

    await checkInstalledSkillUpdates();
    await updateInstalledSkill("skill-review");
    await updateInstalledSkills(["skill-review"]);

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "check_installed_skill_updates_batch_record"
    );
    expect(invokeMock).toHaveBeenNthCalledWith(2, "update_installed_skill_record", {
      skillId: "skill-review"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "update_installed_skills_record", {
      skillIds: ["skill-review"]
    });
  });
});

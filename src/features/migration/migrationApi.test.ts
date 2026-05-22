import { afterEach, describe, expect, test, vi } from "vitest";
import {
  migrateProjectOnlyDatabase,
  type ProjectOnlyMigrationReport
} from "./migrationApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("migrationApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
  });

  test("rejects migration outside the Tauri runtime", async () => {
    await expect(migrateProjectOnlyDatabase()).rejects.toThrow("Open the Tauri app");
  });

  test("uses the project-only migration command in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });

    const report: ProjectOnlyMigrationReport = {
      alreadyMigrated: false,
      backupPath: "D:\\AppData\\SkillsManager\\skills-manager-project-only-backup.sqlite3",
      manualSkillCount: 1,
      manualSkills: [
        {
          id: "global-find-skills",
          linkMode: "global",
          name: "find-skills"
        }
      ],
      migratedProjects: 2,
      migratedProjectSkills: 5,
      nextSteps: [
        "Keep the backup until project-only workflows are verified."
      ],
      warnings: [
        "Legacy global/custom skills still need manual follow-up."
      ]
    };

    invokeMock.mockResolvedValue(report);

    await expect(migrateProjectOnlyDatabase()).resolves.toEqual(report);
    expect(invokeMock).toHaveBeenCalledWith("migrate_project_only_database_record");
  });
});

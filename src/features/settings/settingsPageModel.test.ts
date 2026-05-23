import { describe, expect, test, vi } from "vitest";
import { runMigrationWorkflow } from "./settingsPageModel";
import { type MigrationWizardState } from "../migration/wizard/MigrationWizard";
import { type ProjectOnlyMigrationReport } from "../migration/migrationApi";

describe("settingsPageModel", () => {
  test("emits the full success sequence for the migration workflow", async () => {
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
      nextSteps: ["Keep the backup until project-only workflows are verified."],
      warnings: ["Legacy global/custom skills still need manual follow-up."]
    };
    const onState = vi.fn<(state: MigrationWizardState) => void>();

    await runMigrationWorkflow({
      executeMigration: () => Promise.resolve(report),
      onState
    });

    expect(onState.mock.calls).toEqual([
      [{ kind: "running", step: "backup" }],
      [{ kind: "running", step: "migrate" }],
      [{ kind: "running", step: "report" }],
      [{ kind: "success", report }]
    ]);
  });

  test("emits an error state when the migration workflow fails", async () => {
    const onState = vi.fn<(state: MigrationWizardState) => void>();

    await runMigrationWorkflow({
      executeMigration: () => Promise.reject(new Error("Access is denied.")),
      onError: (reason) => String(reason),
      onState
    });

    expect(onState.mock.calls).toEqual([
      [{ kind: "running", step: "backup" }],
      [{ kind: "running", step: "migrate" }],
      [{ kind: "error", message: "Error: Access is denied." }]
    ]);
  });
});

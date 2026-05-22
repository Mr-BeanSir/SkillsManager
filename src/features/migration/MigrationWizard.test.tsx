import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fallbackLocale } from "../../i18n";
import { MigrationWizard, type MigrationWizardState } from "./MigrationWizard";

describe("MigrationWizard", () => {
  test("renders the migration entry state with explanation and action", () => {
    const markup = renderToStaticMarkup(
      <MigrationWizard
        catalog={fallbackLocale}
        language="en"
        state={{ kind: "idle" }}
      />
    );

    expect(markup).toContain("Project-Only Migration");
    expect(markup).toContain("Migrate Database");
    expect(markup).toContain("This runs the one-time database migration");
  });

  test("renders staged progress while the migration is running", () => {
    const state: MigrationWizardState = {
      kind: "running",
      step: "migrate"
    };

    const markup = renderToStaticMarkup(
      <MigrationWizard catalog={fallbackLocale} language="en" state={state} />
    );

    expect(markup).toContain("Running migration…");
    expect(markup).toContain("Create backup");
    expect(markup).toContain("Apply project-only schema");
    expect(markup).toContain("Generate migration report");
    expect(markup).toContain("Applying the project-only schema");
  });

  test("renders the migration report with backup path and manual follow-up list", () => {
    const state: MigrationWizardState = {
      kind: "success",
      report: {
        alreadyMigrated: false,
        backupPath: "D:\\AppData\\SkillsManager\\skills-manager-project-only-backup.sqlite3",
        manualSkillCount: 2,
        manualSkills: [
          {
            id: "global-find-skills",
            linkMode: "global",
            name: "find-skills"
          },
          {
            id: "custom-web-access",
            linkMode: "custom",
            name: "web-access"
          }
        ],
        migratedProjects: 3,
        migratedProjectSkills: 8,
        nextSteps: [
          "Keep the backup until project-only workflows are verified.",
          "Reattach listed legacy skills from the Projects page."
        ],
        warnings: [
          "Legacy global/custom skills still need manual follow-up."
        ]
      }
    };

    const markup = renderToStaticMarkup(
      <MigrationWizard catalog={fallbackLocale} language="en" state={state} />
    );

    expect(markup).toContain("Migration Complete");
    expect(markup).toContain("Projects migrated");
    expect(markup).toContain("3");
    expect(markup).toContain("Manual follow-up");
    expect(markup).toContain("find-skills");
    expect(markup).toContain("global");
    expect(markup).toContain("skills-manager-project-only-backup.sqlite3");
    expect(markup).toContain("Warnings");
    expect(markup).toContain("Next Steps");
    expect(markup).toContain("Keep the backup until project-only workflows are verified.");
  });

  test("renders recovery guidance when the migration fails", () => {
    const state: MigrationWizardState = {
      kind: "error",
      message:
        "filesystem error at D:\\AppData\\SkillsManager\\skills-manager.sqlite3: Access is denied. (os error 5)"
    };

    const markup = renderToStaticMarkup(
      <MigrationWizard catalog={fallbackLocale} language="en" state={state} />
    );

    expect(markup).toContain("Migration Failed");
    expect(markup).toContain("Access is denied");
    expect(markup).toContain("Check write access to the database folder and retry.");
    expect(markup).toContain("If a backup file was created, keep it until the migration succeeds.");
  });
});

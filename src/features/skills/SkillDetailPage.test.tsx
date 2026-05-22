import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SkillDetailTopbarActions,
  SkillProjectAssignments,
  SkillEditorHeader,
  SkillDetailSplitHeader
} from "./SkillDetailPage";
import {
  DEFAULT_APP_WINDOW_WIDTH,
  resolveSkillDetailLayout
} from "./skillDetailLayout";
import { fallbackLocale } from "../../i18n";

describe("SkillDetailSplitHeader", () => {
  test("renders a divider header with a 30/70 split layout", () => {
    const markup = renderToStaticMarkup(
      <SkillDetailSplitHeader
        leftDescription="Inspect the current snapshot."
        leftTitle="Snapshot Summary"
        rightDescription="Projects currently using this skill."
        rightTitle="Project Assignments"
      />
    );

    expect(markup).toContain("Snapshot Summary");
    expect(markup).toContain("Project Assignments");
    expect(markup).toContain("aria-hidden=\"true\"");
    expect(markup).not.toContain("panel-header");
    expect(markup).toContain("Inspect the current snapshot.");
    expect(markup).toContain("Projects currently using this skill.");
  });

  test("renders optional right-side actions inside the split header", () => {
    const markup = renderToStaticMarkup(
      <SkillDetailSplitHeader
        leftDescription="Browse editable files."
        leftTitle="File Tree"
        rightActions={<button type="button">Save</button>}
        rightDescription="SKILL.md"
        rightTitle="Editor"
      />
    );

    expect(markup).toContain("Editor");
    expect(markup).toContain("Save");
    expect(markup).toContain("<button type=\"button\">Save</button>");
  });
});

describe("resolveSkillDetailLayout", () => {
  test("keeps the merged split layout at the default app window width", () => {
    expect(resolveSkillDetailLayout(DEFAULT_APP_WINDOW_WIDTH)).toBe("merged");
  });

  test("falls back to separate cards below the default app window width", () => {
    expect(resolveSkillDetailLayout(DEFAULT_APP_WINDOW_WIDTH - 1)).toBe("separate-cards");
  });
});

describe("SkillEditorHeader", () => {
  test("renders the save action inside the editor header when the file is dirty", () => {
    const markup = renderToStaticMarkup(
      <SkillEditorHeader
        isDirty
        isReadingFile={false}
        isSaving={false}
        onSave={() => undefined}
        saveLabel="Save"
        savingLabel="Saving…"
        subtitle="skills/find-skills/SKILL.md"
        title="Editor"
      />
    );

    expect(markup).toContain("Editor");
    expect(markup).toContain("skills/find-skills/SKILL.md");
    expect(markup).toContain("Save");
    expect(markup).not.toContain("Saving…");
  });
});

describe("SkillDetailTopbarActions", () => {
  test("renders current status above the back action", () => {
    const markup = renderToStaticMarkup(
      <SkillDetailTopbarActions
        backLabel="Back to Skills"
        currentLabel="Current"
        isCurrent
        isUpdateAvailable={false}
        onBack={() => undefined}
        updateAvailableLabel="Update Available"
      />
    );

    expect(markup).toContain("Back to Skills");
    expect(markup).toContain("Current");
    expect(markup.indexOf("Current")).toBeLessThan(markup.indexOf("Back to Skills"));
  });
});

describe("SkillProjectAssignments", () => {
  test("renders an empty usage state with the merged-layout empty-state class", () => {
    const markup = renderToStaticMarkup(
      <SkillProjectAssignments
        catalog={fallbackLocale}
        detail={{
          attachedProjectCount: 0,
          fileTree: [],
          id: "skill-one",
          installedVersion: null,
          latestVersion: null,
          managedDirName: "find-skills-f40227a5",
          managedRootPath: "C:\\Users\\xdou\\AppData\\Roaming\\SkillsManager\\managed-skills\\find-skills-f40227a5",
          name: "find-skills",
          projectUsages: [],
          skillPath: "skills/find-skills/SKILL.md",
          sourceRef: "vercel-labs/skills",
          sourceType: "github",
          updateAvailable: false
        }}
        language="zh"
      />
    );

    expect(markup).toContain("empty-state");
    expect(markup).toContain("还没有项目使用记录");
  });
});

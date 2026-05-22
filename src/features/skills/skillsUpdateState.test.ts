import { describe, expect, test } from "vitest";
import type { InstalledSkill } from "./skillsApi";
import {
  buildInitialUpdateRuntimeState,
  buildUpdateRuntimeView,
  finishCheckingUpdates,
  finishUpdatingSkill,
  startCheckingUpdates,
  startUpdatingAllSkills,
  startUpdatingSkill
} from "./skillsUpdateState";

const skills: InstalledSkill[] = [
  {
    id: "skill-current",
    name: "current-skill",
    sourceType: "github",
    sourceRef: "acme/skills",
    skillPath: "skills/current/SKILL.md",
    activeProjectCount: 1,
    attachedProjectCount: 1,
    projectUsages: [],
    updateAvailable: false,
    installedVersion: "1.0.0",
    latestVersion: "1.0.0",
    updatedAt: "2026-05-21T10:00:00Z"
  },
  {
    id: "skill-stale",
    name: "stale-skill",
    sourceType: "github",
    sourceRef: "acme/skills",
    skillPath: "skills/stale/SKILL.md",
    activeProjectCount: 0,
    attachedProjectCount: 0,
    projectUsages: [],
    updateAvailable: true,
    installedVersion: "1.0.0",
    latestVersion: "1.1.0",
    updatedAt: "2026-05-21T10:00:00Z"
  }
];

describe("skillsUpdateState", () => {
  test("shows loading for every update cell while checking and hides update all until results return", () => {
    const state = startCheckingUpdates(buildInitialUpdateRuntimeState());
    const view = buildUpdateRuntimeView(skills, state);

    expect(view.isCheckingUpdates).toBe(true);
    expect(view.showUpdateAll).toBe(false);
    expect(view.rows.every((row) => row.updateLabel === "loading")).toBe(true);
    expect(view.rows.every((row) => row.rowDisabled === false)).toBe(true);
  });

  test("shows update all only after check results report outdated skills", () => {
    const state = finishCheckingUpdates(
      startCheckingUpdates(buildInitialUpdateRuntimeState()),
      [{ id: "skill-current", updateAvailable: false }, { id: "skill-stale", updateAvailable: true }]
    );
    const view = buildUpdateRuntimeView(skills, state);

    expect(view.isCheckingUpdates).toBe(false);
    expect(view.showUpdateAll).toBe(true);
    expect(view.rows.find((row) => row.id === "skill-current")?.updateLabel).toBe("current");
    expect(view.rows.find((row) => row.id === "skill-stale")?.updateLabel).toBe("available");
  });

  test("disables the entire updating row and the update all action during single-skill updates", () => {
    const checkedState = finishCheckingUpdates(buildInitialUpdateRuntimeState(), [
      { id: "skill-current", updateAvailable: false },
      { id: "skill-stale", updateAvailable: true }
    ]);
    const state = startUpdatingSkill(checkedState, "skill-stale");
    const view = buildUpdateRuntimeView(skills, state);
    const staleRow = view.rows.find((row) => row.id === "skill-stale");
    const currentRow = view.rows.find((row) => row.id === "skill-current");

    expect(view.updateAllDisabled).toBe(true);
    expect(staleRow).toMatchObject({
      rowDisabled: true,
      updateLabel: "updating",
      showRowUpdateAction: false
    });
    expect(currentRow?.rowDisabled).toBe(false);
  });

  test("disables all outdated rows during update-all and hides the action after all updates finish", () => {
    const checkedState = finishCheckingUpdates(buildInitialUpdateRuntimeState(), [
      { id: "skill-current", updateAvailable: false },
      { id: "skill-stale", updateAvailable: true }
    ]);
    const updatingState = startUpdatingAllSkills(checkedState, ["skill-stale"]);
    const updatingView = buildUpdateRuntimeView(skills, updatingState);

    expect(updatingView.updateAllDisabled).toBe(true);
    expect(updatingView.rows.find((row) => row.id === "skill-stale")?.rowDisabled).toBe(true);

    const finishedState = finishUpdatingSkill(updatingState, {
      id: "skill-stale",
      updateAvailable: false
    });
    const finishedView = buildUpdateRuntimeView(
      skills.map((skill) =>
        skill.id === "skill-stale" ? { ...skill, updateAvailable: false } : skill
      ),
      finishedState
    );

    expect(finishedView.showUpdateAll).toBe(false);
    expect(finishedView.updateAllDisabled).toBe(false);
    expect(finishedView.rows.find((row) => row.id === "skill-stale")?.rowDisabled).toBe(false);
    expect(finishedView.rows.find((row) => row.id === "skill-stale")?.updateLabel).toBe("current");
  });
});

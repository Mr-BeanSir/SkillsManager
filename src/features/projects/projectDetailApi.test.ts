import { afterEach, describe, expect, test, vi } from "vitest";
import {
  addProjectGroup,
  addProjectSkill,
  disableProjectGroup,
  disableProjectSkill,
  enableProjectGroup,
  enableProjectSkill,
  listProjectGroups,
  listProjectSkills,
  removeProjectGroup,
  removeProjectSkill
} from "./projectDetailApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("projectDetailApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
  });

  test("returns empty project detail lists outside the Tauri runtime", async () => {
    await expect(listProjectSkills("project-one")).resolves.toEqual([]);
    await expect(listProjectGroups("project-one")).resolves.toEqual([]);
  });

  test("rejects project detail writes outside the Tauri runtime", async () => {
    await expect(addProjectSkill("project-one", "skill-one")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(enableProjectSkill("project-one", "skill-one")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(disableProjectSkill("project-one", "skill-one")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(removeProjectSkill("project-one", "skill-one")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(addProjectGroup("project-one", "group-one")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(enableProjectGroup("project-one", "group-one")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(disableProjectGroup("project-one", "group-one")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(removeProjectGroup("project-one", "group-one")).rejects.toThrow(
      "Open the Tauri app"
    );
  });

  test("uses project detail commands in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invokeMock
      .mockResolvedValueOnce([
        {
          id: "project-skill-one",
          projectId: "project-one",
          skillId: "skill-one",
          skillName: "grill-with-docs",
          sourceType: "github",
          sourceRef: "owner/repo",
          skillPath: "skills/grill-with-docs",
          enabled: true,
          createdAt: "2026-05-18T12:00:00Z",
          updatedAt: "2026-05-18T12:00:00Z"
        }
      ])
      .mockResolvedValueOnce([
        {
          id: "project-group-one",
          projectId: "project-one",
          groupId: "group-one",
          groupName: "Frontend",
          enabled: true,
          createdAt: "2026-05-18T12:00:00Z",
          updatedAt: "2026-05-18T12:00:00Z"
        }
      ])
      .mockResolvedValue(undefined);

    const skills = await listProjectSkills("project-one");
    const groups = await listProjectGroups("project-one");
    await addProjectSkill("project-one", "skill-one");
    await enableProjectSkill("project-one", "skill-one");
    await disableProjectSkill("project-one", "skill-one");
    await removeProjectSkill("project-one", "skill-one");
    await addProjectGroup("project-one", "group-one");
    await enableProjectGroup("project-one", "group-one");
    await disableProjectGroup("project-one", "group-one");
    await removeProjectGroup("project-one", "group-one");

    expect(skills).toHaveLength(1);
    expect(groups).toHaveLength(1);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_project_skill_records", {
      projectId: "project-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "list_project_group_records", {
      projectId: "project-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "add_project_skill_record", {
      projectId: "project-one",
      skillId: "skill-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "enable_project_skill_record", {
      projectId: "project-one",
      skillId: "skill-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, "disable_project_skill_record", {
      projectId: "project-one",
      skillId: "skill-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(6, "remove_project_skill_record", {
      projectId: "project-one",
      skillId: "skill-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(7, "add_project_group_record", {
      projectId: "project-one",
      groupId: "group-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(8, "enable_project_group_record", {
      projectId: "project-one",
      groupId: "group-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(9, "disable_project_group_record", {
      projectId: "project-one",
      groupId: "group-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(10, "remove_project_group_record", {
      projectId: "project-one",
      groupId: "group-one"
    });
  });
});

import { describe, expect, test } from "vitest";
import {
  addSkillsToGroup,
  listSkillGroups,
  removeSkillFromGroup,
  reconcileProjectGroups
} from "./groupsApi";

describe("groupsApi", () => {
  test("returns an empty list outside the Tauri runtime", async () => {
    await expect(listSkillGroups()).resolves.toEqual([]);
  });

  test("rejects write operations outside the Tauri runtime", async () => {
    await expect(addSkillsToGroup("group-one", ["skill-one"])).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(removeSkillFromGroup("group-one", "skill-one")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(reconcileProjectGroups()).rejects.toThrow("Open the Tauri app");
  });
});

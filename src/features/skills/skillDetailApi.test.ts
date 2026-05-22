import { afterEach, describe, expect, test, vi } from "vitest";
import { getSkillDetail, readSkillFile, writeSkillFile } from "./skillDetailApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("skillDetailApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
  });

  test("rejects skill file access outside the Tauri runtime", async () => {
    await expect(getSkillDetail("skill-one")).rejects.toThrow("Open the Tauri app");
    await expect(readSkillFile("skill-one", "SKILL.md")).rejects.toThrow("Open the Tauri app");
    await expect(
      writeSkillFile("skill-one", "SKILL.md", "# Updated")
    ).rejects.toThrow("Open the Tauri app");
  });

  test("uses skill detail commands in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });

    invokeMock
      .mockResolvedValueOnce({
        id: "skill-one",
        name: "grill-with-docs",
        sourceType: "github",
        sourceRef: "owner/repo",
        skillPath: "skills/grill-with-docs",
        managedDirName: "grill-with-docs-499b7424",
        managedRootPath: "D:/AppData/SkillsManager/managed-skills/grill-with-docs-499b7424",
        updateAvailable: false,
        installedVersion: "1.0.0",
        latestVersion: "1.0.0",
        attachedProjectCount: 1,
        projectUsages: [],
        fileTree: [
          {
            path: "SKILL.md",
            name: "SKILL.md",
            kind: "file",
            editable: true
          }
        ]
      })
      .mockResolvedValueOnce({
        path: "SKILL.md",
        contents: "# Skill"
      })
      .mockResolvedValueOnce(undefined);

    const detail = await getSkillDetail("skill-one");
    const file = await readSkillFile("skill-one", "SKILL.md");
    await writeSkillFile("skill-one", "SKILL.md", "# Updated");

    expect(detail.name).toBe("grill-with-docs");
    expect(file.contents).toBe("# Skill");
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_skill_detail", {
      skillId: "skill-one"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "read_skill_file", {
      skillId: "skill-one",
      relativePath: "SKILL.md"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "write_skill_file", {
      skillId: "skill-one",
      relativePath: "SKILL.md",
      contents: "# Updated"
    });
  });
});

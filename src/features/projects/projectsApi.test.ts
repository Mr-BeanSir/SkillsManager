import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createProject,
  deleteProject,
  getProject,
  listProjects,
  openProjectDirectory,
  selectProjectDirectory,
  type ProjectInput
} from "./projectsApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("projectsApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
  });

  test("returns an empty list outside the Tauri runtime", async () => {
    await expect(listProjects()).resolves.toEqual([]);
  });

  test("rejects write operations outside the Tauri runtime", async () => {
    const input: ProjectInput = {
      name: "Skills Manager",
      path: "D:\\Development\\nodejs\\SkillsManager"
    };

    await expect(createProject(input)).rejects.toThrow("Open the Tauri app");
    await expect(getProject("project-skills-manager")).rejects.toThrow("Open the Tauri app");
    await expect(deleteProject("project-skills-manager")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(openProjectDirectory("D:\\Development\\nodejs\\SkillsManager")).rejects.toThrow(
      "Open the Tauri app"
    );
    await expect(selectProjectDirectory()).rejects.toThrow("Open the Tauri app");
  });

  test("uses project commands in the Tauri runtime", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invokeMock
      .mockResolvedValueOnce([
        {
          id: "project-skills-manager",
          name: "Skills Manager",
          path: "D:\\Development\\nodejs\\SkillsManager",
          createdAt: "2026-05-18T12:00:00Z",
          updatedAt: "2026-05-18T12:00:00Z"
        }
      ])
      .mockResolvedValueOnce({
        id: "project-skills-manager",
        name: "Skills Manager",
        path: "D:\\Development\\nodejs\\SkillsManager",
        createdAt: "2026-05-18T12:00:00Z",
        updatedAt: "2026-05-18T12:00:00Z"
      })
      .mockResolvedValueOnce({
        id: "project-skills-manager",
        name: "Skills Manager",
        path: "D:\\Development\\nodejs\\SkillsManager",
        createdAt: "2026-05-18T12:00:00Z",
        updatedAt: "2026-05-18T12:00:00Z"
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce("D:\\Development\\nodejs\\SkillsManager")
      .mockResolvedValueOnce(undefined);

    const input: ProjectInput = {
      name: "Skills Manager",
      path: "D:\\Development\\nodejs\\SkillsManager"
    };

    const listed = await listProjects();
    const created = await createProject(input);
    const fetched = await getProject(created.id);
    await openProjectDirectory(created.path);
    const selectedPath = await selectProjectDirectory();
    await deleteProject(created.id);

    expect(listed).toHaveLength(1);
    expect(created.name).toBe("Skills Manager");
    expect(fetched.id).toBe("project-skills-manager");
    expect(selectedPath).toBe("D:\\Development\\nodejs\\SkillsManager");
    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_project_records");
    expect(invokeMock).toHaveBeenNthCalledWith(2, "create_project_record", {
      input
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "get_project_record", {
      id: "project-skills-manager"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "open_project_directory", {
      path: "D:\\Development\\nodejs\\SkillsManager"
    });
    expect(invokeMock).toHaveBeenNthCalledWith(5, "select_directory");
    expect(invokeMock).toHaveBeenNthCalledWith(6, "delete_project_record", {
      id: "project-skills-manager"
    });
  });
});

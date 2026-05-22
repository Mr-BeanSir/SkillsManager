import { describe, expect, test } from "vitest";
import type { ProjectRecord } from "./projectsApi";
import { PROJECTS_PAGE_SIZE, buildProjectsPage } from "./projectsPageModel";

const projects: ProjectRecord[] = Array.from({ length: 25 }, (_, index) => ({
  id: `project-${index + 1}`,
  name: `Project ${String(index + 1).padStart(2, "0")}`,
  path: `D:/Development/project-${index + 1}`,
  createdAt: "2026-05-19T10:00:00Z",
  updatedAt: "2026-05-19T10:00:00Z"
}));

describe("projectsPageModel", () => {
  test("uses the approved default page size", () => {
    expect(PROJECTS_PAGE_SIZE).toBe(20);
  });

  test("filters first and then paginates", () => {
    const page = buildProjectsPage(projects, "project 2", 1);

    expect(page.filteredCount).toBe(6);
    expect(page.totalPages).toBe(1);
    expect(page.items.map((project) => project.id)).toEqual([
      "project-20",
      "project-21",
      "project-22",
      "project-23",
      "project-24",
      "project-25"
    ]);
  });

  test("clamps the current page when the requested page is out of range", () => {
    const page = buildProjectsPage(projects, "", 9);

    expect(page.currentPage).toBe(2);
    expect(page.totalPages).toBe(2);
    expect(page.items).toHaveLength(5);
    expect(page.items[0]?.id).toBe("project-21");
  });
});

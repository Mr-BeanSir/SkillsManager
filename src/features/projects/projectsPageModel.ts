import type { ProjectRecord } from "./projectsApi";

export const PROJECTS_PAGE_SIZE = 20;

export type ProjectsPageSlice = {
  items: ProjectRecord[];
  filteredCount: number;
  currentPage: number;
  totalPages: number;
};

export function filterProjects(projects: ProjectRecord[], query: string) {
  const term = query.trim().toLowerCase();

  if (!term) {
    return projects;
  }

  return projects.filter((project) =>
    `${project.name} ${project.path}`.toLowerCase().includes(term)
  );
}

export function buildProjectsPage(
  projects: ProjectRecord[],
  query: string,
  requestedPage: number
): ProjectsPageSlice {
  const filteredProjects = filterProjects(projects, query);
  const filteredCount = filteredProjects.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PROJECTS_PAGE_SIZE));
  const currentPage = clampPage(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * PROJECTS_PAGE_SIZE;

  return {
    items: filteredProjects.slice(startIndex, startIndex + PROJECTS_PAGE_SIZE),
    filteredCount,
    currentPage,
    totalPages
  };
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page) || page < 1) {
    return 1;
  }

  return Math.min(Math.trunc(page), totalPages);
}

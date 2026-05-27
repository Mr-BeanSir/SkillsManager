import type { InstalledSkill } from "./skillsApi";

export type SkillsSummary = {
  managed: number;
  inUse: number;
  unused: number;
  updates: number;
};

export function filterBySourceRef(
  skills: InstalledSkill[],
  sourceRef: string | null
): InstalledSkill[] {
  if (!sourceRef) {
    return skills;
  }

  return skills.filter((skill) => skill.sourceRef === sourceRef);
}

export function filterByGroupId(
  skills: InstalledSkill[],
  groupSkillIds: Set<string> | null
): InstalledSkill[] {
  if (!groupSkillIds) {
    return skills;
  }

  return skills.filter((skill) => groupSkillIds.has(skill.id));
}

export function extractUniqueSourceRefs(skills: InstalledSkill[]): string[] {
  const refs = new Set(skills.map((skill) => skill.sourceRef));
  return [...refs].sort((a, b) => a.localeCompare(b));
}

export function filterInstalledSkills(skills: InstalledSkill[], query: string) {
  const term = query.trim().toLowerCase();

  if (!term) {
    return skills;
  }

  return skills.filter((skill) =>
    [
      skill.name,
      skill.sourceType,
      skill.sourceRef,
      skill.skillPath,
      ...skill.projectUsages.flatMap((usage) => [
        usage.projectName,
        usage.projectPath
      ])
    ]
      .join(" ")
      .toLowerCase()
      .includes(term)
  );
}

export type SkillsPageSlice = {
  items: InstalledSkill[];
  filteredCount: number;
  currentPage: number;
  totalPages: number;
};

export function buildSkillsPage(
  filteredSkills: InstalledSkill[],
  requestedPage: number,
  pageSize: number
): SkillsPageSlice {
  const filteredCount = filteredSkills.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  const currentPage = clampPage(requestedPage, totalPages);
  const startIndex = (currentPage - 1) * pageSize;

  return {
    items: filteredSkills.slice(startIndex, startIndex + pageSize),
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

export function buildSkillsSummary(skills: InstalledSkill[]): SkillsSummary {
  const managed = skills.length;
  const inUse = skills.filter((skill) => skill.activeProjectCount > 0).length;
  const updates = skills.filter((skill) => skill.updateAvailable).length;

  return {
    managed,
    inUse,
    unused: managed - inUse,
    updates
  };
}

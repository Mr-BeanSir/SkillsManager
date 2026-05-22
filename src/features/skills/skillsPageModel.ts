import type { InstalledSkill } from "./skillsApi";

export type SkillsSummary = {
  managed: number;
  inUse: number;
  unused: number;
  updates: number;
};

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

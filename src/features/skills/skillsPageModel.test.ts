import { describe, expect, test } from "vitest";
import type { InstalledSkill } from "./skillsApi";
import { buildSkillsSummary, extractUniqueSourceRefs, filterBySourceRef, filterInstalledSkills } from "./skillsPageModel";

const skills: InstalledSkill[] = [
  {
    id: "skill-react",
    name: "react-foundation",
    sourceType: "github",
    sourceRef: "vercel-labs/skills",
    skillPath: "skills/react-foundation/SKILL.md",
    activeProjectCount: 2,
    attachedProjectCount: 3,
    projectUsages: [
      {
        projectId: "project-web",
        projectName: "Web Console",
        projectPath: "D:/Development/nodejs/web-console",
        enabled: true
      },
      {
        projectId: "project-admin",
        projectName: "Admin App",
        projectPath: "D:/Development/nodejs/admin-app",
        enabled: true
      },
      {
        projectId: "project-docs",
        projectName: "Docs Site",
        projectPath: "D:/Development/nodejs/docs-site",
        enabled: false
      }
    ],
    updateAvailable: false,
    installedVersion: "1.0.0",
    latestVersion: "1.0.0",
    updatedAt: "2026-05-18T09:00:00Z"
  },
  {
    id: "skill-eslint",
    name: "eslint-rules",
    sourceType: "raw_url",
    sourceRef: "https://example.com/SKILL.md",
    skillPath: "SKILL.md",
    activeProjectCount: 0,
    attachedProjectCount: 1,
    projectUsages: [
      {
        projectId: "project-admin",
        projectName: "Admin App",
        projectPath: "D:/Development/nodejs/admin-app",
        enabled: false
      }
    ],
    updateAvailable: true,
    installedVersion: "1.0.0",
    latestVersion: "1.1.0",
    updatedAt: "2026-05-18T09:00:00Z"
  },
  {
    id: "skill-unused",
    name: "unused-skill",
    sourceType: "gitlab",
    sourceRef: "acme/unused",
    skillPath: "skills/unused/SKILL.md",
    activeProjectCount: 0,
    attachedProjectCount: 0,
    projectUsages: [],
    updateAvailable: false,
    installedVersion: null,
    latestVersion: null,
    updatedAt: "2026-05-18T09:00:00Z"
  }
];

describe("skillsPageModel", () => {
  test("builds project-only summary counts", () => {
    expect(buildSkillsSummary(skills)).toEqual({
      managed: 3,
      inUse: 1,
      unused: 2,
      updates: 1
    });
  });

  test("filters installed skills by project names and paths as well as skill metadata", () => {
    expect(filterInstalledSkills(skills, "admin")).toHaveLength(2);
    expect(filterInstalledSkills(skills, "docs-site")[0]?.id).toBe("skill-react");
    expect(filterInstalledSkills(skills, "raw_url")[0]?.id).toBe("skill-eslint");
  });

  test("filterBySourceRef returns all skills when sourceRef is null", () => {
    expect(filterBySourceRef(skills, null)).toHaveLength(3);
  });

  test("filterBySourceRef returns only matching skills", () => {
    const result = filterBySourceRef(skills, "vercel-labs/skills");
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("skill-react");
  });

  test("filterBySourceRef returns empty array when nothing matches", () => {
    expect(filterBySourceRef(skills, "nonexistent")).toHaveLength(0);
  });

  test("extractUniqueSourceRefs returns sorted, deduplicated source refs", () => {
    expect(extractUniqueSourceRefs(skills)).toEqual([
      "acme/unused",
      "https://example.com/SKILL.md",
      "vercel-labs/skills"
    ]);
  });
});

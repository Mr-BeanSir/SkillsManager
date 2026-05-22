import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fallbackLocale } from "../../i18n";
import type { InstalledSkill } from "../skills/skillsApi";
import type { SkillGroup } from "./groupsApi";
import { GroupDetailPage } from "./GroupDetailPage";

const group: SkillGroup = {
  id: "group-repository-agents",
  name: "Repository Agents",
  skills: [
    {
      id: "skill-grill-with-docs",
      name: "grill-with-docs",
      sourceType: "github",
      sourceRef: "team/skills",
      skillPath: "grill-with-docs"
    }
  ],
  activeProjectCount: 2,
  attachedProjectCount: 3,
  projectUsages: [
    {
      projectId: "project-skills-manager",
      projectName: "Skills Manager",
      projectPath: "D:\\Development\\nodejs\\SkillsManager",
      enabled: true
    }
  ],
  createdAt: "2026-05-20T08:00:00.000Z",
  updatedAt: "2026-05-20T09:00:00.000Z"
};

const installedSkills: InstalledSkill[] = [
  {
    id: "skill-grill-with-docs",
    name: "grill-with-docs",
    sourceType: "github",
    sourceRef: "team/skills",
    skillPath: "grill-with-docs",
    installedVersion: null,
    latestVersion: null,
    updateAvailable: false,
    activeProjectCount: 1,
    attachedProjectCount: 1,
    projectUsages: [],
    updatedAt: "2026-05-20T09:00:00.000Z",
  },
  {
    id: "skill-find-skills",
    name: "find-skills",
    sourceType: "github",
    sourceRef: "vercel-labs/skills",
    skillPath: "find-skills",
    installedVersion: null,
    latestVersion: null,
    updateAvailable: false,
    activeProjectCount: 0,
    attachedProjectCount: 0,
    projectUsages: [],
    updatedAt: "2026-05-20T09:00:00.000Z",
  }
];

describe("GroupDetailPage", () => {
  test("renders a distilled detail page with summary metrics and transfer state", () => {
    const markup = renderToStaticMarkup(
      <GroupDetailPage
        catalog={fallbackLocale}
        error={null}
        group={group}
        installedSkills={installedSkills}
        isSaving={false}
        language="en"
        onBack={() => undefined}
        onOpenProject={() => undefined}
        onSyncSkills={() => Promise.resolve()}
        status={null}
      />
    );

    expect(markup).toContain("Back to Groups");
    expect(markup).toContain("Repository Agents");
    expect(markup).toContain("Pending Changes");
    expect(markup).toContain("0 queued");
    expect(markup).toContain("Included Skills");
    expect(markup).toContain("Installed Skills");
    expect(markup).toContain("Group Skills");
    expect(markup).toContain("Search installed skills…");
    expect(markup).toContain("Search group skills…");
    expect(markup).toContain("find-skills");
    expect(markup).not.toContain("Add 0 Skills");
    expect(markup).toContain("Project Assignments");
    expect(markup).toContain("Skills Manager");
    expect(markup).toContain("Open project Skills Manager");
    expect(markup).not.toContain("Delete Group");
  });
});

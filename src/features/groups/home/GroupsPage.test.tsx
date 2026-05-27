import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fallbackLocale } from "../../../app/i18n";
import type { SkillGroup } from "../groupsApi";
import { GroupsPage } from "./GroupsPage";

const groups: SkillGroup[] = [
  {
    id: "group-test",
    name: "test",
    groupType: "manual",
    file: null,
    description: "",
    version: null,
    totalSkills: 0,
    skills: [],
    activeProjectCount: 0,
    attachedProjectCount: 0,
    projectUsages: [],
    createdAt: "2026-05-20T08:00:00.000Z",
    updatedAt: "2026-05-20T09:00:00.000Z"
  }
];

describe("GroupsPage", () => {
  test("renders a custom delete confirmation dialog when a group is pending deletion", () => {
    const markup = renderToStaticMarkup(
      <GroupsPage
        catalog={fallbackLocale}
        initialDeleteGroupId="group-test"
        initialGroups={groups}
        language="en"
        onOpenGroup={() => undefined}
      />
    );

    expect(markup).toContain("Delete “test”?");
    expect(markup).toContain("Attached projects keep their own project records");
    expect(markup).toContain("aria-modal=\"true\"");
    expect(markup).toContain("Delete Group");
  });
});

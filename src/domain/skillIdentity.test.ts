import { describe, expect, it } from "vitest";
import {
  managedSkillDirectoryName,
  safeSkillName,
  skillId,
  sourceIdentity
} from "./skillIdentity";

describe("skill identity helpers", () => {
  it("builds source identity from source type, reference, and path", () => {
    expect(
      sourceIdentity({
        sourceType: "github",
        sourceRef: "mattpocock/skills",
        skillPath: "skills/engineering/grill-with-docs/SKILL.md"
      })
    ).toBe("github|mattpocock/skills|skills/engineering/grill-with-docs/SKILL.md");
  });

  it("keeps display names readable while making them filesystem-safe", () => {
    expect(safeSkillName(" Grill With Docs! ")).toBe("grill-with-docs");
    expect(safeSkillName("...")).toBe("skill");
  });

  it("keeps same source identity stable", () => {
    const input = {
      sourceType: "github",
      sourceRef: "mattpocock/skills",
      skillPath: "skills/engineering/grill-with-docs/SKILL.md"
    };

    expect(skillId(input)).toBe(skillId(input));
  });

  it("separates same skill name from different remote sources", () => {
    const first = managedSkillDirectoryName({
      name: "shared-name",
      sourceType: "github",
      sourceRef: "owner-one/skills",
      skillPath: "skills/shared-name/SKILL.md"
    });
    const second = managedSkillDirectoryName({
      name: "shared-name",
      sourceType: "github",
      sourceRef: "owner-two/skills",
      skillPath: "skills/shared-name/SKILL.md"
    });

    expect(first).toMatch(/^shared-name-[a-f0-9]{8}$/);
    expect(second).toMatch(/^shared-name-[a-f0-9]{8}$/);
    expect(first).not.toBe(second);
  });
});

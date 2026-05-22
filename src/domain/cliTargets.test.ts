import { describe, expect, it } from "vitest";
import {
  AGENTS_CLI_TARGET,
  detectCliTargets,
  splitCliTargets,
  type CliTargetDefinition
} from "./cliTargets";

const definitions: CliTargetDefinition[] = [
  AGENTS_CLI_TARGET,
  {
    id: "trae",
    displayName: "Trae",
    homeDirectoryName: ".trae",
    skillsSubpath: "skills",
    isCommon: true
  },
  {
    id: "rare-agent",
    displayName: "Rare Agent",
    homeDirectoryName: ".rare-agent",
    skillsSubpath: "skills",
    isCommon: false
  }
];

describe("cli target helpers", () => {
  it("splits target definitions into common and other lists", () => {
    expect(splitCliTargets(definitions)).toEqual({
      common: [definitions[0], definitions[1]],
      other: [definitions[2]]
    });
  });

  it("detects targets from home direct-child names only", () => {
    const detected = detectCliTargets(definitions, [
      ".agents",
      ".rare-agent",
      "projects/.trae"
    ]);

    expect(detected.map((target) => [target.id, target.detected])).toEqual([
      ["agents", true],
      ["trae", false],
      ["rare-agent", true]
    ]);
  });

  it("keeps missing cli targets selectable for custom mode", () => {
    const detected = detectCliTargets(definitions, [".agents"]);

    expect(detected.find((target) => target.id === "trae")).toMatchObject({
      detected: false,
      selectableInCustomMode: true,
      linkDestinationParts: [".trae", "skills"]
    });
  });
});

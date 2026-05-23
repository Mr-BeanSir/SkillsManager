import { describe, expect, test } from "vitest";
import { appNavItems } from "./appNav";

describe("appNavItems", () => {
  test("uses the project-only primary navigation", () => {
    expect(appNavItems.map((item) => item.id)).toEqual([
      "projects",
      "skills",
      "discover",
      "groups",
      "settings"
    ]);
  });
});

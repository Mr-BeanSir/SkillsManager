import { describe, expect, test } from "vitest";
import {
  installRepositorySkill,
  repositoryInstallInputFromDiscoverSkill
} from "./repositoryInstallApi";

describe("repositoryInstallApi", () => {
  test("rejects repository installs outside the Tauri runtime", async () => {
    await expect(
      installRepositorySkill({
        source: "https://github.com/vercel-labs/skills",
        skillName: "find-skills"
      })
    ).rejects.toThrow("Open the Tauri app to install repository skills.");
  });

  test("maps a discovered skill into the repository install request", () => {
    expect(
      repositoryInstallInputFromDiscoverSkill({
        sourceRef: "vercel-labs/skills",
        name: "find-skills"
      })
    ).toEqual({
      source: "vercel-labs/skills",
      skillName: "find-skills"
    });
  });
});

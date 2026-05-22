import { afterEach, describe, expect, test, vi } from "vitest";
import {
  getRemoteSkillDetail,
  type RemoteSkillDetailRecord
} from "./remoteSkillDetailApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("remoteSkillDetailApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    invokeMock.mockReset();
  });

  test("rejects outside the Tauri runtime", async () => {
    await expect(
      getRemoteSkillDetail({
        sourceRef: "vercel-labs/skills",
        skillPath: "find-skills",
        fallbackName: "find-skills"
      })
    ).rejects.toThrow("Open the Tauri app to inspect remote skill details.");
  });

  test("requests remote skill detail through the Tauri command", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });

    const detail: RemoteSkillDetailRecord = {
      id: "vercel-labs/skills/find-skills",
      name: "find-skills",
      sourceRef: "vercel-labs/skills",
      sourceUrl: "https://github.com/vercel-labs/skills",
      skillPath: "find-skills",
      summary:
        "Discover and install specialized agent skills from the open ecosystem when users need extended capabilities.",
      installs: "1.6M",
      githubStars: "19.1K",
      firstSeen: "Jan 26, 2026",
      securityAudits: "Gen Agent Trust Hub, Pass, Socket, Pass, Snyk, Warn",
      tags: ["Agent workflows"],
      relatedSkills: [
        {
          name: "skill-creator",
          description: "Create, test, and publish new skills from within your agent",
          sourceRef: "anthropics/skills",
          href: "https://www.skills.sh/anthropics/skills/skill-creator"
        }
      ],
      isOfficial: false
    };
    invokeMock.mockResolvedValue(detail);

    await expect(
      getRemoteSkillDetail({
        sourceRef: "vercel-labs/skills",
        skillPath: "find-skills",
        fallbackName: "find-skills"
      })
    ).resolves.toEqual(detail);

    expect(invokeMock).toHaveBeenCalledWith("get_remote_skill_detail_record", {
      input: {
        sourceRef: "vercel-labs/skills",
        skillPath: "find-skills",
        fallbackName: "find-skills"
      }
    });
  });
});

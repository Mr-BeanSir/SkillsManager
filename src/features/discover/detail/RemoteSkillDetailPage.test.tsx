import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fallbackLocale } from "../../../app/i18n";
import type { RemoteSkillDetailRecord } from "../remoteSkillDetailApi";
import {
  RemoteSkillDetailPage,
  RemoteSkillRelatedList,
  RemoteSkillSummary,
  RemoteSkillStats
} from "./RemoteSkillDetailPage";

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
  securityAudits: "[ Gen Agent Trust HubPass ][17] [ SocketPass ][18] [ SnykWarn ][19]",
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

describe("RemoteSkillStats", () => {
  test("renders the stable remote detail stats", () => {
    const markup = renderToStaticMarkup(
      <RemoteSkillStats catalog={fallbackLocale} detail={detail} language="zh" />
    );

    expect(markup).toContain("GitHub Stars");
    expect(markup).toContain("First Seen");
    expect(markup).toContain("Security Audits");
    expect(markup).toContain("19.1K");
    expect(markup).toContain("Jan 26, 2026");
    expect(markup).toContain("Gen Agent Trust Hub");
    expect(markup).toContain("Socket");
    expect(markup).toContain("Snyk");
    expect(markup).toContain("PASS");
    expect(markup).toContain("WARN");
    expect(markup).toContain("PASS");
    expect(markup).toContain("WARN");
    expect(markup).not.toContain("status-badge");
  });

  test("groups metric highlights separately from the security audit block", () => {
    const markup = renderToStaticMarkup(
      <RemoteSkillStats catalog={fallbackLocale} detail={detail} language="zh" />
    );

    expect(markup).toContain("statsHighlights");
    expect(markup).toContain("statsMetric");
    expect(markup).toContain("statsAuditSection");
    expect(markup).toContain("statsAuditHeader");
  });
});

describe("RemoteSkillDetailPage", () => {
  test("stacks the back action above the install action in the action column", () => {
    const markup = renderToStaticMarkup(
      <RemoteSkillDetailPage
        catalog={fallbackLocale}
        initialSkill={{
          id: "vercel-labs/skills/find-skills",
          name: "find-skills",
          sourceRef: "vercel-labs/skills",
          skillPath: "find-skills"
        }}
        language="en"
        onNavigate={() => undefined}
      />
    );

    expect(markup).toContain("Back to Discover");
    expect(markup).toContain("Install Skill");
    expect(markup).toMatch(/Back to Discover[\s\S]*Install Skill/);
    expect(markup).toMatch(/detailActions[\s\S]*Back to Discover[\s\S]*Install Skill/);
  });
});

describe("RemoteSkillRelatedList", () => {
  test("renders related skills in a separate card list", () => {
    const markup = renderToStaticMarkup(
      <RemoteSkillRelatedList detail={detail} />
    );

    expect(markup).toContain("skill-creator");
    expect(markup).toContain("anthropics/skills");
    expect(markup).toContain("Create, test, and publish new skills from within your agent");
  });

  test("downgrades unsafe remote related descriptions instead of rendering them", () => {
    const markup = renderToStaticMarkup(
      <RemoteSkillRelatedList
        detail={{
          ...detail,
          relatedSkills: [
            {
              name: "unsafe-skill",
              description:
                "**Bold** <script>alert(1)</script> [click me](javascript:alert(1)) <img src=x onerror=alert(1) />",
              sourceRef: "unsafe/source",
              href: "https://www.skills.sh/unsafe/source/unsafe-skill"
            }
          ]
        }}
      />
    );

    expect(markup).toContain("unsafe-skill");
    expect(markup).toContain("Unsafe remote description hidden.");
    expect(markup).not.toContain("&lt;script&gt;");
    expect(markup).not.toContain("javascript:alert(1)");
    expect(markup).not.toContain("onerror=alert(1)");
  });
});

describe("RemoteSkillSummary", () => {
  test("renders sanitized markdown-like summary content", () => {
    const markup = renderToStaticMarkup(
      <RemoteSkillSummary
        summary={"**Title**\n* First point\n* <script>alert(1)</script> safe text"}
      />
    );

    expect(markup).toContain("Title");
    expect(markup).toContain("First point");
    expect(markup).toContain("&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt; safe text");
    expect(markup).not.toContain("<script>alert(1)</script>");
  });
});

import { describe, expect, test } from "vitest";
import {
  containsUnsafeRemoteMarkup,
  getRemoteContentFallback,
  parseRemoteMarkdown
} from "./remoteContent";

describe("containsUnsafeRemoteMarkup", () => {
  test("detects executable-looking remote markup patterns", () => {
    expect(containsUnsafeRemoteMarkup("<script>alert(1)</script>")).toBe(true);
    expect(containsUnsafeRemoteMarkup("[x](javascript:alert(1))")).toBe(true);
    expect(containsUnsafeRemoteMarkup("<img src=x onerror=alert(1) />")).toBe(true);
  });

  test("allows plain markdown-like text", () => {
    expect(containsUnsafeRemoteMarkup("**Bold**\n* bullet")).toBe(false);
  });
});

describe("getRemoteContentFallback", () => {
  test("returns the fallback only when unsafe content must be downgraded", () => {
    expect(
      getRemoteContentFallback({
        allowUnsafeText: false,
        fallback: "Unsafe remote description hidden.",
        value: "<script>alert(1)</script>"
      })
    ).toBe("Unsafe remote description hidden.");

    expect(
      getRemoteContentFallback({
        allowUnsafeText: true,
        fallback: "Unsafe remote description hidden.",
        value: "<script>alert(1)</script>"
      })
    ).toBeNull();

    expect(
      getRemoteContentFallback({
        allowUnsafeText: false,
        fallback: "Unsafe remote description hidden.",
        value: "**Bold**"
      })
    ).toBeNull();
  });
});

describe("parseRemoteMarkdown", () => {
  test("parses paragraphs, bullets, strong text, and escaped html text", () => {
    expect(parseRemoteMarkdown("**Title**\n* First point\n* <script>alert(1)</script> safe text")).toEqual([
      {
        kind: "paragraph",
        segments: [{ strong: true, text: "Title" }]
      },
      {
        kind: "bullet",
        segments: [{ strong: false, text: "First point" }]
      },
      {
        kind: "bullet",
        segments: [{ strong: false, text: "&lt;script&gt;alert(1)&lt;/script&gt; safe text" }]
      }
    ]);
  });
});

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SafeRemoteMarkdownPreview } from "./SafeRemoteMarkdownPreview";

describe("SafeRemoteMarkdownPreview", () => {
  test("renders parsed markdown blocks for safe content", () => {
    const markup = renderToStaticMarkup(
      <SafeRemoteMarkdownPreview
        bulletClassName="bullet"
        lineClassName="line"
        value={"**Title**\n* First point"}
      />
    );

    expect(markup).toContain("Title");
    expect(markup).toContain("First point");
    expect(markup).toContain("bullet");
    expect(markup).toContain("line");
  });

  test("downgrades unsafe remote content to the provided fallback", () => {
    const markup = renderToStaticMarkup(
      <SafeRemoteMarkdownPreview
        fallback="Unsafe remote description hidden."
        value={"**Bold** <script>alert(1)</script>"}
      />
    );

    expect(markup).toContain("Unsafe remote description hidden.");
    expect(markup).not.toContain("&lt;script&gt;");
  });

  test("can allow unsafe-looking text to render as escaped text", () => {
    const markup = renderToStaticMarkup(
      <SafeRemoteMarkdownPreview
        allowUnsafeText
        bulletClassName="bullet"
        lineClassName="line"
        value={"* <script>alert(1)</script> safe text"}
      />
    );

    expect(markup).toContain("&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt; safe text");
    expect(markup).not.toContain("<script>alert(1)</script>");
  });
});

import { describe, expect, test } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fallbackLocale } from "../../i18n";
import { CliTargetsPage } from "./CliTargetsPage";

describe("CliTargetsPage", () => {
  test("renders the cli targets management header and create action", () => {
    const markup = renderToStaticMarkup(
      <CliTargetsPage
        catalog={fallbackLocale}
        language="en"
        onBack={() => undefined}
      />
    );

    expect(markup).toContain("Back to Settings");
    expect(markup).toContain("Manage CLI Targets");
    expect(markup).toContain("Add CLI Target");
  });

  test("renders the create-edit dialog fields when opened", () => {
    const markup = renderToStaticMarkup(
      <CliTargetsPage
        catalog={fallbackLocale}
        initialDraftOpen
        language="en"
        onBack={() => undefined}
      />
    );

    expect(markup).toContain("CLI Target Name");
    expect(markup).toContain("Relative Path");
    expect(markup).toContain("Add CLI Target");
  });
});

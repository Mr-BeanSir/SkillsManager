import { describe, expect, test, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { fallbackLocale } from "../../../app/i18n";
import { DiscoverPage } from "./DiscoverPage";

vi.mock("../settings/settingsApi", () => ({
  readSettings: () => Promise.resolve({ discoverPageSize: 25 })
}));

vi.mock("./discoverApi", () => ({
  discoverEntries: ["all", "trending", "hot"],
  listDiscoverSkills: () =>
    Promise.resolve({
      entry: "all",
      query: "",
      page: 1,
      pageSize: 25,
      totalItems: 0,
      totalPages: 1,
      items: []
    })
}));

vi.mock("./repositoryInstallApi", () => ({
  installRepositorySkill: vi.fn(),
  checkRepositorySkill: vi.fn(),
  repositoryInstallInputFromDiscoverSkill: vi.fn()
}));

describe("DiscoverPage", () => {
  test("renders the repository install entry in the controls header", () => {
    const markup = renderToStaticMarkup(
      <DiscoverPage
        catalog={fallbackLocale}
        language="en"
        onOpenRemoteSkill={() => undefined}
      />
    );

    expect(markup).toContain("Install from Repository / Import from File");
  });
});

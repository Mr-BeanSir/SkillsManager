import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearDiscoverCache,
  discoverEntries,
  discoverStateFromSearchParams,
  discoverStateToSearchParams,
  listDiscoverSkills,
  type DiscoverListState
} from "./discoverApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock
}));

describe("discoverApi", () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, "__TAURI_INTERNALS__");
    clearDiscoverCache();
    invokeMock.mockReset();
  });

  test("returns paginated fixture results for each discovery entry point", async () => {
    const entries: DiscoverListState["entry"][] = ["trending", "hot", "all"];

    for (const entry of entries) {
      const page = await listDiscoverSkills({ entry, page: 1, query: "" });

      expect(page.items.length).toBeGreaterThan(0);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(25);
      expect(page.totalItems).toBeGreaterThanOrEqual(page.items.length);
      expect(page.totalPages).toBeGreaterThanOrEqual(1);
    }
  });

  test("uses discover entries without the search tab and keeps all first", () => {
    expect(discoverEntries).toEqual(["all", "trending", "hot"]);
  });

  test("filters search results by query before paginating", async () => {
    const page = await listDiscoverSkills({
      entry: "search",
      page: 1,
      query: "figma"
    });

    expect(page.items).toHaveLength(1);
    expect(page.items[0].name).toBe("figma");
    expect(page.totalItems).toBe(1);
    expect(page.totalPages).toBe(1);
  });

  test("clamps requested pages into the available range", async () => {
    const firstPage = await listDiscoverSkills({
      entry: "all",
      page: -10,
      query: ""
    });
    const lastPage = await listDiscoverSkills({
      entry: "all",
      page: 99,
      query: ""
    });

    expect(firstPage.page).toBe(1);
    expect(lastPage.page).toBe(lastPage.totalPages);
  });

  test("uses the requested page size for fixture pagination", async () => {
    const page = await listDiscoverSkills({
      entry: "all",
      page: 1,
      query: "",
      pageSize: 3
    });

    expect(page.pageSize).toBe(3);
    expect(page.items).toHaveLength(3);
  });

  test("round-trips URL-like discovery state through search params", () => {
    const state: DiscoverListState = {
      entry: "hot",
      page: 3,
      query: "sqlite"
    };

    const params = discoverStateToSearchParams(state);

    expect(params.toString()).toBe("entry=hot&q=sqlite&page=3");
    expect(discoverStateFromSearchParams(params)).toEqual(state);
  });

  test("uses safe defaults for invalid URL-like discovery state", () => {
    const params = new URLSearchParams("entry=unknown&q=+rust+&page=0");

    expect(discoverStateFromSearchParams(params)).toEqual({
      entry: "all",
      page: 1,
      query: "rust"
    });
  });

  test("uses the Tauri remote discovery command when running in the desktop app", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invokeMock.mockResolvedValue({
      entry: "search",
      query: "figma",
      page: 1,
      pageSize: 25,
      totalItems: 100,
      totalPages: 4,
      items: [
        {
          id: "figma/mcp-server-guide/figma-use",
          name: "figma-use",
          description: null,
          sourceRef: "figma/mcp-server-guide",
          skillPath: "figma-use",
          tags: [],
          installs: 2628,
          updatedAt: null,
          isOfficial: false
        }
      ]
    });

    const page = await listDiscoverSkills({
      entry: "search",
      page: 1,
      query: "figma"
    });

    expect(invokeMock).toHaveBeenCalledWith("list_remote_skill_records", {
      state: {
        entry: "search",
        page: 1,
        query: "figma"
      }
    });
    expect(page.items[0]).toMatchObject({
      id: "figma/mcp-server-guide/figma-use",
      sourceRef: "figma/mcp-server-guide",
      skillPath: "figma-use",
      installs: 2628
    });
  });

  test("caches Tauri results for the all, trending, and hot discovery tabs", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invokeMock.mockResolvedValue({
      entry: "all",
      query: "",
      page: 1,
      pageSize: 25,
      totalItems: 3,
      totalPages: 1,
      items: [
        {
          id: "cached-skill",
          name: "cached-skill",
          description: null,
          sourceRef: "openai/skills",
          skillPath: "cached-skill",
          tags: [],
          installs: 3,
          updatedAt: null,
          isOfficial: true
        }
      ]
    });

    const entries: DiscoverListState["entry"][] = ["all", "trending", "hot"];

    for (const entry of entries) {
      invokeMock.mockClear();

      const state: DiscoverListState = {
        entry,
        page: 1,
        query: ""
      };

      const first = await listDiscoverSkills(state);
      const second = await listDiscoverSkills(state);

      expect(second).toEqual(first);
      expect(invokeMock).toHaveBeenCalledTimes(1);
      expect(invokeMock).toHaveBeenCalledWith("list_remote_skill_records", {
        state
      });
    }
  });

  test("does not cache Tauri search results", async () => {
    Object.defineProperty(globalThis, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {}
    });
    invokeMock.mockResolvedValue({
      entry: "search",
      query: "figma",
      page: 1,
      pageSize: 25,
      totalItems: 1,
      totalPages: 1,
      items: [
        {
          id: "figma",
          name: "figma",
          description: null,
          sourceRef: "openai/skills",
          skillPath: "figma",
          tags: [],
          installs: 10,
          updatedAt: null,
          isOfficial: true
        }
      ]
    });

    const state: DiscoverListState = {
      entry: "search",
      page: 1,
      query: "figma"
    };

    await listDiscoverSkills(state);
    await listDiscoverSkills(state);

    expect(invokeMock).toHaveBeenCalledTimes(2);
  });
});

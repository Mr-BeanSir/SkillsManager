import { invoke } from "@tauri-apps/api/core";
import type { CollectionIndexEntry } from "../collections/collectionsApi";

export type DiscoverEntry = "search" | "trending" | "hot" | "all" | "collections";

export type DiscoverSkill = {
  id: string;
  name: string;
  description: string | null;
  sourceRef: string;
  skillPath: string;
  tags: string[];
  installs: number;
  updatedAt: string | null;
  isOfficial?: boolean;
  version?: string;
};

export type DiscoverListState = {
  entry: DiscoverEntry;
  page: number;
  query: string;
  pageSize?: number;
};

export type DiscoverPageResult = {
  entry: DiscoverEntry;
  query: string;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  items: DiscoverSkill[];
};

export const discoverEntries: DiscoverEntry[] = ["all", "trending", "hot", "collections"];

const defaultFixturePageSize = 25;
const remoteDiscoverCache = new Map<string, Promise<DiscoverPageResult>>();

const fixtureSkills: DiscoverSkill[] = [
  {
    id: "remote:github:codex/figma",
    name: "figma",
    description: "Fetch Figma context, screenshots, variables, and assets.",
    sourceRef: "github.com/codex/skills",
    skillPath: "skills/figma",
    tags: ["design", "ui", "mcp"],
    installs: 2840,
    updatedAt: "2026-05-13T09:30:00.000Z"
  },
  {
    id: "remote:github:codex/test-driven-development",
    name: "test-driven-development",
    description: "Write the failing test first, then implement the smallest passing change.",
    sourceRef: "github.com/codex/superpowers",
    skillPath: "skills/test-driven-development",
    tags: ["testing", "workflow"],
    installs: 2510,
    updatedAt: "2026-05-12T12:10:00.000Z"
  },
  {
    id: "remote:github:codex/verification-before-completion",
    name: "verification-before-completion",
    description: "Require fresh evidence before claiming a task is complete.",
    sourceRef: "github.com/codex/superpowers",
    skillPath: "skills/verification-before-completion",
    tags: ["verification", "workflow"],
    installs: 2304,
    updatedAt: "2026-05-14T08:45:00.000Z"
  },
  {
    id: "remote:github:agent-tools/sqlite-state",
    name: "sqlite-state",
    description: "Model local application state with SQLite migrations and repository tests.",
    sourceRef: "github.com/agent-tools/backend-skills",
    skillPath: "skills/sqlite-state",
    tags: ["sqlite", "rust", "state"],
    installs: 1178,
    updatedAt: "2026-05-08T17:25:00.000Z"
  },
  {
    id: "remote:github:codex/systematic-debugging",
    name: "systematic-debugging",
    description: "Reproduce failures, isolate causes, and fix with evidence.",
    sourceRef: "github.com/codex/superpowers",
    skillPath: "skills/systematic-debugging",
    tags: ["debugging", "tests"],
    installs: 2195,
    updatedAt: "2026-05-11T13:00:00.000Z"
  },
  {
    id: "remote:github:agent-tools/rust-tauri",
    name: "rust-tauri",
    description: "Build Tauri command boundaries where Rust owns local system work.",
    sourceRef: "github.com/agent-tools/desktop-skills",
    skillPath: "skills/rust-tauri",
    tags: ["rust", "tauri", "desktop"],
    installs: 1530,
    updatedAt: "2026-05-09T10:15:00.000Z"
  },
  {
    id: "remote:github:codex/writing-plans",
    name: "writing-plans",
    description: "Convert approved designs into bite-sized implementation plans.",
    sourceRef: "github.com/codex/superpowers",
    skillPath: "skills/writing-plans",
    tags: ["planning", "workflow"],
    installs: 1688,
    updatedAt: "2026-05-10T16:00:00.000Z"
  },
  {
    id: "remote:github:agent-tools/localization",
    name: "localization",
    description: "Externalize product language catalogs with safe fallback behavior.",
    sourceRef: "github.com/agent-tools/frontend-skills",
    skillPath: "skills/localization",
    tags: ["i18n", "frontend"],
    installs: 804,
    updatedAt: "2026-05-07T11:35:00.000Z"
  },
  {
    id: "remote:github:codex/requesting-code-review",
    name: "requesting-code-review",
    description: "Check completed work against requirements before merging.",
    sourceRef: "github.com/codex/superpowers",
    skillPath: "skills/requesting-code-review",
    tags: ["review", "quality"],
    installs: 1422,
    updatedAt: "2026-05-06T14:20:00.000Z"
  }
];

const trendingIds = [
  "remote:github:codex/test-driven-development",
  "remote:github:codex/verification-before-completion",
  "remote:github:codex/systematic-debugging",
  "remote:github:agent-tools/rust-tauri",
  "remote:github:codex/writing-plans"
];

const hotIds = [
  "remote:github:codex/figma",
  "remote:github:agent-tools/sqlite-state",
  "remote:github:agent-tools/localization",
  "remote:github:codex/requesting-code-review",
  "remote:github:agent-tools/rust-tauri"
];

export async function listDiscoverSkills(
  state: DiscoverListState
): Promise<DiscoverPageResult> {
  if (state.entry === "collections") {
    return listCollectionsAsDiscoverPage(state);
  }

  if (isTauriRuntime()) {
    return listRemoteDiscoverSkills(state);
  }

  const pageSize = clampPageSize(state.pageSize);
  const query = state.query.trim();
  const sourceItems = itemsForEntry(state.entry);
  const filteredItems =
    state.entry === "search" && query
      ? sourceItems.filter((item) => matchesQuery(item, query))
      : sourceItems;
  const totalItems = filteredItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clampPage(state.page, totalPages);
  const start = (page - 1) * pageSize;

  return {
    entry: state.entry,
    query,
    page,
    pageSize,
    totalItems,
    totalPages,
    items: filteredItems.slice(start, start + pageSize)
  };
}

export function clearDiscoverCache() {
  remoteDiscoverCache.clear();
}

export function discoverStateToSearchParams(state: DiscoverListState) {
  const params = new URLSearchParams();
  params.set("entry", state.entry);

  const query = state.query.trim();
  if (query) {
    params.set("q", query);
  }

  params.set("page", String(Math.max(1, Math.trunc(state.page))));

  return params;
}

export function discoverStateFromSearchParams(params: URLSearchParams): DiscoverListState {
  const entry = coerceEntry(params.get("entry"));
  const page = Number.parseInt(params.get("page") ?? "1", 10);

  return {
    entry,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    query: (params.get("q") ?? "").trim()
  };
}

async function listCollectionsAsDiscoverPage(
  state: DiscoverListState
): Promise<DiscoverPageResult> {
  const pageSize = clampPageSize(state.pageSize);
  const collections = await invoke<CollectionIndexEntry[]>("list_remote_collections").catch(
    () => []
  );

  const items: DiscoverSkill[] = collections.map((entry) => ({
    id: entry.file,
    name: entry.title,
    description: entry.description,
    sourceRef: entry.file,
    skillPath: String(entry.totalSkills),
    tags: [],
    installs: entry.totalSkills,
    updatedAt: null,
    version: entry.version
  }));

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = clampPage(state.page, totalPages);
  const start = (page - 1) * pageSize;

  return {
    entry: "collections",
    query: "",
    page,
    pageSize,
    totalItems,
    totalPages,
    items: items.slice(start, start + pageSize)
  };
}

function itemsForEntry(entry: DiscoverEntry) {
  if (entry === "trending") {
    return byIds(trendingIds);
  }

  if (entry === "hot") {
    return byIds(hotIds);
  }

  return fixtureSkills;
}

function listRemoteDiscoverSkills(state: DiscoverListState) {
  if (!shouldCacheRemoteDiscoverState(state)) {
    return invoke<DiscoverPageResult>("list_remote_skill_records", { state });
  }

  const cacheKey = remoteDiscoverCacheKey(state);
  const cached = remoteDiscoverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const request = invoke<DiscoverPageResult>("list_remote_skill_records", { state }).catch(
    (reason: unknown) => {
      remoteDiscoverCache.delete(cacheKey);
      throw reason;
    }
  );
  remoteDiscoverCache.set(cacheKey, request);
  return request;
}

function shouldCacheRemoteDiscoverState(state: DiscoverListState) {
  return state.entry === "all" || state.entry === "trending" || state.entry === "hot" || state.entry === "collections";
}

function remoteDiscoverCacheKey(state: DiscoverListState) {
  return JSON.stringify({
    entry: state.entry,
    page: Math.max(1, Math.trunc(state.page)),
    pageSize: clampPageSize(state.pageSize)
  });
}

function byIds(ids: string[]) {
  const skills = new Map(fixtureSkills.map((item) => [item.id, item]));
  return ids.flatMap((id) => {
    const item = skills.get(id);
    return item ? [item] : [];
  });
}

function matchesQuery(skill: DiscoverSkill, query: string) {
  const term = query.toLowerCase();
  return `${skill.name} ${skill.description} ${skill.sourceRef} ${skill.skillPath} ${skill.tags.join(" ")}`
    .toLowerCase()
    .includes(term);
}

function clampPage(page: number, totalPages: number) {
  if (!Number.isFinite(page)) {
    return 1;
  }

  return Math.min(Math.max(1, Math.trunc(page)), totalPages);
}

function clampPageSize(pageSize: number | undefined) {
  if (!Number.isFinite(pageSize)) {
    return defaultFixturePageSize;
  }

  return Math.min(Math.max(1, Math.trunc(pageSize ?? defaultFixturePageSize)), 100);
}

function coerceEntry(value: string | null): DiscoverEntry {
  return value === "trending" || value === "hot" || value === "all" || value === "collections"
    ? value
    : "all";
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

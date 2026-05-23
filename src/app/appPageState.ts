import type { PageId } from "./appNav";

export type AppPageState =
  | PageId
  | `projects/${string}`
  | `groups/${string}`
  | `skills/${string}`
  | `discover/${string}`
  | "settings/cli-targets";

export function projectDetailRoute(projectId: string): AppPageState {
  return `projects/${projectId}`;
}

export function skillDetailRoute(skillId: string): AppPageState {
  return `skills/${skillId}`;
}

export function groupDetailRoute(groupId: string): AppPageState {
  return `groups/${groupId}`;
}

export function remoteSkillDetailRoute(skillId: string): AppPageState {
  return `discover/${skillId}`;
}

export function cliTargetsRoute(): AppPageState {
  return "settings/cli-targets";
}

export function isProjectDetailRoute(page: AppPageState): page is `projects/${string}` {
  return page.startsWith("projects/");
}

export function isSkillDetailRoute(page: AppPageState): page is `skills/${string}` {
  return page.startsWith("skills/");
}

export function isGroupDetailRoute(page: AppPageState): page is `groups/${string}` {
  return page.startsWith("groups/");
}

export function isRemoteSkillDetailRoute(page: AppPageState): page is `discover/${string}` {
  return page.startsWith("discover/");
}

export function isCliTargetsRoute(page: AppPageState): page is "settings/cli-targets" {
  return page === "settings/cli-targets";
}

export function getRouteEntityId(page: AppPageState): string | null {
  if (isProjectDetailRoute(page)) {
    return page.slice("projects/".length);
  }

  if (isGroupDetailRoute(page)) {
    return page.slice("groups/".length);
  }

  if (isSkillDetailRoute(page)) {
    return page.slice("skills/".length);
  }

  if (isRemoteSkillDetailRoute(page)) {
    return page.slice("discover/".length);
  }

  return null;
}

export function getNavPageId(page: AppPageState): PageId {
  if (isProjectDetailRoute(page)) {
    return "projects";
  }

  if (isGroupDetailRoute(page)) {
    return "groups";
  }

  if (isSkillDetailRoute(page)) {
    return "skills";
  }

  if (isRemoteSkillDetailRoute(page)) {
    return "discover";
  }

  if (isCliTargetsRoute(page)) {
    return "settings";
  }

  return page;
}

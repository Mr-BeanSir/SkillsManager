import { describe, expect, test } from "vitest";
import {
  cliTargetsRoute,
  getRouteEntityId,
  getNavPageId,
  groupDetailRoute,
  isCliTargetsRoute,
  isGroupDetailRoute,
  isProjectDetailRoute,
  isRemoteSkillDetailRoute,
  isSkillDetailRoute,
  projectDetailRoute,
  remoteSkillDetailRoute,
  skillDetailRoute
} from "./appPageState";

describe("appPageState", () => {
  test("maps project and skill detail routes back to their primary nav section", () => {
    expect(getNavPageId("projects")).toBe("projects");
    expect(getNavPageId(projectDetailRoute("project-skills-manager"))).toBe("projects");
    expect(getNavPageId("skills")).toBe("skills");
    expect(getNavPageId(skillDetailRoute("skill-grill-with-docs"))).toBe("skills");
    expect(getNavPageId(groupDetailRoute("group-repository-agents"))).toBe("groups");
    expect(getNavPageId(remoteSkillDetailRoute("remote-find-skills"))).toBe("discover");
    expect(getNavPageId(cliTargetsRoute())).toBe("settings");
  });

  test("recognizes project detail routes", () => {
    expect(isProjectDetailRoute("projects")).toBe(false);
    expect(isProjectDetailRoute(projectDetailRoute("project-one"))).toBe(true);
    expect(isProjectDetailRoute(skillDetailRoute("skill-one"))).toBe(false);
  });

  test("recognizes skill detail routes", () => {
    expect(isSkillDetailRoute("skills")).toBe(false);
    expect(isSkillDetailRoute(skillDetailRoute("skill-one"))).toBe(true);
    expect(isSkillDetailRoute(projectDetailRoute("project-one"))).toBe(false);
  });

  test("recognizes group detail routes", () => {
    expect(isGroupDetailRoute("groups")).toBe(false);
    expect(isGroupDetailRoute(groupDetailRoute("group-one"))).toBe(true);
    expect(isGroupDetailRoute(projectDetailRoute("project-one"))).toBe(false);
  });

  test("recognizes remote skill detail routes", () => {
    expect(isRemoteSkillDetailRoute("discover")).toBe(false);
    expect(isRemoteSkillDetailRoute(remoteSkillDetailRoute("skill-one"))).toBe(true);
    expect(isRemoteSkillDetailRoute(skillDetailRoute("skill-one"))).toBe(false);
  });

  test("recognizes the cli target management route", () => {
    expect(isCliTargetsRoute("settings")).toBe(false);
    expect(isCliTargetsRoute(cliTargetsRoute())).toBe(true);
    expect(isCliTargetsRoute(projectDetailRoute("project-one"))).toBe(false);
  });

  test("returns the entity id from project, group, skill, and remote skill detail routes", () => {
    expect(getRouteEntityId(projectDetailRoute("project-one"))).toBe("project-one");
    expect(getRouteEntityId(groupDetailRoute("group-one"))).toBe("group-one");
    expect(getRouteEntityId(skillDetailRoute("skill-one"))).toBe("skill-one");
    expect(getRouteEntityId(remoteSkillDetailRoute("remote-skill-one"))).toBe("remote-skill-one");
    expect(getRouteEntityId(cliTargetsRoute())).toBeNull();
    expect(getRouteEntityId("groups")).toBeNull();
  });
});

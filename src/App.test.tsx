import { describe, expect, test } from "vitest";
import { appNavItems } from "./appNav";
import { fallbackLocale, t } from "./i18n";

describe("App navigation copy", () => {
  test("includes Projects in the primary navigation contract", () => {
    expect(t(fallbackLocale, "en", "nav.projects.label")).toBe("Projects");
    expect(t(fallbackLocale, "en", "nav.projects.description")).toBe(
      "Project roots and activation scope"
    );
  });

  test("removes Directories from the primary navigation", () => {
    expect(appNavItems.map((item) => item.id)).toEqual([
      "projects",
      "skills",
      "discover",
      "groups",
      "settings"
    ]);
  });

  test("includes project detail tab labels", () => {
    expect(t(fallbackLocale, "en", "projects.detail.back")).toBe("Back to Projects");
    expect(t(fallbackLocale, "en", "projects.detail.openDirectory")).toBe(
      "Open Project Directory"
    );
    expect(t(fallbackLocale, "en", "projects.detail.tabs.skills")).toBe("Skills");
    expect(t(fallbackLocale, "en", "projects.detail.tabs.groups")).toBe("Groups");
    expect(t(fallbackLocale, "en", "projects.detail.tabs.targets")).toBe("CLI Targets");
  });

  test("includes project cli target management copy", () => {
    expect(t(fallbackLocale, "en", "projects.detail.targets.add")).toBe("Add CLI Target");
    expect(t(fallbackLocale, "en", "projects.detail.targets.current")).toBe(
      "Current CLI Targets"
    );
  });

  test("includes project-only discover install guidance", () => {
    expect(t(fallbackLocale, "en", "discover.install.success", {
      name: "find-skills",
      source: "vercel-labs/skills"
    })).toBe(
      "find-skills installed from vercel-labs/skills. Add it to a project from the Projects page when you want it active."
    );
  });

  test("includes project-only auto-reconcile settings copy", () => {
    expect(t(fallbackLocale, "en", "settings.reconcile.title")).toBe(
      "Auto-Reconcile"
    );
    expect(t(fallbackLocale, "en", "settings.reconcile.description")).toBe(
      "When enabled, project skill, group, and CLI target changes can reconcile symlinks automatically."
    );
  });

  test("includes startup settings copy", () => {
    expect(t(fallbackLocale, "en", "settings.startup.title")).toBe("Startup");
    expect(t(fallbackLocale, "en", "settings.startup.launchAtStartup.title")).toBe(
      "Launch at startup"
    );
    expect(t(fallbackLocale, "en", "settings.startup.silentStart.title")).toBe(
      "Silent start"
    );
  });

  test("includes settings entry copy for cli target management", () => {
    expect(t(fallbackLocale, "en", "settings.cliTargets.title")).toBe("CLI Targets");
    expect(t(fallbackLocale, "en", "settings.cliTargets.open")).toBe(
      "Manage"
    );
  });

  test("includes cli target management page copy", () => {
    expect(t(fallbackLocale, "en", "cliTargets.title")).toBe("Manage CLI Targets");
    expect(t(fallbackLocale, "en", "cliTargets.form.add")).toBe("Add CLI Target");
    expect(t(fallbackLocale, "en", "cliTargets.form.save")).toBe("Save Changes");
  });

  test("includes language apply copy", () => {
    expect(t(fallbackLocale, "en", "settings.language.apply")).toBe("Apply");
    expect(t(fallbackLocale, "en", "settings.language.selectLabel")).toBe(
      "Available languages"
    );
  });
});

import { invoke } from "@tauri-apps/api/core";

export type DiscoverInstallableSkill = {
  sourceRef: string;
  name: string;
};

export type InstalledSkillSnapshot = {
  id: string;
  name: string;
  sourceType: string;
  sourceRef: string;
  skillPath: string;
  managedDirName: string;
};

export type RepositoryInstallInput = {
  source: string;
  skillName: string;
};

export type RepositorySkillCheckResult = {
  sourceRef: string;
  skillName: string;
  skillPath: string;
  description: string;
};

export function repositoryInstallInputFromDiscoverSkill(
  skill: DiscoverInstallableSkill
): RepositoryInstallInput {
  return {
    source: skill.sourceRef,
    skillName: skill.name
  };
}

export function installRepositorySkill(input: RepositoryInstallInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to install repository skills."));
  }

  return invoke<InstalledSkillSnapshot>("install_repository_skill_record", {
    source: input.source,
    skillName: input.skillName
  });
}

export function checkRepositorySkill(input: RepositoryInstallInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to check repository skills."));
  }

  return invoke<RepositorySkillCheckResult>("check_repository_skill_record", {
    source: input.source,
    skillName: input.skillName
  });
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

import { invoke, Channel } from "@tauri-apps/api/core";

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

export type RepositoryInstallProgress = {
  stage: string;
  message: string;
  current: number | null;
  total: number | null;
};

export type RepositorySkillCheckResult = {
  sourceRef: string;
  skillName: string;
  skillPath: string;
  description: string;
};

export type RepositorySkillCheckAllResult = {
  sourceRef: string;
  total: number;
  names: string[];
};

export type RepositoryCheckOutcome =
  | RepositorySkillCheckResult
  | RepositorySkillCheckAllResult;

export function isCheckAllResult(
  outcome: RepositoryCheckOutcome
): outcome is RepositorySkillCheckAllResult {
  return "total" in outcome && "names" in outcome;
}

export function repositoryInstallInputFromDiscoverSkill(
  skill: DiscoverInstallableSkill
): RepositoryInstallInput {
  return {
    source: skill.sourceRef,
    skillName: skill.name
  };
}

export function installRepositorySkill(
  input: RepositoryInstallInput,
  onProgress?: (progress: RepositoryInstallProgress) => void
) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to install repository skills."));
  }

  const onProgressChannel = new Channel<RepositoryInstallProgress>();
  if (onProgress) {
    onProgressChannel.onmessage = onProgress;
  }

  return invoke<InstalledSkillSnapshot[]>("install_repository_skill_record", {
    source: input.source,
    skillName: input.skillName,
    onProgress: onProgressChannel
  });
}

export function checkRepositorySkill(input: RepositoryInstallInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to check repository skills."));
  }

  return invoke<RepositoryCheckOutcome>("check_repository_skill_record", {
    source: input.source,
    skillName: input.skillName
  });
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

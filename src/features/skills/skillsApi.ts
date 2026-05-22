import { invoke } from "@tauri-apps/api/core";

export type ProjectSkillUsage = {
  projectId: string;
  projectName: string;
  projectPath: string;
  enabled: boolean;
};

export type InstalledSkill = {
  id: string;
  name: string;
  sourceType: string;
  sourceRef: string;
  skillPath: string;
  activeProjectCount: number;
  attachedProjectCount: number;
  projectUsages: ProjectSkillUsage[];
  updateAvailable: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  updatedAt: string;
};

export type SkillUpdateStatusRecord = {
  id: string;
  updateAvailable: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
};

export type SkillUpdateRepositoryErrorRecord = {
  sourceRef: string;
  skillCount: number;
  message: string;
};

export type SkillUpdateBatchResult = {
  statuses: SkillUpdateStatusRecord[];
  repositoryErrors: SkillUpdateRepositoryErrorRecord[];
};

export function listInstalledSkills() {
  if (!isTauriRuntime()) {
    return Promise.resolve([]);
  }

  return invoke<InstalledSkill[]>("list_installed_skill_records");
}

export function checkInstalledSkillUpdates() {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to check installed skill updates."));
  }

  return invoke<SkillUpdateBatchResult>("check_installed_skill_updates_batch_record");
}

export function updateInstalledSkill(skillId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update installed skills."));
  }

  return invoke<SkillUpdateStatusRecord>("update_installed_skill_record", {
    skillId
  });
}

export function updateInstalledSkills(skillIds: string[]) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update installed skills."));
  }

  return invoke<SkillUpdateBatchResult>("update_installed_skills_record", {
    skillIds
  });
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

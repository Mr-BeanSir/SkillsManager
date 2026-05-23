import { invoke } from "@tauri-apps/api/core";

export type ProjectSkillRecord = {
  id: string;
  projectId: string;
  skillId: string;
  skillName: string;
  sourceType: string;
  sourceRef: string;
  skillPath: string;
  enabled: boolean;
  sourceOrigin: string;
  hidden: boolean;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectGroupRecord = {
  id: string;
  projectId: string;
  groupId: string;
  groupName: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listProjectSkills(projectId: string) {
  if (!isTauriRuntime()) {
    return Promise.resolve<ProjectSkillRecord[]>([]);
  }

  return invoke<ProjectSkillRecord[]>("list_project_skill_records", { projectId });
}

export function addProjectSkill(projectId: string, skillId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project skills."));
  }

  return invoke<ProjectSkillRecord>("add_project_skill_record", { projectId, skillId });
}

export function enableProjectSkill(projectId: string, skillId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project skills."));
  }

  return invoke<ProjectSkillRecord>("enable_project_skill_record", { projectId, skillId });
}

export function disableProjectSkill(projectId: string, skillId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project skills."));
  }

  return invoke<ProjectSkillRecord>("disable_project_skill_record", { projectId, skillId });
}

export function removeProjectSkill(projectId: string, skillId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project skills."));
  }

  return invoke<void>("remove_project_skill_record", { projectId, skillId });
}

export function listProjectGroups(projectId: string) {
  if (!isTauriRuntime()) {
    return Promise.resolve<ProjectGroupRecord[]>([]);
  }

  return invoke<ProjectGroupRecord[]>("list_project_group_records", { projectId });
}

export function addProjectGroup(projectId: string, groupId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project groups."));
  }

  return invoke<ProjectGroupRecord>("add_project_group_record", { projectId, groupId });
}

export function enableProjectGroup(projectId: string, groupId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project groups."));
  }

  return invoke<ProjectGroupRecord>("enable_project_group_record", { projectId, groupId });
}

export function disableProjectGroup(projectId: string, groupId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project groups."));
  }

  return invoke<ProjectGroupRecord>("disable_project_group_record", { projectId, groupId });
}

export function removeProjectGroup(projectId: string, groupId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project groups."));
  }

  return invoke<void>("remove_project_group_record", { projectId, groupId });
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

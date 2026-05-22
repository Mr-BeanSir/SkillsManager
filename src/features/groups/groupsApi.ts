import { invoke } from "@tauri-apps/api/core";

export type GroupSkill = {
  id: string;
  name: string;
  sourceType: string;
  sourceRef: string;
  skillPath: string;
};

export type ProjectGroupUsage = {
  projectId: string;
  projectName: string;
  projectPath: string;
  enabled: boolean;
};

export type SkillGroup = {
  id: string;
  name: string;
  skills: GroupSkill[];
  activeProjectCount: number;
  attachedProjectCount: number;
  projectUsages: ProjectGroupUsage[];
  createdAt: string;
  updatedAt: string;
};

export type SkillGroupInput = {
  name: string;
};

export type ReconcileSummary = {
  reconciledLinks: number;
};

export function listSkillGroups() {
  if (!isTauriRuntime()) {
    return Promise.resolve([]);
  }

  return invoke<SkillGroup[]>("list_skill_group_records");
}

export function createSkillGroup(input: SkillGroupInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to save skill groups."));
  }

  return invoke<SkillGroup>("create_skill_group_record", { input });
}

export function deleteSkillGroup(id: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to delete skill groups."));
  }

  return invoke<void>("delete_skill_group_record", { id });
}

export function addSkillToGroup(groupId: string, skillId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to add skills to groups."));
  }

  return invoke<SkillGroup>("add_skill_to_group_record", { groupId, skillId });
}

export async function addSkillsToGroup(groupId: string, skillIds: string[]) {
  let updated: SkillGroup | null = null;

  for (const skillId of skillIds) {
    updated = await addSkillToGroup(groupId, skillId);
  }

  if (!updated) {
    throw new Error("Select at least one skill.");
  }

  return updated;
}

export function removeSkillFromGroup(groupId: string, skillId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update group skills."));
  }

  return invoke<SkillGroup>("remove_skill_from_group_record", { groupId, skillId });
}

export function reconcileProjectGroups() {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update project links."));
  }

  return invoke<ReconcileSummary>("reconcile_project_group_records");
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

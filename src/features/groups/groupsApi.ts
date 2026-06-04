import { invoke, Channel } from "@tauri-apps/api/core";

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
  groupType: string;
  file: string | null;
  description: string;
  version: string | null;
  totalSkills: number;
  skills: GroupSkill[];
  activeProjectCount: number;
  attachedProjectCount: number;
  projectUsages: ProjectGroupUsage[];
  createdAt: string;
  updatedAt: string;
};

export type SkillGroupInput = {
  name: string;
  description?: string;
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

export function updateSkillGroup(id: string, input: SkillGroupInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update skill groups."));
  }

  return invoke<SkillGroup>("update_skill_group_record", { id, input });
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

export type CollectionInstallProgress = {
  stage: string;
  message: string;
  current: number | null;
  total: number | null;
};

export type ExportGroupInput = {
  groupId: string;
  fileName: string;
  title: string;
  description: string;
  exportPath: string;
};

export type ExportGroupResult = {
  filePath: string;
};

export function installCollectionGroup(
  file: string,
  onProgress?: (progress: CollectionInstallProgress) => void
): Promise<SkillGroup> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to install collections."));
  }

  const onProgressChannel = new Channel<CollectionInstallProgress>();
  if (onProgress) {
    onProgressChannel.onmessage = onProgress;
  }

  return invoke<SkillGroup>("install_collection_group_record", {
    file,
    onProgress: onProgressChannel,
  });
}

export function updateCollectionGroup(
  groupId: string,
  onProgress?: (progress: CollectionInstallProgress) => void
): Promise<SkillGroup> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update collections."));
  }

  const onProgressChannel = new Channel<CollectionInstallProgress>();
  if (onProgress) {
    onProgressChannel.onmessage = onProgress;
  }

  return invoke<SkillGroup>("update_collection_group_record", {
    groupId,
    onProgress: onProgressChannel,
  });
}

export function exportGroupToJSON(input: ExportGroupInput): Promise<ExportGroupResult> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to export groups."));
  }

  return invoke<ExportGroupResult>("export_group_to_json", { input });
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

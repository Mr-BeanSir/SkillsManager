import { invoke } from "@tauri-apps/api/core";
import type { ProjectSkillUsage } from "./skillsApi";

export type SkillFileTreeEntry = {
  path: string;
  name: string;
  kind: "file" | "directory";
  editable: boolean;
};

export type SkillDetailRecord = {
  id: string;
  name: string;
  sourceType: string;
  sourceRef: string;
  skillPath: string;
  managedDirName: string;
  managedRootPath: string;
  updateAvailable: boolean;
  installedVersion: string | null;
  latestVersion: string | null;
  attachedProjectCount: number;
  projectUsages: ProjectSkillUsage[];
  fileTree: SkillFileTreeEntry[];
};

export type SkillFileRecord = {
  path: string;
  contents: string;
};

export function getSkillDetail(skillId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to inspect skill details."));
  }

  return invoke<SkillDetailRecord>("get_skill_detail", { skillId });
}

export function readSkillFile(skillId: string, relativePath: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to inspect skill files."));
  }

  return invoke<SkillFileRecord>("read_skill_file", { skillId, relativePath });
}

export function writeSkillFile(skillId: string, relativePath: string, contents: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update skill files."));
  }

  return invoke<void>("write_skill_file", { skillId, relativePath, contents });
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

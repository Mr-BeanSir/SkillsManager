import { invoke } from "@tauri-apps/api/core";

export type CliTargetRecord = {
  id: string;
  displayName: string;
  relativePath: string;
  isCommon: boolean;
};

export type ProjectCliTargetRecord = {
  id: string;
  projectId: string;
  cliTargetId: string;
  displayName: string;
  relativePath: string;
  isCommon: boolean;
  createdAt: string;
  updatedAt: string;
};

export function listAvailableCliTargets() {
  if (!isTauriRuntime()) {
    return Promise.resolve<CliTargetRecord[]>([]);
  }

  return invoke<CliTargetRecord[]>("list_available_cli_target_records");
}

export function listProjectCliTargets(projectId: string) {
  if (!isTauriRuntime()) {
    return Promise.resolve<ProjectCliTargetRecord[]>([]);
  }

  return invoke<ProjectCliTargetRecord[]>("list_project_cli_target_records", {
    projectId
  });
}

export function addProjectCliTarget(projectId: string, cliTargetId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project CLI targets."));
  }

  return invoke<ProjectCliTargetRecord>("add_project_cli_target_record", {
    projectId,
    cliTargetId
  });
}

export function removeProjectCliTarget(projectId: string, cliTargetId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage project CLI targets."));
  }

  return invoke<void>("remove_project_cli_target_record", {
    projectId,
    cliTargetId
  });
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

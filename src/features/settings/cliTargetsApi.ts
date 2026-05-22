import { invoke } from "@tauri-apps/api/core";

export type CliTargetRecord = {
  id: string;
  displayName: string;
  relativePath: string;
  isCommon: boolean;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CliTargetInput = {
  displayName: string;
  relativePath: string;
};

export function listCliTargets() {
  if (!isTauriRuntime()) {
    return Promise.resolve<CliTargetRecord[]>([]);
  }

  return invoke<CliTargetRecord[]>("list_cli_target_records");
}

export function createCliTarget(input: CliTargetInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage CLI targets."));
  }

  return invoke<CliTargetRecord>("create_cli_target_record", { input });
}

export function updateCliTarget(cliTargetId: string, input: CliTargetInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage CLI targets."));
  }

  return invoke<CliTargetRecord>("update_cli_target_record", {
    cliTargetId,
    input
  });
}

export function deleteCliTarget(cliTargetId: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to manage CLI targets."));
  }

  return invoke<void>("delete_cli_target_record", { cliTargetId });
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

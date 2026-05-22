import { invoke } from "@tauri-apps/api/core";

export type CustomDirectory = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type CustomDirectoryInput = {
  name: string;
  path: string;
};

export function listCustomDirectories() {
  if (!isTauriRuntime()) {
    return Promise.resolve([]);
  }

  return invoke<CustomDirectory[]>("list_custom_directory_records");
}

export function createCustomDirectory(input: CustomDirectoryInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to save custom directories."));
  }

  return invoke<CustomDirectory>("create_custom_directory_record", { input });
}

export function updateCustomDirectory(id: string, input: CustomDirectoryInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update custom directories."));
  }

  return invoke<CustomDirectory>("update_custom_directory_record", { id, input });
}

export function deleteCustomDirectory(id: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to delete custom directories."));
  }

  return invoke<void>("delete_custom_directory_record", { id });
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

import { invoke } from "@tauri-apps/api/core";

export type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = {
  name: string;
  path: string;
};

export function listProjects() {
  if (!isTauriRuntime()) {
    return Promise.resolve<ProjectRecord[]>([]);
  }

  return invoke<ProjectRecord[]>("list_project_records");
}

export function createProject(input: ProjectInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to save projects."));
  }

  return invoke<ProjectRecord>("create_project_record", { input });
}

export function getProject(id: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to inspect projects."));
  }

  return invoke<ProjectRecord>("get_project_record", { id });
}

export function deleteProject(id: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to delete projects."));
  }

  return invoke<void>("delete_project_record", { id });
}

export function openProjectDirectory(path: string) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to open project directories."));
  }

  return invoke<void>("open_project_directory", { path });
}

export function selectProjectDirectory() {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to choose a project directory."));
  }

  return invoke<string | null>("select_directory");
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

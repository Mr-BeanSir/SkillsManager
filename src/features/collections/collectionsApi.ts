import { invoke, Channel } from "@tauri-apps/api/core";

export type CollectionIndexEntry = {
  title: string;
  description: string;
  version: string;
  totalSkills: number;
  file: string;
};

export type CollectionSkillEntry = {
  name: string;
  description: string;
  sourceType: string;
  sourceRef: string;
};

export type CollectionDetail = {
  title: string;
  description: string;
  version: string;
  skills: CollectionSkillEntry[];
};

export type InstalledCollectionSkill = {
  id: string;
  name: string;
  sourceType: string;
  sourceRef: string;
  skillPath: string;
};

export type InstalledCollection = {
  id: string;
  file: string;
  title: string;
  description: string;
  version: string;
  totalSkills: number;
  installedAt: string;
  updatedAt: string;
  skills: InstalledCollectionSkill[];
};

export type CollectionInstallProgress = {
  stage: string;
  message: string;
  current: number | null;
  total: number | null;
};

export function listRemoteCollections(): Promise<CollectionIndexEntry[]> {
  if (!isTauriRuntime()) {
    return Promise.resolve([]);
  }
  return invoke<CollectionIndexEntry[]>("list_remote_collections");
}

export function refreshCollectionIndex(): Promise<CollectionIndexEntry[]> {
  if (!isTauriRuntime()) {
    return Promise.resolve([]);
  }
  return invoke<CollectionIndexEntry[]>("refresh_collection_index_record");
}

export function getCollectionDetail(file: string): Promise<CollectionDetail> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to view collection details."));
  }
  return invoke<CollectionDetail>("get_collection_detail_record", { file });
}

export function installCollection(
  file: string,
  onProgress?: (progress: CollectionInstallProgress) => void
): Promise<InstalledCollection> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to install collections."));
  }

  const onProgressChannel = new Channel<CollectionInstallProgress>();
  if (onProgress) {
    onProgressChannel.onmessage = onProgress;
  }

  return invoke<InstalledCollection>("install_collection_record", {
    file,
    onProgress: onProgressChannel
  });
}

export function listInstalledCollections(): Promise<InstalledCollection[]> {
  if (!isTauriRuntime()) {
    return Promise.resolve([]);
  }
  return invoke<InstalledCollection[]>("list_installed_collection_records");
}

export function updateCollection(
  collectionId: string,
  onProgress?: (progress: CollectionInstallProgress) => void
): Promise<InstalledCollection> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to update collections."));
  }

  const onProgressChannel = new Channel<CollectionInstallProgress>();
  if (onProgress) {
    onProgressChannel.onmessage = onProgress;
  }

  return invoke<InstalledCollection>("update_collection_record", {
    collectionId,
    onProgress: onProgressChannel
  });
}

export function deleteCollection(collectionId: string): Promise<void> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to delete collections."));
  }
  return invoke<void>("delete_collection_record", { collectionId });
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

import { invoke } from "@tauri-apps/api/core";

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

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

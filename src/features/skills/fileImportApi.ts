import { invoke, Channel } from "@tauri-apps/api/core";

export type FileImportType = "npx";

export type FileImportProgress = {
  stage: string;
  message: string;
  current: number | null;
  total: number | null;
};

export type FileImportCheckResult = {
  valid: boolean;
  skillCount: number;
  skillNames: string[];
  message: string;
};

export type FileImportInstallResult = {
  id: string;
  name: string;
  sourceType: string;
  sourceRef: string;
  skillPath: string;
};

export function checkFileImport(
  filePath: string,
  fileType: FileImportType
): Promise<FileImportCheckResult> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to check file imports."));
  }

  return invoke<FileImportCheckResult>("check_file_import_record", {
    filePath,
    fileType
  });
}

export function installFromFile(
  filePath: string,
  fileType: FileImportType,
  onProgress?: (progress: FileImportProgress) => void
): Promise<FileImportInstallResult[]> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to install from file."));
  }

  const onProgressChannel = new Channel<FileImportProgress>();
  if (onProgress) {
    onProgressChannel.onmessage = onProgress;
  }

  return invoke<FileImportInstallResult[]>("install_from_file_record", {
    filePath,
    fileType,
    onProgress: onProgressChannel
  });
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

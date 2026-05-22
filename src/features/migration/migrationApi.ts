import { invoke } from "@tauri-apps/api/core";

export type ManualMigrationSkill = {
  id: string;
  linkMode: string;
  name: string;
};

export type ProjectOnlyMigrationReport = {
  alreadyMigrated: boolean;
  backupPath: string;
  manualSkillCount: number;
  manualSkills: ManualMigrationSkill[];
  migratedProjects: number;
  migratedProjectSkills: number;
  nextSteps: string[];
  warnings: string[];
};

export function migrateProjectOnlyDatabase() {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to run the migration."));
  }

  return invoke<ProjectOnlyMigrationReport>("migrate_project_only_database_record");
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

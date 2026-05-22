import { invoke } from "@tauri-apps/api/core";

export type RemoteSkillDetailInput = {
  sourceRef: string;
  skillPath: string;
  fallbackName: string;
};

export type RemoteSkillDetailRecord = {
  id: string;
  name: string;
  sourceRef: string;
  sourceUrl: string;
  skillPath: string;
  summary: string | null;
  installs: string | null;
  githubStars: string | null;
  firstSeen: string | null;
  securityAudits: string | null;
  tags: string[];
  relatedSkills: Array<{
    name: string;
    description: string | null;
    sourceRef: string;
    href: string;
  }>;
  isOfficial: boolean;
};

export function getRemoteSkillDetail(input: RemoteSkillDetailInput) {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error("Open the Tauri app to inspect remote skill details."));
  }

  return invoke<RemoteSkillDetailRecord>("get_remote_skill_detail_record", { input });
}

function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in globalThis;
}

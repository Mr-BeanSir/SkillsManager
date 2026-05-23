import type { SkillGroup } from "../groupsApi";

export function findGroupById(groups: SkillGroup[], groupId: string | null) {
  if (!groupId) {
    return null;
  }

  return groups.find((group) => group.id === groupId) ?? null;
}

export type SkillIdentityInput = {
  name: string;
  sourceType: string;
  sourceRef: string;
  skillPath: string;
};

export function sourceIdentity(input: Omit<SkillIdentityInput, "name">) {
  return `${input.sourceType}|${input.sourceRef}|${input.skillPath}`;
}

export function safeSkillName(name: string) {
  const normalized = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+|[._-]+$/g, "");

  return normalized || "skill";
}

export function shortStableHash(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function skillId(input: Omit<SkillIdentityInput, "name">) {
  return shortStableHash(sourceIdentity(input));
}

export function managedSkillDirectoryName(input: SkillIdentityInput) {
  return `${safeSkillName(input.name)}-${skillId(input)}`;
}

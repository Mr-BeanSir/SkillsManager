export type CliTargetDefinition = {
  id: string;
  displayName: string;
  homeDirectoryName: string;
  skillsSubpath: string;
  isCommon: boolean;
};

export type DetectedCliTarget = CliTargetDefinition & {
  detected: boolean;
  selectableInCustomMode: true;
  linkDestinationParts: string[];
};

export const AGENTS_CLI_TARGET: CliTargetDefinition = {
  id: "agents",
  displayName: "Agents",
  homeDirectoryName: ".agents",
  skillsSubpath: "skills",
  isCommon: true
};

export function splitCliTargets(definitions: CliTargetDefinition[]) {
  return definitions.reduce(
    (groups, definition) => {
      if (definition.isCommon) {
        groups.common.push(definition);
      } else {
        groups.other.push(definition);
      }

      return groups;
    },
    {
      common: [] as CliTargetDefinition[],
      other: [] as CliTargetDefinition[]
    }
  );
}

export function detectCliTargets(
  definitions: CliTargetDefinition[],
  homeChildren: string[]
): DetectedCliTarget[] {
  const directChildNames = new Set(homeChildren);

  return definitions.map((definition) => ({
    ...definition,
    detected: directChildNames.has(definition.homeDirectoryName),
    selectableInCustomMode: true,
    linkDestinationParts: [
      definition.homeDirectoryName,
      ...definition.skillsSubpath.split(/[\\/]+/).filter(Boolean)
    ]
  }));
}

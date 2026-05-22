import type { InstalledSkill } from "./skillsApi";

export type SkillUpdateCheckResult = {
  id: string;
  updateAvailable: boolean;
};

export type SkillUpdateRuntimeState = {
  isCheckingUpdates: boolean;
  checkedSkillIds: Set<string>;
  checkedStatuses: Record<string, boolean>;
  updatingSkillIds: Set<string>;
};

export type SkillUpdateRowView = {
  id: string;
  rowDisabled: boolean;
  showRowUpdateAction: boolean;
  updateLabel: "loading" | "available" | "current" | "updating";
};

export type SkillUpdateRuntimeView = {
  isCheckingUpdates: boolean;
  showUpdateAll: boolean;
  updateAllDisabled: boolean;
  rows: SkillUpdateRowView[];
};

export function buildInitialUpdateRuntimeState(): SkillUpdateRuntimeState {
  return {
    isCheckingUpdates: false,
    checkedSkillIds: new Set<string>(),
    checkedStatuses: {},
    updatingSkillIds: new Set<string>()
  };
}

export function startCheckingUpdates(
  state: SkillUpdateRuntimeState
): SkillUpdateRuntimeState {
  return {
    ...state,
    isCheckingUpdates: true,
    checkedSkillIds: new Set<string>(),
    checkedStatuses: {}
  };
}

export function finishCheckingUpdates(
  state: SkillUpdateRuntimeState,
  results: SkillUpdateCheckResult[]
): SkillUpdateRuntimeState {
  return {
    ...state,
    isCheckingUpdates: false,
    checkedSkillIds: new Set(results.map((result) => result.id)),
    checkedStatuses: Object.fromEntries(
      results.map((result) => [result.id, result.updateAvailable])
    )
  };
}

export function startUpdatingSkill(
  state: SkillUpdateRuntimeState,
  skillId: string
): SkillUpdateRuntimeState {
  const updatingSkillIds = new Set(state.updatingSkillIds);
  updatingSkillIds.add(skillId);

  return {
    ...state,
    updatingSkillIds
  };
}

export function startUpdatingAllSkills(
  state: SkillUpdateRuntimeState,
  skillIds: string[]
): SkillUpdateRuntimeState {
  return {
    ...state,
    updatingSkillIds: new Set(skillIds)
  };
}

export function finishUpdatingSkill(
  state: SkillUpdateRuntimeState,
  result: SkillUpdateCheckResult
): SkillUpdateRuntimeState {
  const updatingSkillIds = new Set(state.updatingSkillIds);
  updatingSkillIds.delete(result.id);

  return {
    ...state,
    updatingSkillIds,
    checkedSkillIds: new Set([...state.checkedSkillIds, result.id]),
    checkedStatuses: {
      ...state.checkedStatuses,
      [result.id]: result.updateAvailable
    }
  };
}

export function buildUpdateRuntimeView(
  skills: InstalledSkill[],
  state: SkillUpdateRuntimeState
): SkillUpdateRuntimeView {
  const checkedStatuses = skills.map((skill) => {
    if (state.checkedSkillIds.has(skill.id)) {
      return state.checkedStatuses[skill.id] ?? false;
    }

    return skill.updateAvailable;
  });
  const hasOutdatedSkills = checkedStatuses.some(Boolean);
  const updateAllDisabled = state.isCheckingUpdates || state.updatingSkillIds.size > 0;

  return {
    isCheckingUpdates: state.isCheckingUpdates,
    showUpdateAll: !state.isCheckingUpdates && hasOutdatedSkills,
    updateAllDisabled,
    rows: skills.map((skill) => {
      const isUpdating = state.updatingSkillIds.has(skill.id);
      const updateAvailable = state.checkedSkillIds.has(skill.id)
        ? state.checkedStatuses[skill.id] ?? false
        : skill.updateAvailable;

      return {
        id: skill.id,
        rowDisabled: isUpdating,
        showRowUpdateAction: updateAvailable && !state.isCheckingUpdates && !isUpdating,
        updateLabel: state.isCheckingUpdates
          ? "loading"
          : isUpdating
            ? "updating"
            : updateAvailable
              ? "available"
              : "current"
      };
    })
  };
}

import { describe, expect, test } from "vitest";
import {
  applyOptimisticRemoval,
  applyOptimisticToggle,
  clearPendingRowId,
  markPendingRowId,
  restoreRemovedRow,
  restoreToggledRow
} from "./projectDetailRowState";
import type { ProjectCliTargetRecord } from "./projectCliTargetsApi";
import type { ProjectGroupRecord } from "./projectDetailApi";

const frontendGroup: ProjectGroupRecord = {
  id: "project-group-frontend",
  projectId: "project-skills-manager",
  groupId: "group-frontend",
  groupName: "Frontend",
  enabled: true,
  createdAt: "2026-05-22T10:00:00.000Z",
  updatedAt: "2026-05-22T10:00:00.000Z"
};

const backendGroup: ProjectGroupRecord = {
  id: "project-group-backend",
  projectId: "project-skills-manager",
  groupId: "group-backend",
  groupName: "Backend",
  enabled: false,
  createdAt: "2026-05-22T10:00:00.000Z",
  updatedAt: "2026-05-22T10:00:00.000Z"
};

const agentsTarget: ProjectCliTargetRecord = {
  id: "project-cli-agents",
  projectId: "project-skills-manager",
  cliTargetId: "agents-skills",
  displayName: "Agents Skills",
  relativePath: ".agents/skills",
  isCommon: true,
  createdAt: "2026-05-22T10:00:00.000Z",
  updatedAt: "2026-05-22T10:00:00.000Z"
};

const codexTarget: ProjectCliTargetRecord = {
  id: "project-cli-codex",
  projectId: "project-skills-manager",
  cliTargetId: "codex-skills",
  displayName: "Codex Skills",
  relativePath: ".codex/skills",
  isCommon: true,
  createdAt: "2026-05-22T10:00:00.000Z",
  updatedAt: "2026-05-22T10:00:00.000Z"
};

describe("projectDetailRowState", () => {
  test("tracks row-local pending ids without duplicating entries", () => {
    const pending = markPendingRowId([], frontendGroup.groupId);
    const duplicated = markPendingRowId(pending, frontendGroup.groupId);

    expect(duplicated).toEqual([frontendGroup.groupId]);
    expect(clearPendingRowId(duplicated, frontendGroup.groupId)).toEqual([]);
  });

  test("applies optimistic group toggles and restores the previous row on rollback", () => {
    const groups = [frontendGroup, backendGroup];
    const optimistic = applyOptimisticToggle(
      groups,
      frontendGroup,
      "groupId",
      compareProjectGroups
    );

    expect(optimistic).toEqual([
      backendGroup,
      {
        ...frontendGroup,
        enabled: false
      }
    ]);

    const restored = restoreToggledRow(
      optimistic,
      frontendGroup,
      "groupId",
      compareProjectGroups
    );
    expect(restored).toEqual([backendGroup, frontendGroup]);
  });

  test("optimistically removes cli target rows and restores them in sorted order on rollback", () => {
    const targets = [codexTarget, agentsTarget];
    const optimistic = applyOptimisticRemoval(targets, agentsTarget.cliTargetId, "cliTargetId");

    expect(optimistic).toEqual([codexTarget]);

    const restored = restoreRemovedRow(
      optimistic,
      agentsTarget,
      compareProjectCliTargets
    );
    expect(restored).toEqual([agentsTarget, codexTarget]);
  });
});

function compareProjectGroups(left: ProjectGroupRecord, right: ProjectGroupRecord) {
  return left.groupName.localeCompare(right.groupName) || left.groupId.localeCompare(right.groupId);
}

function compareProjectCliTargets(
  left: ProjectCliTargetRecord,
  right: ProjectCliTargetRecord
) {
  return (
    Number(right.isCommon) - Number(left.isCommon) ||
    left.displayName.localeCompare(right.displayName) ||
    left.relativePath.localeCompare(right.relativePath)
  );
}

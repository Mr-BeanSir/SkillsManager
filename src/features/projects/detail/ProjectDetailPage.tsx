import {
  ArrowLeft,
  FolderOpen,
  Link,
  MagnifyingGlass,
  Plus,
  Stack,
  Trash
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../../app/i18n";
import { Modal } from "../../../shared/components/Modal";
import styles from "./ProjectDetailPage.module.css";
import { listSkillGroups, type SkillGroup } from "../../groups/groupsApi";
import { listInstalledSkills, type InstalledSkill } from "../../skills/skillsApi";
import {
  buildAttachmentSelectionItems,
  collectPendingAttachmentIds
} from "./projectDetailSelectionModel";
import {
  applyOptimisticRemoval,
  applyOptimisticToggle,
  clearPendingRowId,
  markPendingRowId,
  restoreRemovedRow,
  restoreToggledRow
} from "./projectDetailRowState";
import {
  addProjectGroup,
  addProjectSkill,
  disableProjectGroup,
  disableProjectSkill,
  enableProjectGroup,
  enableProjectSkill,
  listProjectGroups,
  listProjectSkills,
  removeProjectGroup,
  removeProjectSkill,
  type ProjectGroupRecord,
  type ProjectSkillRecord
} from "../projectDetailApi";
import {
  addProjectCliTarget,
  listAvailableCliTargets,
  listProjectCliTargets,
  removeProjectCliTarget,
  type CliTargetRecord,
  type ProjectCliTargetRecord
} from "../projectCliTargetsApi";
import { getProject, openProjectDirectory, type ProjectRecord } from "../projectsApi";

type ProjectDetailPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  projectId: string;
  onBack: () => void;
};

type ProjectDetailTab = "skills" | "groups" | "targets";

export function ProjectDetailPage({
  catalog,
  language,
  projectId,
  onBack
}: ProjectDetailPageProps) {
  const [project, setProject] = useState<ProjectRecord | null>(null);
  const [activeTab, setActiveTab] = useState<ProjectDetailTab>("skills");
  const [projectSkills, setProjectSkills] = useState<ProjectSkillRecord[]>([]);
  const [projectGroups, setProjectGroups] = useState<ProjectGroupRecord[]>([]);
  const [projectCliTargets, setProjectCliTargets] = useState<ProjectCliTargetRecord[]>([]);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [availableGroups, setAvailableGroups] = useState<SkillGroup[]>([]);
  const [availableCliTargets, setAvailableCliTargets] = useState<CliTargetRecord[]>([]);
  const [cliTargetSelectionIds, setCliTargetSelectionIds] = useState<string[]>([]);
  const [isSkillDialogOpen, setIsSkillDialogOpen] = useState(false);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isCliTargetDialogOpen, setIsCliTargetDialogOpen] = useState(false);
  const [skillSelectionIds, setSkillSelectionIds] = useState<string[]>([]);
  const [groupSelectionIds, setGroupSelectionIds] = useState<string[]>([]);
  const [skillSearchQuery, setSkillSearchQuery] = useState("");
  const [groupSearchQuery, setGroupSearchQuery] = useState("");
  const [cliTargetSearchQuery, setCliTargetSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingSkillToggleIds, setPendingSkillToggleIds] = useState<string[]>([]);
  const [pendingGroupActionIds, setPendingGroupActionIds] = useState<string[]>([]);
  const [pendingCliTargetActionIds, setPendingCliTargetActionIds] = useState<string[]>([]);

  useEffect(() => {
    let ignore = false;

    setIsLoading(true);
    setError(null);
    setStatus(null);
    setCliTargetSelectionIds([]);
    setPendingSkillToggleIds([]);
    setPendingGroupActionIds([]);
    setPendingCliTargetActionIds([]);
    setIsSkillDialogOpen(false);
    setIsGroupDialogOpen(false);
    setIsCliTargetDialogOpen(false);
    setSkillSelectionIds([]);
    setGroupSelectionIds([]);
    setSkillSearchQuery("");
    setGroupSearchQuery("");
    setCliTargetSearchQuery("");

    Promise.all([
      getProject(projectId),
      listProjectSkills(projectId),
      listProjectGroups(projectId),
      listProjectCliTargets(projectId),
      listInstalledSkills(),
      listSkillGroups(),
      listAvailableCliTargets()
    ])
      .then(
        ([
          projectRecord,
          skillItems,
          groupItems,
          cliTargetItems,
          installedSkillItems,
          availableGroupItems,
          availableCliTargetItems
        ]) => {
          if (!ignore) {
            setProject(projectRecord);
            setProjectSkills(skillItems);
            setProjectGroups(groupItems);
            setProjectCliTargets(cliTargetItems);
            setInstalledSkills(installedSkillItems);
            setAvailableGroups(availableGroupItems);
            setAvailableCliTargets(availableCliTargetItems);
          }
        }
      )
      .catch((reason: unknown) => {
        if (!ignore) {
          setError(errorMessage(reason));
          setProject(null);
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [projectId]);

  const projectSkillIds = useMemo(
    () => projectSkills.map((skill) => skill.skillId),
    [projectSkills]
  );
  const projectGroupIds = useMemo(
    () => projectGroups.map((group) => group.groupId),
    [projectGroups]
  );
  const skillSelectionItems = useMemo(
    () =>
      buildAttachmentSelectionItems(
        installedSkills.map((skill) => ({ id: skill.id, name: skill.name })),
        projectSkillIds
      ),
    [installedSkills, projectSkillIds]
  );
  const groupSelectionItems = useMemo(
    () =>
      buildAttachmentSelectionItems(
        availableGroups.map((group) => ({ id: group.id, name: group.name })),
        projectGroupIds
      ),
    [availableGroups, projectGroupIds]
  );
  const pendingSkillIds = useMemo(
    () => collectPendingAttachmentIds(skillSelectionIds, projectSkillIds),
    [projectSkillIds, skillSelectionIds]
  );
  const pendingGroupIds = useMemo(
    () => collectPendingAttachmentIds(groupSelectionIds, projectGroupIds),
    [groupSelectionIds, projectGroupIds]
  );
  const filteredSkillSelectionItems = useMemo(() => {
    const query = skillSearchQuery.trim().toLowerCase();

    if (!query) {
      return skillSelectionItems;
    }

    return skillSelectionItems.filter((item) => {
      const installedSkill = installedSkills.find((skill) => skill.id === item.id);
      const haystacks = [
        item.label,
        installedSkill?.skillPath ?? "",
        installedSkill?.sourceRef ?? "",
        installedSkill?.sourceType ?? ""
      ];

      return haystacks.some((value) => value.toLowerCase().includes(query));
    });
  }, [installedSkills, skillSearchQuery, skillSelectionItems]);
  const filteredGroupSelectionItems = useMemo(() => {
    const query = groupSearchQuery.trim().toLowerCase();

    if (!query) {
      return groupSelectionItems;
    }

    return groupSelectionItems.filter((item) => item.label.toLowerCase().includes(query));
  }, [groupSearchQuery, groupSelectionItems]);
  const addableCliTargets = useMemo(() => {
    const currentCliTargetIds = new Set(
      projectCliTargets.map((cliTarget) => cliTarget.cliTargetId)
    );
    return availableCliTargets.filter((cliTarget) => !currentCliTargetIds.has(cliTarget.id));
  }, [availableCliTargets, projectCliTargets]);
  const filteredCliTargets = useMemo(() => {
    const query = cliTargetSearchQuery.trim().toLowerCase();

    if (!query) {
      return addableCliTargets;
    }

    return addableCliTargets.filter((cliTarget) =>
      [cliTarget.displayName, cliTarget.relativePath].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [addableCliTargets, cliTargetSearchQuery]);
  const pendingCliTargetIds = useMemo(
    () =>
      collectPendingAttachmentIds(
        cliTargetSelectionIds,
        projectCliTargets.map((cliTarget) => cliTarget.cliTargetId)
      ),
    [cliTargetSelectionIds, projectCliTargets]
  );

  function openSkillDialog() {
    setSkillSelectionIds(projectSkillIds);
    setSkillSearchQuery("");
    setIsSkillDialogOpen(true);
  }

  function closeSkillDialog() {
    setIsSkillDialogOpen(false);
    setSkillSelectionIds([]);
    setSkillSearchQuery("");
  }

  function openGroupDialog() {
    setGroupSelectionIds(projectGroupIds);
    setGroupSearchQuery("");
    setIsGroupDialogOpen(true);
  }

  function closeGroupDialog() {
    setIsGroupDialogOpen(false);
    setGroupSelectionIds([]);
    setGroupSearchQuery("");
  }

  function openCliTargetDialog() {
    setCliTargetSelectionIds([]);
    setCliTargetSearchQuery("");
    setIsCliTargetDialogOpen(true);
  }

  function closeCliTargetDialog() {
    setIsCliTargetDialogOpen(false);
    setCliTargetSelectionIds([]);
    setCliTargetSearchQuery("");
  }

  function toggleSkillSelection(skillId: string) {
    setSkillSelectionIds((current) =>
      current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId]
    );
  }

  function toggleGroupSelection(groupId: string) {
    setGroupSelectionIds((current) =>
      current.includes(groupId)
        ? current.filter((item) => item !== groupId)
        : [...current, groupId]
    );
  }

  function toggleCliTargetSelection(cliTargetId: string) {
    setCliTargetSelectionIds((current) =>
      current.includes(cliTargetId)
        ? current.filter((item) => item !== cliTargetId)
        : [...current, cliTargetId]
    );
  }

  async function handleAddSkill() {
    if (!project) {
      return;
    }

    if (pendingSkillIds.length === 0) {
      closeSkillDialog();
      setStatus(t(catalog, language, "projects.detail.skills.unchanged"));
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const addedRecords: ProjectSkillRecord[] = [];

      for (const skillId of pendingSkillIds) {
        addedRecords.push(await addProjectSkill(projectId, skillId));
      }

      setProjectSkills((current) => {
        const merged = new Map(current.map((skill) => [skill.skillId, skill]));

        for (const addedRecord of addedRecords) {
          merged.set(addedRecord.skillId, addedRecord);
        }

        return [...merged.values()].sort(compareProjectSkills);
      });
      closeSkillDialog();
      setStatus(
        addedRecords.length === 1
          ? t(catalog, language, "projects.detail.skills.added", {
              name: addedRecords[0].skillName
            })
          : t(catalog, language, "projects.detail.skills.addedBatch", {
              count: String(addedRecords.length)
            })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleSkill(skill: ProjectSkillRecord) {
    if (!project) {
      return;
    }

    const previousSkill = skill;
    const optimisticSkill = {
      ...skill,
      enabled: !skill.enabled
    };

    setPendingSkillToggleIds((current) => [...current, skill.skillId]);
    setError(null);
    setStatus(null);
    replaceProjectSkill(optimisticSkill);

    try {
      const updated = skill.enabled
        ? await disableProjectSkill(projectId, skill.skillId)
        : await enableProjectSkill(projectId, skill.skillId);
      replaceProjectSkill(updated);
      setStatus(
        t(
          catalog,
          language,
          skill.enabled
            ? "projects.detail.skills.disabled"
            : "projects.detail.skills.enabled",
          { name: updated.skillName }
        )
      );
    } catch (reason) {
      replaceProjectSkill(previousSkill);
      setError(errorMessage(reason));
    } finally {
      setPendingSkillToggleIds((current) =>
        current.filter((item) => item !== skill.skillId)
      );
    }
  }

  async function handleRemoveSkill(skill: ProjectSkillRecord) {
    if (!project) {
      return;
    }

    const confirmed = window.confirm(
      t(catalog, language, "projects.detail.skills.removeConfirm", {
        name: skill.skillName
      })
    );

    if (!confirmed) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      await removeProjectSkill(projectId, skill.skillId);
      setProjectSkills((current) =>
        current.filter((item) => item.skillId !== skill.skillId)
      );
      setStatus(
        t(catalog, language, "projects.detail.skills.removed", {
          name: skill.skillName
        })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddGroup() {
    if (!project) {
      return;
    }

    if (pendingGroupIds.length === 0) {
      closeGroupDialog();
      setStatus(t(catalog, language, "projects.detail.groups.unchanged"));
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const addedRecords: ProjectGroupRecord[] = [];

      for (const groupId of pendingGroupIds) {
        addedRecords.push(await addProjectGroup(projectId, groupId));
      }

      const relistedSkills = await listProjectSkills(projectId);
      setProjectGroups((current) => {
        const merged = new Map(current.map((group) => [group.groupId, group]));

        for (const addedRecord of addedRecords) {
          merged.set(addedRecord.groupId, addedRecord);
        }

        return [...merged.values()].sort(compareProjectGroups);
      });
      setProjectSkills(relistedSkills);
      closeGroupDialog();
      setStatus(
        addedRecords.length === 1
          ? t(catalog, language, "projects.detail.groups.added", {
              name: addedRecords[0].groupName
            })
          : t(catalog, language, "projects.detail.groups.addedBatch", {
              count: String(addedRecords.length)
            })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleGroup(group: ProjectGroupRecord) {
    if (!project) {
      return;
    }

    setPendingGroupActionIds((current) => markPendingRowId(current, group.groupId));
    setError(null);
    setStatus(null);
    setProjectGroups((current) =>
      applyOptimisticToggle(current, group, "groupId", compareProjectGroups)
    );

    try {
      const updated = group.enabled
        ? await disableProjectGroup(projectId, group.groupId)
        : await enableProjectGroup(projectId, group.groupId);
      const relistedSkills = await listProjectSkills(projectId);
      replaceProjectGroup(updated);
      setProjectSkills(relistedSkills);
      setStatus(
        t(
          catalog,
          language,
          group.enabled
            ? "projects.detail.groups.disabled"
            : "projects.detail.groups.enabled",
          { name: updated.groupName }
        )
      );
    } catch (reason) {
      setProjectGroups((current) =>
        restoreToggledRow(current, group, "groupId", compareProjectGroups)
      );
      setError(errorMessage(reason));
    } finally {
      setPendingGroupActionIds((current) => clearPendingRowId(current, group.groupId));
    }
  }

  async function handleRemoveGroup(group: ProjectGroupRecord) {
    if (!project) {
      return;
    }

    const confirmed = window.confirm(
      t(catalog, language, "projects.detail.groups.removeConfirm", {
        name: group.groupName
      })
    );

    if (!confirmed) {
      return;
    }

    setPendingGroupActionIds((current) => markPendingRowId(current, group.groupId));
    setError(null);
    setStatus(null);
    setProjectGroups((current) =>
      applyOptimisticRemoval(current, group.groupId, "groupId")
    );

    try {
      await removeProjectGroup(projectId, group.groupId);
      setStatus(
        t(catalog, language, "projects.detail.groups.removed", {
          name: group.groupName
        })
      );
    } catch (reason) {
      setProjectGroups((current) =>
        restoreRemovedRow(current, group, compareProjectGroups)
      );
      setError(errorMessage(reason));
    } finally {
      setPendingGroupActionIds((current) => clearPendingRowId(current, group.groupId));
    }
  }

  async function handleAddCliTarget() {
    if (!project) {
      return;
    }

    if (pendingCliTargetIds.length === 0) {
      closeCliTargetDialog();
      setStatus(t(catalog, language, "projects.detail.targets.unchanged"));
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const addedRecords: ProjectCliTargetRecord[] = [];

      for (const cliTargetId of pendingCliTargetIds) {
        addedRecords.push(await addProjectCliTarget(projectId, cliTargetId));
      }

      setProjectCliTargets((current) => {
        const merged = new Map(current.map((cliTarget) => [cliTarget.cliTargetId, cliTarget]));

        for (const addedRecord of addedRecords) {
          merged.set(addedRecord.cliTargetId, addedRecord);
        }

        return [...merged.values()].sort(compareProjectCliTargets);
      });
      closeCliTargetDialog();
      setStatus(
        addedRecords.length === 1
          ? t(catalog, language, "projects.detail.targets.added", {
              name: addedRecords[0].displayName
            })
          : t(catalog, language, "projects.detail.targets.addedBatch", {
              count: String(addedRecords.length)
            })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleOpenProjectDirectory() {
    if (!project) {
      return;
    }

    setError(null);

    try {
      await openProjectDirectory(project.path);
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function handleRemoveCliTarget(cliTarget: ProjectCliTargetRecord) {
    if (!project) {
      return;
    }

    const confirmed = window.confirm(
      t(catalog, language, "projects.detail.targets.removeConfirm", {
        name: cliTarget.displayName
      })
    );

    if (!confirmed) {
      return;
    }

    setPendingCliTargetActionIds((current) =>
      markPendingRowId(current, cliTarget.cliTargetId)
    );
    setError(null);
    setStatus(null);
    setProjectCliTargets((current) =>
      applyOptimisticRemoval(current, cliTarget.cliTargetId, "cliTargetId")
    );

    try {
      await removeProjectCliTarget(projectId, cliTarget.cliTargetId);
      setStatus(
        t(catalog, language, "projects.detail.targets.removed", {
          name: cliTarget.displayName
        })
      );
    } catch (reason) {
      setProjectCliTargets((current) =>
        restoreRemovedRow(current, cliTarget, compareProjectCliTargets)
      );
      setError(errorMessage(reason));
    } finally {
      setPendingCliTargetActionIds((current) =>
        clearPendingRowId(current, cliTarget.cliTargetId)
      );
    }
  }

  function replaceProjectSkill(updated: ProjectSkillRecord) {
    setProjectSkills((current) =>
      current
        .map((item) => (item.skillId === updated.skillId ? updated : item))
        .sort(compareProjectSkills)
    );
  }

  function replaceProjectGroup(updated: ProjectGroupRecord) {
    setProjectGroups((current) =>
      current
        .map((item) => (item.groupId === updated.groupId ? updated : item))
        .sort(compareProjectGroups)
    );
  }

  if (isLoading && !project) {
    return (
      <section className="page-stack" aria-labelledby="project-detail-title">
        <header className="topbar page-topbar">
          <div>
            <p className={`eyebrow ${styles.detailEyebrow}`}>
              {t(catalog, language, "projects.detail.eyebrow")}
            </p>
            <h1 id="project-detail-title">{t(catalog, language, "projects.detail.loading")}</h1>
          </div>
          <div className={styles.headerActions}>
            <button className="button button-secondary" onClick={onBack} type="button">
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "projects.detail.back")}
            </button>
          </div>
        </header>
      </section>
    );
  }

  if (!project) {
    return (
      <section className="page-stack" aria-labelledby="project-detail-missing-title">
        <header className="topbar page-topbar">
          <div>
            <p className={`eyebrow ${styles.detailEyebrow}`}>
              {t(catalog, language, "projects.detail.eyebrow")}
            </p>
            <h1 id="project-detail-missing-title">
              {t(catalog, language, "projects.detail.missing.title")}
            </h1>
            <p className={styles.detailCopy}>
              {error ?? t(catalog, language, "projects.detail.missing.copy")}
            </p>
          </div>
          <div className={styles.headerActions}>
            <button className="button button-secondary" onClick={onBack} type="button">
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "projects.detail.back")}
            </button>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="page-stack" aria-labelledby="project-detail-title">
      <header className="topbar page-topbar">
        <div>
          <p className={`eyebrow ${styles.detailEyebrow}`}>
            {t(catalog, language, "projects.detail.eyebrow")}
          </p>
          <h1 id="project-detail-title">{project.name}</h1>
          <p className={styles.detailPath}>{project.path}</p>
        </div>
        <div className={styles.headerActions}>
          <button className="button button-secondary" onClick={onBack} type="button">
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            {t(catalog, language, "projects.detail.back")}
          </button>
          <button
            className="button button-secondary"
            onClick={() => void handleOpenProjectDirectory()}
            type="button"
          >
            <FolderOpen size={16} weight="bold" aria-hidden="true" />
            {t(catalog, language, "projects.detail.openDirectory")}
          </button>
        </div>
      </header>

      <section className="stats-grid" aria-label={t(catalog, language, "projects.detail.summaryLabel")}>
        <article className="metric-card">
          <p>{t(catalog, language, "projects.detail.metric.skills")}</p>
          <strong>{projectSkills.length}</strong>
        </article>
        <article className="metric-card">
          <p>{t(catalog, language, "projects.detail.metric.enabledSkills")}</p>
          <strong>{projectSkills.filter((skill) => skill.enabled).length}</strong>
        </article>
        <article className="metric-card">
          <p>{t(catalog, language, "projects.detail.metric.groups")}</p>
          <strong>{projectGroups.length}</strong>
        </article>
        <article className="metric-card">
          <p>{t(catalog, language, "projects.detail.metric.targets")}</p>
          <strong>{projectCliTargets.length}</strong>
        </article>
      </section>

      <section className="panel" aria-labelledby="project-detail-tabs-title">
        <div className="panel-header">
          <div>
            <h2 id="project-detail-tabs-title">
              {t(catalog, language, "projects.detail.title")}
            </h2>
            <p>{t(catalog, language, "projects.detail.description")}</p>
          </div>
          <div className="tab-list" role="tablist" aria-label={t(catalog, language, "projects.detail.tabs.label")}>
            {(
              [
                ["skills", "projects.detail.tabs.skills"],
                ["groups", "projects.detail.tabs.groups"],
                ["targets", "projects.detail.tabs.targets"]
              ] as const
            ).map(([tabId, labelKey]) => (
              <button
                aria-selected={activeTab === tabId}
                className={activeTab === tabId ? "tab-button tab-button-active" : "tab-button"}
                key={tabId}
                onClick={() => setActiveTab(tabId)}
                role="tab"
                type="button"
              >
                {t(catalog, language, labelKey)}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <p className="form-error panel-message" role="alert">
            {error}
          </p>
        ) : null}

        {status ? (
          <p className="form-success panel-message" role="status">
            {status}
          </p>
        ) : null}

        {activeTab === "skills" ? (
          <section className={styles.soloSection} aria-labelledby="project-skills-title">
            <div className={`${styles.sectionHeaderRow} ${styles.sectionHeaderRowStatic}`}>
              <div className={styles.subsectionHeader}>
                <h3 id="project-skills-title">
                  {t(catalog, language, "projects.detail.skills.current")}
                </h3>
                <p>{t(catalog, language, "projects.detail.skills.currentDescription")}</p>
              </div>
              <button
                className="button button-primary"
                disabled={isSaving || installedSkills.length === 0}
                onClick={openSkillDialog}
                type="button"
              >
                <Plus size={16} weight="bold" aria-hidden="true" />
                {t(catalog, language, "projects.detail.skills.add")}
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t(catalog, language, "projects.detail.skills.table.name")}</th>
                    <th scope="col">{t(catalog, language, "projects.detail.skills.table.source")}</th>
                    <th scope="col">{t(catalog, language, "projects.detail.skills.table.status")}</th>
                    <th scope="col">{t(catalog, language, "projects.detail.skills.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={4}>{t(catalog, language, "projects.detail.loading")}</td>
                    </tr>
                  ) : null}

                  {!isLoading && projectSkills.length === 0 ? (
                    <tr>
                      <td colSpan={4}>
                        <div className="empty-state">
                          <Stack size={20} weight="bold" aria-hidden="true" />
                          <strong>{t(catalog, language, "projects.detail.skills.empty.title")}</strong>
                          <p>{t(catalog, language, "projects.detail.skills.empty.copy")}</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {projectSkills.map((skill) => (
                    <tr key={skill.id}>
                      <td>
                        <strong className="table-primary">{skill.skillName}</strong>
                        <span className="table-secondary">{skill.skillPath}</span>
                      </td>
                      <td>
                        <span className="table-primary">{skill.sourceType}</span>
                        <span className="table-secondary">{skill.sourceRef}</span>
                      </td>
                      <td>
                        <span
                          className={
                            skill.enabled
                              ? "status-badge status-current"
                              : "status-badge status-update"
                          }
                        >
                          {t(
                            catalog,
                            language,
                            skill.enabled
                              ? "projects.detail.skills.status.enabled"
                              : "projects.detail.skills.status.disabled"
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="button button-secondary"
                            disabled={pendingSkillToggleIds.includes(skill.skillId)}
                            onClick={() => void handleToggleSkill(skill)}
                            type="button"
                          >
                            {pendingSkillToggleIds.includes(skill.skillId)
                              ? t(catalog, language, "settings.reconcile.saving")
                              : t(
                                  catalog,
                                  language,
                                  skill.enabled
                                    ? "projects.detail.skills.action.disable"
                                    : "projects.detail.skills.action.enable"
                                )}
                          </button>
                          <button
                            aria-label={t(catalog, language, "projects.detail.skills.action.removeLabel", {
                              name: skill.skillName
                            })}
                            className="icon-button danger-button"
                            disabled={
                              isSaving || pendingSkillToggleIds.includes(skill.skillId)
                            }
                            onClick={() => void handleRemoveSkill(skill)}
                            type="button"
                          >
                            <Trash size={18} weight="bold" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "groups" ? (
          <section className={styles.soloSection} aria-labelledby="project-groups-title">
            <div className={`${styles.sectionHeaderRow} ${styles.sectionHeaderRowStatic}`}>
              <div className={styles.subsectionHeader}>
                <h3 id="project-groups-title">
                  {t(catalog, language, "projects.detail.groups.current")}
                </h3>
                <p>{t(catalog, language, "projects.detail.groups.currentDescription")}</p>
              </div>
              <button
                className="button button-primary"
                disabled={isSaving || availableGroups.length === 0}
                onClick={openGroupDialog}
                type="button"
              >
                <Plus size={16} weight="bold" aria-hidden="true" />
                {t(catalog, language, "projects.detail.groups.add")}
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t(catalog, language, "projects.detail.groups.table.name")}</th>
                    <th scope="col">{t(catalog, language, "projects.detail.groups.table.status")}</th>
                    <th scope="col">{t(catalog, language, "projects.detail.groups.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={3}>{t(catalog, language, "projects.detail.loading")}</td>
                    </tr>
                  ) : null}

                  {!isLoading && projectGroups.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="empty-state">
                          <Stack size={20} weight="bold" aria-hidden="true" />
                          <strong>{t(catalog, language, "projects.detail.groups.empty.title")}</strong>
                          <p>{t(catalog, language, "projects.detail.groups.empty.copy")}</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {projectGroups.map((group) => (
                    <tr key={group.id}>
                      <td>
                        <strong className="table-primary">{group.groupName}</strong>
                      </td>
                      <td>
                        <span
                          className={
                            group.enabled
                              ? "status-badge status-current"
                              : "status-badge status-update"
                          }
                        >
                          {t(
                            catalog,
                            language,
                            group.enabled
                              ? "projects.detail.groups.status.enabled"
                              : "projects.detail.groups.status.disabled"
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            className="button button-secondary"
                            disabled={pendingGroupActionIds.includes(group.groupId)}
                            onClick={() => void handleToggleGroup(group)}
                            type="button"
                          >
                            {pendingGroupActionIds.includes(group.groupId)
                              ? t(catalog, language, "settings.reconcile.saving")
                              : t(
                                  catalog,
                                  language,
                                  group.enabled
                                    ? "projects.detail.groups.action.disable"
                                    : "projects.detail.groups.action.enable"
                                )}
                          </button>
                          <button
                            aria-label={t(catalog, language, "projects.detail.groups.action.removeLabel", {
                              name: group.groupName
                            })}
                            className="icon-button danger-button"
                            disabled={pendingGroupActionIds.includes(group.groupId)}
                            onClick={() => void handleRemoveGroup(group)}
                            type="button"
                          >
                            <Trash size={18} weight="bold" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "targets" ? (
          <section className={styles.soloSection} aria-labelledby="project-targets-title">
            <div className={`${styles.sectionHeaderRow} ${styles.sectionHeaderRowStatic}`}>
              <div className={styles.subsectionHeader}>
                <h3 id="project-targets-title">
                  {t(catalog, language, "projects.detail.targets.current")}
                </h3>
                <p>{t(catalog, language, "projects.detail.targets.currentDescription")}</p>
              </div>
              <button
                className="button button-primary"
                disabled={isSaving || addableCliTargets.length === 0}
                onClick={openCliTargetDialog}
                type="button"
              >
                <Plus size={16} weight="bold" aria-hidden="true" />
                {t(catalog, language, "projects.detail.targets.add")}
              </button>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t(catalog, language, "projects.detail.targets.table.name")}</th>
                    <th scope="col">{t(catalog, language, "projects.detail.targets.table.scope")}</th>
                    <th scope="col">{t(catalog, language, "projects.detail.targets.table.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={3}>{t(catalog, language, "projects.detail.loading")}</td>
                    </tr>
                  ) : null}

                  {!isLoading && projectCliTargets.length === 0 ? (
                    <tr>
                      <td colSpan={3}>
                        <div className="empty-state">
                          <Link size={20} weight="bold" aria-hidden="true" />
                          <strong>{t(catalog, language, "projects.detail.targets.empty.title")}</strong>
                          <p>{t(catalog, language, "projects.detail.targets.empty.copy")}</p>
                        </div>
                      </td>
                    </tr>
                  ) : null}

                  {projectCliTargets.map((cliTarget) => (
                    <tr key={cliTarget.id}>
                      <td>
                        <strong className="table-primary">{cliTarget.displayName}</strong>
                        <span className="table-secondary">{cliTarget.relativePath}</span>
                      </td>
                      <td>
                        <span
                          className={
                            cliTarget.isCommon
                              ? "status-badge status-global"
                              : "status-badge status-project"
                          }
                        >
                          {t(
                            catalog,
                            language,
                            cliTarget.isCommon
                              ? "projects.detail.targets.scope.common"
                              : "projects.detail.targets.scope.custom"
                          )}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={t(catalog, language, "projects.detail.targets.action.removeLabel", {
                              name: cliTarget.displayName
                            })}
                            className="icon-button danger-button"
                            disabled={pendingCliTargetActionIds.includes(cliTarget.cliTargetId)}
                            onClick={() => void handleRemoveCliTarget(cliTarget)}
                            type="button"
                          >
                            <Trash size={18} weight="bold" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </section>

      {isSkillDialogOpen ? (
        <Modal
          className={styles.selectionModal}
          description={t(catalog, language, "projects.detail.skills.dialog.copy")}
          title={t(catalog, language, "projects.detail.skills.dialog.title")}
          onClose={closeSkillDialog}
          actions={
            <>
              <button className="button button-secondary" onClick={closeSkillDialog} type="button">
                {t(catalog, language, "projects.form.cancel")}
              </button>
              <button
                className="button button-primary"
                disabled={isSaving || skillSelectionItems.length === 0}
                onClick={() => void handleAddSkill()}
                type="button"
              >
                {t(catalog, language, "projects.detail.skills.add")}
              </button>
            </>
          }
        >
          <div className={styles.selectionDialogBody}>
            <div className={styles.selectionShell}>
              <label className="search-field" htmlFor="project-skill-search">
                <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
                <input
                  id="project-skill-search"
                  name="project-skill-search"
                  onChange={(event) => setSkillSearchQuery(event.target.value)}
                  placeholder={t(catalog, language, "projects.detail.skills.dialog.searchPlaceholder")}
                  spellCheck={false}
                  type="search"
                  value={skillSearchQuery}
                />
              </label>

              {skillSelectionItems.length === 0 ? (
                <div className={`empty-state ${styles.selectionEmptyState}`}>
                  <strong>{t(catalog, language, "projects.detail.skills.dialog.empty")}</strong>
                </div>
              ) : filteredSkillSelectionItems.length === 0 ? (
                <div className={`empty-state ${styles.selectionEmptyState}`}>
                  <strong>{t(catalog, language, "projects.detail.skills.dialog.searchEmpty")}</strong>
                </div>
              ) : (
                <div className={styles.selectionList} role="list">
                  {filteredSkillSelectionItems.map((item) => {
                    const installedSkill = installedSkills.find((skill) => skill.id === item.id);

                    return (
                      <label
                        className={
                          item.disabled
                            ? `${styles.selectionRow} ${styles.selectionRowDisabled}`
                            : styles.selectionRow
                        }
                        key={item.id}
                      >
                        <input
                          checked={skillSelectionIds.includes(item.id)}
                          disabled={item.disabled}
                          name="project-skill-selection"
                          onChange={() => toggleSkillSelection(item.id)}
                          type="checkbox"
                          value={item.id}
                        />
                        <span>
                          <strong>{item.label}</strong>
                          <small>
                            {item.disabled
                              ? t(catalog, language, "projects.detail.skills.dialog.attached")
                              : installedSkill?.skillPath ?? installedSkill?.sourceRef ?? ""}
                          </small>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </Modal>
      ) : null}

      {isGroupDialogOpen ? (
        <Modal
          className={styles.selectionModal}
          description={t(catalog, language, "projects.detail.groups.dialog.copy")}
          title={t(catalog, language, "projects.detail.groups.dialog.title")}
          onClose={closeGroupDialog}
          actions={
            <>
              <button className="button button-secondary" onClick={closeGroupDialog} type="button">
                {t(catalog, language, "projects.form.cancel")}
              </button>
              <button
                className="button button-primary"
                disabled={isSaving || groupSelectionItems.length === 0}
                onClick={() => void handleAddGroup()}
                type="button"
              >
                {t(catalog, language, "projects.detail.groups.add")}
              </button>
            </>
          }
        >
          <div className={styles.selectionDialogBody}>
            <div className={styles.selectionShell}>
              <label className="search-field" htmlFor="project-group-search">
                <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
                <input
                  id="project-group-search"
                  name="project-group-search"
                  onChange={(event) => setGroupSearchQuery(event.target.value)}
                  placeholder={t(catalog, language, "projects.detail.groups.dialog.searchPlaceholder")}
                  spellCheck={false}
                  type="search"
                  value={groupSearchQuery}
                />
              </label>

              {groupSelectionItems.length === 0 ? (
                <div className={`empty-state ${styles.selectionEmptyState}`}>
                  <strong>{t(catalog, language, "projects.detail.groups.dialog.empty")}</strong>
                </div>
              ) : filteredGroupSelectionItems.length === 0 ? (
                <div className={`empty-state ${styles.selectionEmptyState}`}>
                  <strong>{t(catalog, language, "projects.detail.groups.dialog.searchEmpty")}</strong>
                </div>
              ) : (
                <div className={styles.selectionList} role="list">
                  {filteredGroupSelectionItems.map((item) => (
                    <label
                      className={
                        item.disabled
                          ? `${styles.selectionRow} ${styles.selectionRowDisabled}`
                          : styles.selectionRow
                      }
                      key={item.id}
                    >
                      <input
                        checked={groupSelectionIds.includes(item.id)}
                        disabled={item.disabled}
                        name="project-group-selection"
                        onChange={() => toggleGroupSelection(item.id)}
                        type="checkbox"
                        value={item.id}
                      />
                      <span>
                        <strong>{item.label}</strong>
                        <small>
                          {item.disabled
                            ? t(catalog, language, "projects.detail.groups.dialog.attached")
                            : t(catalog, language, "projects.detail.groups.description")}
                        </small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      ) : null}

      {isCliTargetDialogOpen ? (
        <Modal
          className={styles.selectionModal}
          description={t(catalog, language, "projects.detail.targets.dialog.copy")}
          title={t(catalog, language, "projects.detail.targets.dialog.title")}
          onClose={closeCliTargetDialog}
          actions={
            <>
              <button className="button button-secondary" onClick={closeCliTargetDialog} type="button">
                {t(catalog, language, "projects.form.cancel")}
              </button>
              <button
                className="button button-primary"
                disabled={isSaving || pendingCliTargetIds.length === 0}
                onClick={() => void handleAddCliTarget()}
                type="button"
              >
                {t(catalog, language, "projects.detail.targets.add")}
              </button>
            </>
          }
        >
          <div className={styles.selectionDialogBody}>
            <div className={styles.selectionShell}>
              <label className="search-field" htmlFor="project-cli-target-search">
                <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
                <input
                  id="project-cli-target-search"
                  name="project-cli-target-search"
                  onChange={(event) => setCliTargetSearchQuery(event.target.value)}
                  placeholder={t(catalog, language, "projects.detail.targets.dialog.searchPlaceholder")}
                  spellCheck={false}
                  type="search"
                  value={cliTargetSearchQuery}
                />
              </label>

              {addableCliTargets.length === 0 ? (
                <div className={`empty-state ${styles.selectionEmptyState}`}>
                  <strong>{t(catalog, language, "projects.detail.targets.dialog.empty")}</strong>
                </div>
              ) : filteredCliTargets.length === 0 ? (
                <div className={`empty-state ${styles.selectionEmptyState}`}>
                  <strong>{t(catalog, language, "projects.detail.targets.dialog.searchEmpty")}</strong>
                </div>
              ) : (
                <div className={styles.selectionList} role="list">
                  {filteredCliTargets.map((cliTarget) => (
                    <label className={styles.selectionRow} key={cliTarget.id}>
                      <input
                        checked={cliTargetSelectionIds.includes(cliTarget.id)}
                        name="project-cli-target-selection"
                        onChange={() => toggleCliTargetSelection(cliTarget.id)}
                        type="checkbox"
                        value={cliTarget.id}
                      />
                      <span>
                        <strong>{cliTarget.displayName}</strong>
                        <small>{cliTarget.relativePath}</small>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function compareProjectSkills(left: ProjectSkillRecord, right: ProjectSkillRecord) {
  return (
    left.skillName.localeCompare(right.skillName) ||
    left.sourceRef.localeCompare(right.sourceRef) ||
    left.skillPath.localeCompare(right.skillPath)
  );
}

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

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

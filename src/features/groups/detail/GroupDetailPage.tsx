import { ArrowLeft, ArrowRight, ArrowSquareOut, Check, NotePencil } from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../../app/i18n";
import { FormDialog } from "../../../shared/components/FormDialog";
import { listInstalledSkills, type InstalledSkill } from "../../skills/skillsApi";
import {
  addSkillsToGroup,
  listSkillGroups,
  removeSkillFromGroup,
  updateSkillGroup,
  type SkillGroup
} from "../groupsApi";
import styles from "../home/GroupsPage.module.css";

type GroupDetailPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  group: SkillGroup | null;
  installedSkills: InstalledSkill[];
  error: string | null;
  status: string | null;
  isSaving: boolean;
  onBack: () => void;
  onOpenProject: (projectId: string) => void;
  onSyncSkills: (skillIds: string[]) => Promise<void>;
  onUpdateGroup: (name: string, description: string) => Promise<void>;
};

export function GroupDetailPage({
  catalog,
  language,
  group,
  installedSkills,
  error,
  status,
  isSaving,
  onBack,
  onOpenProject,
  onSyncSkills,
  onUpdateGroup
}: GroupDetailPageProps) {
  const [draftSkillIds, setDraftSkillIds] = useState<string[]>(
    () => group?.skills.map((skill) => skill.id) ?? []
  );
  const [selectedAvailableSkillIds, setSelectedAvailableSkillIds] = useState<string[]>([]);
  const [selectedGroupSkillIds, setSelectedGroupSkillIds] = useState<string[]>([]);
  const [availableSearch, setAvailableSearch] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    setDraftSkillIds(group?.skills.map((skill) => skill.id) ?? []);
    setSelectedAvailableSkillIds([]);
    setSelectedGroupSkillIds([]);
    setAvailableSearch("");
    setGroupSearch("");
  }, [group?.id, group?.skills]);

  const currentSkillIds = useMemo(
    () => group?.skills.map((skill) => skill.id) ?? [],
    [group]
  );
  const draftSkillIdSet = useMemo(() => new Set(draftSkillIds), [draftSkillIds]);
  const currentSkillIdSet = useMemo(() => new Set(currentSkillIds), [currentSkillIds]);
  const availableSkills = useMemo(
    () => installedSkills.filter((skill) => !draftSkillIdSet.has(skill.id)),
    [draftSkillIdSet, installedSkills]
  );
  const groupedSkills = useMemo(
    () => installedSkills.filter((skill) => draftSkillIdSet.has(skill.id)),
    [draftSkillIdSet, installedSkills]
  );
  const filteredAvailableSkills = useMemo(
    () => filterSkills(availableSkills, availableSearch),
    [availableSearch, availableSkills]
  );
  const filteredGroupedSkills = useMemo(
    () => filterSkills(groupedSkills, groupSearch),
    [groupSearch, groupedSkills]
  );
  const hasPendingChanges = useMemo(() => {
    if (draftSkillIds.length !== currentSkillIds.length) {
      return true;
    }

    return draftSkillIds.some((skillId) => !currentSkillIdSet.has(skillId));
  }, [currentSkillIdSet, currentSkillIds.length, draftSkillIds]);
  const pendingAddedCount = useMemo(
    () => draftSkillIds.filter((skillId) => !currentSkillIdSet.has(skillId)).length,
    [currentSkillIdSet, draftSkillIds]
  );
  const pendingRemovedCount = useMemo(
    () => currentSkillIds.filter((skillId) => !draftSkillIdSet.has(skillId)).length,
    [currentSkillIds, draftSkillIdSet]
  );
  const pendingChangeCount = pendingAddedCount + pendingRemovedCount;

  useEffect(() => {
    if (!hasPendingChanges) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasPendingChanges]);

  function toggleAvailableSkill(skillId: string) {
    setSelectedAvailableSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId]
    );
  }

  function toggleGroupSkill(skillId: string) {
    setSelectedGroupSkillIds((current) =>
      current.includes(skillId)
        ? current.filter((item) => item !== skillId)
        : [...current, skillId]
    );
  }

  function moveToGroup() {
    if (selectedAvailableSkillIds.length === 0) {
      return;
    }

    setDraftSkillIds((current) => [...current, ...selectedAvailableSkillIds]);
    setSelectedAvailableSkillIds([]);
  }

  function moveToAvailable() {
    if (selectedGroupSkillIds.length === 0) {
      return;
    }

    setDraftSkillIds((current) =>
      current.filter((skillId) => !selectedGroupSkillIds.includes(skillId))
    );
    setSelectedGroupSkillIds([]);
  }

  async function handleSaveSkills() {
    if (!hasPendingChanges) {
      return;
    }

    await onSyncSkills(draftSkillIds);
  }

  function openEditDialog() {
    if (!group) return;
    setEditName(group.name);
    setEditDescription(group.description);
    setIsEditOpen(true);
  }

  async function handleUpdateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onUpdateGroup(editName, editDescription);
    setIsEditOpen(false);
  }

  if (!group) {
    return (
      <section className="page-stack" aria-labelledby="group-detail-missing-title">
        <header className="topbar page-topbar">
          <div>
            <p className="eyebrow">{t(catalog, language, "groups.eyebrow")}</p>
            <h1 id="group-detail-missing-title">
              {t(catalog, language, "groups.detail.missing.title")}
            </h1>
            <p className={styles.detailCopy}>{error ?? t(catalog, language, "groups.detail.missing.copy")}</p>
          </div>
          <div className={styles.detailActions}>
            <button className="button button-secondary" onClick={onBack} type="button">
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "groups.detail.back")}
            </button>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="page-stack" aria-labelledby="group-detail-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "groups.eyebrow")}</p>
          <h1 id="group-detail-title">
            {t(catalog, language, "groups.detail.title", {
              name: group.name
            })}
          </h1>
          <p className={styles.detailCopy}>{group.description || t(catalog, language, "groups.detail.noDescription")}</p>
        </div>
        <div className={styles.detailActions}>
          <button className="button button-secondary" onClick={onBack} type="button">
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            {t(catalog, language, "groups.detail.back")}
          </button>
          <button className="button button-secondary" onClick={openEditDialog} type="button">
            <NotePencil size={16} weight="bold" aria-hidden="true" />
            {t(catalog, language, "groups.detail.editInfo")}
          </button>
        </div>
      </header>

      {error ? (
        <p className="form-error panel-message" role="alert">
          {error}
        </p>
      ) : null}

      {status ? (
        <p aria-live="polite" className="form-success panel-message" role="status">
          {status}
        </p>
      ) : null}

      <section className={styles.summaryGrid} aria-label={t(catalog, language, "groups.detail.summaryLabel")}>
        <article className={styles.summaryCard}>
          <p>{t(catalog, language, "groups.usage.summary.skills")}</p>
          <strong>{group.skills.length}</strong>
        </article>
        <article className={styles.summaryCard}>
          <p>{t(catalog, language, "groups.usage.summary.projects")}</p>
          <strong>{group.attachedProjectCount}</strong>
        </article>
        <article className={styles.summaryCard}>
          <p>{t(catalog, language, "groups.usage.summary.activeProjects")}</p>
          <strong>{group.activeProjectCount}</strong>
        </article>
        <article className={styles.summaryCard}>
          <p>{t(catalog, language, "groups.detail.metric.pending")}</p>
          <strong>
            {t(catalog, language, "groups.detail.metric.pendingValue", {
              count: pendingChangeCount
            })}
          </strong>
        </article>
      </section>

      <section className="panel" aria-labelledby="group-skills-title">
        <div className={`panel-header ${styles.editorHeader}`}>
          <div>
            <h2 id="group-skills-title">{t(catalog, language, "groups.skills.title")}</h2>
            <p>{t(catalog, language, "groups.skills.description")}</p>
          </div>
          <div className={styles.editorActions}>
            <button
              className="button button-primary"
              disabled={isSaving || !hasPendingChanges}
              onClick={() => void handleSaveSkills()}
              type="button"
            >
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "groups.skills.save")}
            </button>
          </div>
        </div>

        <div className={styles.transferLayout}>
          <section className={styles.transferPanel} aria-labelledby="group-available-skills-title">
            <div className={styles.transferPanelHeader}>
              <div className={styles.transferPanelHeading}>
                <h3 id="group-available-skills-title">
                  {t(catalog, language, "groups.skills.select")}
                </h3>
              </div>
              <label className={styles.transferSearchInline}>
                <input
                  aria-label={t(catalog, language, "groups.skills.searchInstalledLabel")}
                  autoComplete="off"
                  name="available-skills-search"
                  onChange={(event) => setAvailableSearch(event.target.value)}
                  placeholder={t(catalog, language, "groups.skills.searchInstalledPlaceholder")}
                  spellCheck={false}
                  value={availableSearch}
                />
              </label>
            </div>
            <div
              className={styles.transferList}
              role="list"
              aria-label={t(catalog, language, "groups.skills.select")}
            >
              {filteredAvailableSkills.length === 0 ? (
                <p className={styles.mutedCopy}>
                  {availableSearch.trim().length > 0
                    ? t(catalog, language, "groups.skills.noneMatching")
                    : t(catalog, language, "groups.skills.noneAvailable")}
                </p>
              ) : null}
              {filteredAvailableSkills.map((skill) => (
                <label className={styles.transferRow} key={skill.id}>
                  <input
                    checked={selectedAvailableSkillIds.includes(skill.id)}
                    name="available-group-skill-id"
                    onChange={() => toggleAvailableSkill(skill.id)}
                    type="checkbox"
                    value={skill.id}
                  />
                  <span>
                    <strong>{skill.name}</strong>
                    <small>{skill.skillPath}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className={styles.transferPanelFooter}>
              <span className="table-secondary">
                {t(catalog, language, "groups.skills.count", {
                  count: filteredAvailableSkills.length
                })}
              </span>
            </div>
          </section>

          <div className={styles.transferControls}>
            <button
              aria-label={t(catalog, language, "groups.skills.moveToGroup")}
              className="button button-secondary"
              disabled={isSaving || selectedAvailableSkillIds.length === 0}
              onClick={moveToGroup}
              type="button"
            >
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "groups.skills.moveRight")}
            </button>
            <button
              aria-label={t(catalog, language, "groups.skills.moveToAvailable")}
              className="button button-secondary"
              disabled={isSaving || selectedGroupSkillIds.length === 0}
              onClick={moveToAvailable}
              type="button"
            >
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "groups.skills.moveLeft")}
            </button>
          </div>

          <section className={styles.transferPanel} aria-labelledby="group-current-skills-title">
            <div className={styles.transferPanelHeader}>
              <div className={styles.transferPanelHeading}>
                <h3 id="group-current-skills-title">
                  {t(catalog, language, "groups.skills.current")}
                </h3>
              </div>
              <label className={styles.transferSearchInline}>
                <input
                  aria-label={t(catalog, language, "groups.skills.searchGroupLabel")}
                  autoComplete="off"
                  name="group-skills-search"
                  onChange={(event) => setGroupSearch(event.target.value)}
                  placeholder={t(catalog, language, "groups.skills.searchGroupPlaceholder")}
                  spellCheck={false}
                  value={groupSearch}
                />
              </label>
            </div>
            <div
              className={styles.transferList}
              role="list"
              aria-label={t(catalog, language, "groups.skills.current")}
            >
              {filteredGroupedSkills.length === 0 ? (
                <p className={styles.mutedCopy}>
                  {groupSearch.trim().length > 0
                    ? t(catalog, language, "groups.skills.noneMatching")
                    : t(catalog, language, "groups.skills.empty")}
                </p>
              ) : null}
              {filteredGroupedSkills.map((skill) => (
                <label className={styles.transferRow} key={skill.id}>
                  <input
                    checked={selectedGroupSkillIds.includes(skill.id)}
                    name="group-skill-id"
                    onChange={() => toggleGroupSkill(skill.id)}
                    type="checkbox"
                    value={skill.id}
                  />
                  <span>
                    <strong>{skill.name}</strong>
                    <small>{skill.skillPath}</small>
                  </span>
                </label>
              ))}
            </div>
            <div className={styles.transferPanelFooter}>
              <span className="table-secondary">
                {t(catalog, language, "groups.skills.count", {
                  count: filteredGroupedSkills.length
                })}
              </span>
            </div>
          </section>
        </div>
      </section>

      <section className="panel" aria-labelledby="group-project-usage-title">
        <div className="panel-header">
          <div>
            <h2 id="group-project-usage-title">
              {t(catalog, language, "groups.usage.projectsTitle")}
            </h2>
            <p>{t(catalog, language, "groups.usage.projectsDescription")}</p>
          </div>
          <span className="table-secondary">
            {t(catalog, language, "groups.usage.summary.projectsValue", {
              count: group.projectUsages.length
            })}
          </span>
        </div>

        {group.projectUsages.length === 0 ? (
          <div className={`empty-state ${styles.compactEmptyState}`}>
            <strong>{t(catalog, language, "groups.usage.empty.title")}</strong>
            <p>{t(catalog, language, "groups.usage.empty.copy")}</p>
          </div>
        ) : (
          <div className={styles.usageList}>
            {group.projectUsages.map((usage) => (
              <div className="compact-list-row compact-list-row-action" key={usage.projectId}>
                <div>
                  <strong>{usage.projectName}</strong>
                  <span className="path-cell">{usage.projectPath}</span>
                </div>
                <div className={styles.usageActions}>
                  <span
                    className={`status-badge ${
                      usage.enabled ? "status-current" : "status-project"
                    }`}
                  >
                    {t(
                      catalog,
                      language,
                      usage.enabled
                        ? "groups.usage.projectStatus.enabled"
                        : "groups.usage.projectStatus.disabled"
                    )}
                  </span>
                  <button
                    aria-label={t(catalog, language, "groups.usage.openProject", {
                      name: usage.projectName
                    })}
                    className="icon-button"
                    onClick={() => onOpenProject(usage.projectId)}
                    type="button"
                  >
                    <ArrowSquareOut size={18} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {isEditOpen ? (
        <FormDialog
          cancelLabel={t(catalog, language, "groups.form.cancel")}
          description={t(catalog, language, "groups.detail.editDescription")}
          disabled={isSaving}
          formClassName={styles.createModalForm}
          submitIcon={<Check size={16} weight="bold" aria-hidden="true" />}
          submitLabel={
            isSaving
              ? t(catalog, language, "groups.form.saving")
              : t(catalog, language, "groups.detail.editSave")
          }
          title={t(catalog, language, "groups.detail.editTitle")}
          onCancel={() => setIsEditOpen(false)}
          onSubmit={handleUpdateGroup}
        >
          <label className="field">
            <span>{t(catalog, language, "groups.form.name")}</span>
            <input
              autoComplete="off"
              name="group-name"
              onChange={(event) => setEditName(event.target.value)}
              placeholder={t(catalog, language, "groups.form.namePlaceholder")}
              required
              value={editName}
            />
          </label>
          <label className="field">
            <span>{t(catalog, language, "groups.form.descriptionLabel")}</span>
            <textarea
              autoComplete="off"
              name="group-description"
              onChange={(event) => setEditDescription(event.target.value)}
              placeholder={t(catalog, language, "groups.form.descriptionPlaceholder")}
              rows={3}
              value={editDescription}
            />
          </label>
        </FormDialog>
      ) : null}
    </section>
  );
}

type ConnectedGroupDetailPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  groupId: string;
  onBack: () => void;
  onOpenProject: (projectId: string) => void;
};

export function ConnectedGroupDetailPage({
  catalog,
  language,
  groupId,
  onBack,
  onOpenProject
}: ConnectedGroupDetailPageProps) {
  const [groups, setGroups] = useState<SkillGroup[]>([]);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let ignore = false;

    setIsLoading(true);
    setError(null);

    Promise.all([listSkillGroups(), listInstalledSkills()])
      .then(([groupItems, skillItems]) => {
        if (!ignore) {
          setGroups(groupItems);
          setInstalledSkills(skillItems);
        }
      })
      .catch((reason: unknown) => {
        if (!ignore) {
          setError(errorMessage(reason));
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
  }, [groupId]);

  const group = useMemo(
    () => groups.find((item) => item.id === groupId) ?? null,
    [groups, groupId]
  );

  async function handleSyncSkills(skillIds: string[]) {
    if (!group) {
      return;
    }

    const currentSkillIds = group.skills.map((skill) => skill.id);
    const currentSkillIdSet = new Set(currentSkillIds);
    const desiredSkillIdSet = new Set(skillIds);
    const additions = skillIds.filter((skillId) => !currentSkillIdSet.has(skillId));
    const removals = currentSkillIds.filter((skillId) => !desiredSkillIdSet.has(skillId));

    if (additions.length === 0 && removals.length === 0) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      let updated = group;

      for (const skillId of removals) {
        updated = await removeSkillFromGroup(updated.id, skillId);
      }

      for (const skillId of additions) {
        updated = await addSkillsToGroup(updated.id, [skillId]);
      }

      setGroups((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setStatus(t(catalog, language, "groups.skills.updated"));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateGroup(name: string, description: string) {
    if (!group) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const updated = await updateSkillGroup(group.id, { name, description });
      setGroups((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setStatus(t(catalog, language, "groups.detail.editSuccess"));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading && !group) {
    return (
      <section className="page-stack" aria-labelledby="group-detail-loading-title">
        <header className="topbar page-topbar">
          <div>
            <p className="eyebrow">{t(catalog, language, "groups.eyebrow")}</p>
            <h1 id="group-detail-loading-title">{t(catalog, language, "groups.detail.loading")}</h1>
          </div>
          <div className={styles.detailActions}>
            <button className="button button-secondary" onClick={onBack} type="button">
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "groups.detail.back")}
            </button>
          </div>
        </header>
      </section>
    );
  }

  return (
    <GroupDetailPage
      catalog={catalog}
      error={error}
      group={group}
      installedSkills={installedSkills}
      isSaving={isSaving}
      language={language}
      onBack={onBack}
      onOpenProject={onOpenProject}
      onSyncSkills={handleSyncSkills}
      onUpdateGroup={handleUpdateGroup}
      status={status}
    />
  );
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

function filterSkills(skills: InstalledSkill[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (normalizedQuery.length === 0) {
    return skills;
  }

  return skills.filter((skill) => {
    const haystack = [skill.name, skill.skillPath, skill.sourceRef]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

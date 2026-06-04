import { ArrowClockwise, Check, Export, FolderOpen, NotePencil, Plus, Stack, Trash } from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../../app/i18n";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { FormDialog } from "../../../shared/components/FormDialog";
import { message } from "../../../shared/components/message";
import { readSettings } from "../../settings/settingsApi";
import { findGroupById } from "./GroupsPage.model";
import styles from "./GroupsPage.module.css";
import {
  createSkillGroup,
  deleteSkillGroup,
  exportGroupToJSON,
  listSkillGroups,
  updateCollectionGroup,
  type CollectionInstallProgress,
  type SkillGroup
} from "../groupsApi";

type GroupsPageProps = {
  catalog: I18nCatalog;
  initialDeleteGroupId?: string;
  initialGroups?: SkillGroup[];
  language: LanguageCode;
  onOpenGroup: (groupId: string) => void;
};

export function GroupsPage({
  catalog,
  initialDeleteGroupId,
  initialGroups,
  language,
  onOpenGroup
}: GroupsPageProps) {
  const [groups, setGroups] = useState<SkillGroup[]>(() => initialGroups ?? []);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(
    initialDeleteGroupId ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(initialGroups ? false : true);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<CollectionInstallProgress | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const pendingDeleteGroup = findGroupById(groups, pendingDeleteGroupId);

  // Export state
  const [exportingGroup, setExportingGroup] = useState<SkillGroup | null>(null);
  const [exportFileName, setExportFileName] = useState("");
  const [exportTitle, setExportTitle] = useState("");
  const [exportDescription, setExportDescription] = useState("");
  const [exportPath, setExportPath] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const pageGroups = useMemo(
    () => groups.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [groups, clampedPage, pageSize]
  );

  useEffect(() => {
    let ignore = false;

    readSettings()
      .then((settings) => {
        if (!ignore) {
          setPageSize(settings.discoverPageSize);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (initialGroups) {
      return undefined;
    }

    let ignore = false;

    listSkillGroups()
      .then((groupItems) => {
        if (!ignore) {
          setGroups(groupItems);
          setError(null);
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
  }, []);

  async function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const created = await createSkillGroup({ name: groupName, description: groupDescription });
      setGroups((current) => [...current, created]);
      setGroupName("");
      setGroupDescription("");
      setIsCreateOpen(false);
      setStatus(
        t(catalog, language, "groups.form.success", {
          name: created.name
        })
      );
      onOpenGroup(created.id);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  function requestDeleteGroup(groupId: string) {
    setPendingDeleteGroupId(groupId);
  }

  function closeDeleteDialog() {
    if (isSaving) {
      return;
    }

    setPendingDeleteGroupId(null);
  }

  async function confirmDeleteGroup() {
    if (!pendingDeleteGroup) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      await deleteSkillGroup(pendingDeleteGroup.id);
      setGroups((current) => current.filter((item) => item.id !== pendingDeleteGroup.id));
      setPendingDeleteGroupId(null);
      setStatus(
        t(catalog, language, "groups.deleteSuccess", {
          name: pendingDeleteGroup.name
        })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleUpdateCollection(group: SkillGroup) {
    setUpdatingGroupId(group.id);
    setError(null);
    setStatus(null);
    setUpdateProgress(null);

    try {
      const updated = await updateCollectionGroup(group.id, (p) => setUpdateProgress(p));
      setGroups((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      setStatus(
        t(catalog, language, "groups.updateSuccess", {
          name: updated.name
        })
      );
      message.success(
        t(catalog, language, "groups.updateSuccess", {
          name: updated.name
        })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setUpdatingGroupId(null);
      setUpdateProgress(null);
    }
  }

  function openExportModal(group: SkillGroup) {
    setExportingGroup(group);
    setExportFileName(group.name);
    setExportTitle(group.name);
    setExportDescription(group.description || "");
    setExportPath("");
  }

  function closeExportModal() {
    if (isExporting) return;
    setExportingGroup(null);
    setExportFileName("");
    setExportTitle("");
    setExportDescription("");
    setExportPath("");
  }

  async function handleSelectExportPath() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false
      });
      if (selected) {
        setExportPath(selected as string);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  async function handleExport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!exportingGroup || !exportPath || !exportFileName.trim()) return;

    setIsExporting(true);
    setError(null);

    try {
      const result = await exportGroupToJSON({
        groupId: exportingGroup.id,
        fileName: exportFileName.trim(),
        title: exportTitle,
        description: exportDescription,
        exportPath: exportPath
      });

      message.success(
        t(catalog, language, "groups.export.success", {
          path: result.filePath
        })
      );
      closeExportModal();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <section className="page-stack" aria-labelledby="groups-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "groups.eyebrow")}</p>
          <h1 id="groups-title">{t(catalog, language, "groups.title")}</h1>
        </div>
      </header>

      <section className="panel" aria-labelledby="groups-table-title">
        <div className="panel-header">
          <div>
            <h2 id="groups-table-title">{t(catalog, language, "groups.table.title")}</h2>
            <p>
              {t(catalog, language, "groups.table.description", {
                count: groups.length
              })}
            </p>
          </div>

          <button
            className="button button-primary"
            onClick={() => setIsCreateOpen(true)}
            type="button"
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
            {t(catalog, language, "groups.form.create")}
          </button>
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

        <div className="table-wrap">
          <table className="groups-table">
            <thead>
              <tr>
                <th scope="col">{t(catalog, language, "groups.table.name")}</th>
                <th scope="col">{t(catalog, language, "groups.table.type")}</th>
                <th scope="col">{t(catalog, language, "groups.table.version")}</th>
                <th scope="col">{t(catalog, language, "groups.table.skills")}</th>
                <th scope="col">{t(catalog, language, "groups.table.usage")}</th>
                <th scope="col">{t(catalog, language, "groups.table.updated")}</th>
                <th scope="col">{t(catalog, language, "groups.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7}>{t(catalog, language, "groups.loading")}</td>
                </tr>
              ) : null}

              {!isLoading && groups.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">
                      <Stack size={20} weight="bold" aria-hidden="true" />
                      <strong>{t(catalog, language, "groups.empty.title")}</strong>
                      <p>{t(catalog, language, "groups.empty.copy")}</p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {pageGroups.map((group) => (
                <tr key={group.id}>
                  <td>
                    <button
                      className="table-link-button"
                      onClick={() => onOpenGroup(group.id)}
                      type="button"
                    >
                      {group.name}
                    </button>
                  </td>
                  <td>
                    <span className={`status-badge ${group.groupType === "collection" ? "status-global" : "status-custom"}`}>
                      {t(catalog, language, group.groupType === "collection" ? "groups.type.collection" : "groups.type.manual")}
                    </span>
                  </td>
                  <td>{group.version ?? "—"}</td>
                  <td className="number-cell">{group.skills.length}</td>
                  <td>
                    {group.activeProjectCount > 0 ? (
                      <span className="status-badge status-current">
                        {t(catalog, language, "groups.status.active", {
                          count: group.activeProjectCount
                        })}
                      </span>
                    ) : group.attachedProjectCount > 0 ? (
                      <span className="status-badge status-project">
                        {t(catalog, language, "groups.status.attachedOnly")}
                      </span>
                    ) : (
                      <span className="status-badge status-custom">
                        {t(catalog, language, "groups.status.unused")}
                      </span>
                    )}
                  </td>
                  <td>{formatDate(group.updatedAt)}</td>
                  <td>
                    <div className="row-actions">
                      {group.groupType === "collection" ? (
                        <button
                          aria-label={t(catalog, language, "groups.action.update", {
                            name: group.name
                          })}
                          className="icon-button"
                          disabled={updatingGroupId === group.id}
                          onClick={() => void handleUpdateCollection(group)}
                          type="button"
                        >
                          <ArrowClockwise
                            size={18}
                            weight="bold"
                            aria-hidden="true"
                            className={updatingGroupId === group.id ? "spin" : undefined}
                          />
                        </button>
                      ) : null}
                      <button
                        aria-label={t(catalog, language, "groups.action.open", {
                          name: group.name
                        })}
                        className="icon-button"
                        onClick={() => onOpenGroup(group.id)}
                        type="button"
                      >
                        <NotePencil size={18} weight="bold" aria-hidden="true" />
                      </button>
                      <button
                        aria-label={t(catalog, language, "groups.action.export", {
                          name: group.name
                        })}
                        className="icon-button"
                        onClick={() => openExportModal(group)}
                        type="button"
                      >
                        <Export size={18} weight="bold" aria-hidden="true" />
                      </button>
                      <button
                        aria-label={t(catalog, language, "groups.action.delete", {
                          name: group.name
                        })}
                        className="icon-button danger-button"
                        onClick={() => requestDeleteGroup(group.id)}
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

        {!isLoading && groups.length > 0 ? (
          <div className="pagination-bar" aria-label={t(catalog, language, "groups.pagination.label")}>
            <button
              className="button button-secondary"
              disabled={clampedPage <= 1}
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              {t(catalog, language, "pagination.previous")}
            </button>
            <span>
              {t(catalog, language, "pagination.status", {
                page: clampedPage,
                totalPages
              })}
            </span>
            <button
              className="button button-secondary"
              disabled={clampedPage >= totalPages}
              onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
              type="button"
            >
              {t(catalog, language, "pagination.next")}
            </button>
          </div>
        ) : null}
      </section>

      {isCreateOpen ? (
        <FormDialog
          cancelLabel={t(catalog, language, "groups.form.cancel")}
          description={t(catalog, language, "groups.form.description")}
          disabled={isSaving}
          formClassName={styles.createModalForm}
          submitIcon={<Check size={16} weight="bold" aria-hidden="true" />}
          submitLabel={
            isSaving
              ? t(catalog, language, "groups.form.saving")
              : t(catalog, language, "groups.form.create")
          }
          title={t(catalog, language, "groups.form.title")}
          onCancel={() => { setIsCreateOpen(false); setGroupDescription(""); }}
          onSubmit={handleCreateGroup}
        >
          <label className="field">
            <span>{t(catalog, language, "groups.form.name")}</span>
            <input
              autoComplete="off"
              name="group-name"
              onChange={(event) => setGroupName(event.target.value)}
              placeholder={t(catalog, language, "groups.form.namePlaceholder")}
              required
              value={groupName}
            />
          </label>
          <label className="field">
            <span>{t(catalog, language, "groups.form.descriptionLabel")}</span>
            <textarea
              autoComplete="off"
              name="group-description"
              onChange={(event) => setGroupDescription(event.target.value)}
              placeholder={t(catalog, language, "groups.form.descriptionPlaceholder")}
              rows={3}
              value={groupDescription}
            />
          </label>
        </FormDialog>
      ) : null}

      {pendingDeleteGroup ? (
        <ConfirmDialog
          cancelLabel={t(catalog, language, "groups.form.cancel")}
          confirmIcon={<Trash size={16} weight="bold" aria-hidden="true" />}
          confirmLabel={t(catalog, language, "groups.detail.delete")}
          danger
          description={t(catalog, language, "groups.deleteConfirm", {
            name: pendingDeleteGroup.name
          })}
          disabled={isSaving}
          title={t(catalog, language, "groups.detail.delete")}
          onCancel={closeDeleteDialog}
          onConfirm={() => void confirmDeleteGroup()}
        />
      ) : null}

      {exportingGroup ? (
        <FormDialog
          cancelLabel={t(catalog, language, "groups.form.cancel")}
          closeLabel={t(catalog, language, "groups.export.close")}
          description={t(catalog, language, "groups.export.description")}
          disabled={isExporting}
          formClassName={styles.exportForm}
          submitIcon={<Export size={16} weight="bold" aria-hidden="true" />}
          submitLabel={
            isExporting
              ? t(catalog, language, "groups.export.exporting")
              : t(catalog, language, "groups.export.submit")
          }
          title={t(catalog, language, "groups.export.title")}
          onCancel={closeExportModal}
          onSubmit={handleExport}
        >
          <div className={styles.exportFormMeta}>
            <label className="field">
              <span>{t(catalog, language, "groups.export.fileName")}</span>
              <input
                autoComplete="off"
                name="export-file-name"
                onChange={(event) => setExportFileName(event.target.value)}
                placeholder={t(catalog, language, "groups.export.fileNamePlaceholder")}
                required
                value={exportFileName}
              />
            </label>
            <label className="field">
              <span>{t(catalog, language, "groups.export.title")}</span>
              <input
                autoComplete="off"
                name="export-title"
                onChange={(event) => setExportTitle(event.target.value)}
                placeholder={t(catalog, language, "groups.export.titlePlaceholder")}
                value={exportTitle}
              />
            </label>
          </div>
          <label className="field">
            <span>{t(catalog, language, "groups.export.descriptionLabel")}</span>
            <textarea
              autoComplete="off"
              name="export-description"
              onChange={(event) => setExportDescription(event.target.value)}
              placeholder={t(catalog, language, "groups.export.descriptionPlaceholder")}
              rows={3}
              value={exportDescription}
            />
          </label>
          <div className={styles.exportFormDest}>
            <label className="field">
              <span>{t(catalog, language, "groups.export.path")}</span>
              <div className={styles.fileInputRow}>
                <input
                  autoComplete="off"
                  name="export-path"
                  onChange={(event) => setExportPath(event.target.value)}
                  placeholder={t(catalog, language, "groups.export.pathPlaceholder")}
                  required
                  value={exportPath}
                />
                <button
                  className="button button-secondary"
                  onClick={() => void handleSelectExportPath()}
                  type="button"
                >
                  <FolderOpen size={16} weight="bold" aria-hidden="true" />
                </button>
              </div>
            </label>
          </div>
        </FormDialog>
      ) : null}
    </section>
  );
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

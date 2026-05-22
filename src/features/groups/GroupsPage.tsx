import { Check, NotePencil, Plus, Stack, Trash } from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../i18n";
import { readSettings } from "../settings/settingsApi";
import { findGroupById } from "./GroupsPage.model";
import styles from "./GroupsPage.module.css";
import {
  createSkillGroup,
  deleteSkillGroup,
  listSkillGroups,
  type SkillGroup
} from "./groupsApi";

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
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingDeleteGroupId, setPendingDeleteGroupId] = useState<string | null>(
    initialDeleteGroupId ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(initialGroups ? false : true);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const pendingDeleteGroup = findGroupById(groups, pendingDeleteGroupId);

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
      const created = await createSkillGroup({ name: groupName });
      setGroups((current) => [...current, created]);
      setGroupName("");
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
                <th scope="col">{t(catalog, language, "groups.table.skills")}</th>
                <th scope="col">{t(catalog, language, "groups.table.projects")}</th>
                <th scope="col">{t(catalog, language, "groups.table.usage")}</th>
                <th scope="col">{t(catalog, language, "groups.table.updated")}</th>
                <th scope="col">{t(catalog, language, "groups.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>{t(catalog, language, "groups.loading")}</td>
                </tr>
              ) : null}

              {!isLoading && groups.length === 0 ? (
                <tr>
                  <td colSpan={6}>
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
                  <td className="number-cell">{group.skills.length}</td>
                  <td className="number-cell">{group.attachedProjectCount}</td>
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
            <span>
              {t(catalog, language, "groups.pagination.status", {
                page: clampedPage,
                totalPages
              })}
            </span>
            <button
              className="button button-secondary"
              disabled={clampedPage <= 1}
              onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
              type="button"
            >
              {t(catalog, language, "groups.pagination.previous")}
            </button>
            <button
              className="button button-secondary"
              disabled={clampedPage >= totalPages}
              onClick={() => setCurrentPage((value) => Math.min(totalPages, value + 1))}
              type="button"
            >
              {t(catalog, language, "groups.pagination.next")}
            </button>
          </div>
        ) : null}
      </section>

      {isCreateOpen ? (
        <div className="modal-backdrop" onClick={() => setIsCreateOpen(false)}>
          <div
            aria-labelledby="groups-create-title"
            aria-modal="true"
            className="modal-panel modal-panel-compact"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <h2 id="groups-create-title">{t(catalog, language, "groups.form.title")}</h2>
                <p>{t(catalog, language, "groups.form.description")}</p>
              </div>
            </div>
            <form className={styles.createModalForm} onSubmit={handleCreateGroup}>
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
              <div className="modal-actions modal-actions-pad">
                <button
                  className="button button-secondary"
                  onClick={() => setIsCreateOpen(false)}
                  type="button"
                >
                  {t(catalog, language, "groups.form.cancel")}
                </button>
                <button className="button button-primary" disabled={isSaving} type="submit">
                  <Check size={16} weight="bold" aria-hidden="true" />
                  {isSaving
                    ? t(catalog, language, "groups.form.saving")
                    : t(catalog, language, "groups.form.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingDeleteGroup ? (
        <div className="modal-backdrop" onClick={closeDeleteDialog}>
          <div
            aria-labelledby="groups-delete-title"
            aria-modal="true"
            className="modal-panel modal-panel-compact"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <h2 className={styles.groupsDeleteTitle} id="groups-delete-title">{t(catalog, language, "groups.detail.delete")}</h2>
                <p>
                  {t(catalog, language, "groups.deleteConfirm", {
                    name: pendingDeleteGroup.name
                  })}
                </p>
              </div>
            </div>
            <div className="modal-actions modal-actions-pad">
              <button
                className="button button-secondary"
                disabled={isSaving}
                onClick={closeDeleteDialog}
                type="button"
              >
                {t(catalog, language, "groups.form.cancel")}
              </button>
              <button
                className="button button-danger"
                disabled={isSaving}
                onClick={() => void confirmDeleteGroup()}
                type="button"
              >
                <Trash size={16} weight="bold" aria-hidden="true" />
                {t(catalog, language, "groups.detail.delete")}
              </button>
            </div>
          </div>
        </div>
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

import { ArrowLeft, NotePencil, Plus, Trash, X } from "@phosphor-icons/react";
import { FormEvent, useEffect, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../i18n";
import styles from "./CliTargetsPage.module.css";
import {
  createCliTarget,
  deleteCliTarget,
  listCliTargets,
  updateCliTarget,
  type CliTargetInput,
  type CliTargetRecord
} from "./cliTargetsApi";

type CliTargetsPageProps = {
  catalog: I18nCatalog;
  initialDraftOpen?: boolean;
  language: LanguageCode;
  onBack: () => void;
};

const emptyDraft: CliTargetInput = {
  displayName: "",
  relativePath: ""
};

export function CliTargetsPage({
  catalog,
  initialDraftOpen = false,
  language,
  onBack
}: CliTargetsPageProps) {
  const [cliTargets, setCliTargets] = useState<CliTargetRecord[]>([]);
  const [draft, setDraft] = useState<CliTargetInput>(emptyDraft);
  const [editingTarget, setEditingTarget] = useState<CliTargetRecord | null>(null);
  const [isDraftOpen, setIsDraftOpen] = useState(initialDraftOpen);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let ignore = false;

    listCliTargets()
      .then((items) => {
        if (!ignore) {
          setCliTargets(items);
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

  function openCreateDialog() {
    setEditingTarget(null);
    setDraft(emptyDraft);
    setError(null);
    setStatus(null);
    setIsDraftOpen(true);
  }

  function openEditDialog(cliTarget: CliTargetRecord) {
    if (cliTarget.isBuiltIn) {
      return;
    }

    setEditingTarget(cliTarget);
    setDraft({
      displayName: cliTarget.displayName,
      relativePath: cliTarget.relativePath
    });
    setError(null);
    setStatus(null);
    setIsDraftOpen(true);
  }

  function closeDraftDialog() {
    if (isSaving) {
      return;
    }

    setEditingTarget(null);
    setDraft(emptyDraft);
    setIsDraftOpen(false);
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const saved = editingTarget
        ? await updateCliTarget(editingTarget.id, draft)
        : await createCliTarget(draft);
      setCliTargets((current) =>
        replaceCliTarget(current, saved).sort(compareCliTargets)
      );
      setStatus(
        t(
          catalog,
          language,
          editingTarget ? "settings.cliTargets.updated" : "settings.cliTargets.created",
          { name: saved.displayName }
        )
      );
      closeDraftDialog();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(cliTarget: CliTargetRecord) {
    if (cliTarget.isBuiltIn) {
      return;
    }

    const confirmed = window.confirm(
      t(catalog, language, "settings.cliTargets.deleteConfirm", {
        name: cliTarget.displayName
      })
    );

    if (!confirmed) {
      return;
    }

    setError(null);
    setStatus(null);

    try {
      await deleteCliTarget(cliTarget.id);
      setCliTargets((current) => current.filter((item) => item.id !== cliTarget.id));
      setStatus(
        t(catalog, language, "settings.cliTargets.deleted", {
          name: cliTarget.displayName
        })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <section className="page-stack" aria-labelledby="cli-targets-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "settings.cliTargets.eyebrow")}</p>
          <h1 id="cli-targets-title">{t(catalog, language, "settings.cliTargets.pageTitle")}</h1>
        </div>
        <button className="button button-secondary" onClick={onBack} type="button">
          <ArrowLeft size={16} weight="bold" aria-hidden="true" />
          {t(catalog, language, "settings.cliTargets.back")}
        </button>
      </header>

      <div className={styles.layout}>
        <section className="panel" aria-labelledby="cli-targets-table-title">
          <div className="panel-header">
            <div>
              <h2 id="cli-targets-table-title">{t(catalog, language, "settings.cliTargets.table.title")}</h2>
              <p>
                {t(catalog, language, "settings.cliTargets.table.description", {
                  count: cliTargets.length
                })}
              </p>
            </div>
            <div className={styles.actions}>
              <button className="button button-primary" onClick={openCreateDialog} type="button">
                <Plus size={16} weight="bold" aria-hidden="true" />
                {t(catalog, language, "settings.cliTargets.form.add")}
              </button>
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

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t(catalog, language, "settings.cliTargets.table.name")}</th>
                  <th scope="col">{t(catalog, language, "settings.cliTargets.table.path")}</th>
                  <th scope="col">{t(catalog, language, "settings.cliTargets.table.scope")}</th>
                  <th scope="col">{t(catalog, language, "settings.cliTargets.table.updated")}</th>
                  <th scope="col">{t(catalog, language, "settings.cliTargets.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5}>{t(catalog, language, "settings.cliTargets.loading")}</td>
                  </tr>
                ) : null}

                {!isLoading && cliTargets.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <Plus size={20} weight="bold" aria-hidden="true" />
                        <strong>{t(catalog, language, "settings.cliTargets.empty.title")}</strong>
                        <p>{t(catalog, language, "settings.cliTargets.empty.copy")}</p>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {cliTargets.map((cliTarget) => (
                  <tr key={cliTarget.id}>
                    <td>
                      <strong className="table-primary">{cliTarget.displayName}</strong>
                    </td>
                    <td>
                      <span className="path-cell">{cliTarget.relativePath}</span>
                    </td>
                    <td>
                      <span
                        className={
                          cliTarget.isBuiltIn
                            ? "status-badge status-global"
                            : "status-badge status-project"
                        }
                      >
                        {t(
                          catalog,
                          language,
                          cliTarget.isBuiltIn
                            ? "settings.cliTargets.scope.builtIn"
                            : "settings.cliTargets.scope.custom"
                        )}
                      </span>
                    </td>
                    <td>{formatDate(cliTarget.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        {!cliTarget.isBuiltIn ? (
                          <>
                            <button
                              aria-label={t(catalog, language, "settings.cliTargets.action.edit", {
                                name: cliTarget.displayName
                              })}
                              className="icon-button"
                              onClick={() => openEditDialog(cliTarget)}
                              type="button"
                            >
                              <NotePencil size={18} weight="bold" aria-hidden="true" />
                            </button>
                            <button
                              aria-label={t(catalog, language, "settings.cliTargets.action.delete", {
                                name: cliTarget.displayName
                              })}
                              className="icon-button danger-button"
                              onClick={() => void handleDelete(cliTarget)}
                              type="button"
                            >
                              <Trash size={18} weight="bold" aria-hidden="true" />
                            </button>
                          </>
                        ) : (
                          <span className={styles.builtInText}>
                            {t(catalog, language, "settings.cliTargets.action.builtIn")}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {isDraftOpen ? (
        <div className="modal-backdrop" onClick={closeDraftDialog}>
          <div
            aria-labelledby="cli-targets-form-title"
            aria-modal="true"
            className="modal-panel modal-panel-compact"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <h2 id="cli-targets-form-title">
                  {editingTarget
                    ? t(catalog, language, "settings.cliTargets.form.editTitle")
                    : t(catalog, language, "settings.cliTargets.form.addTitle")}
                </h2>
                <p>{t(catalog, language, "settings.cliTargets.form.description")}</p>
              </div>
              <button
                aria-label={t(catalog, language, "settings.cliTargets.form.close")}
                className="icon-button"
                disabled={isSaving}
                onClick={closeDraftDialog}
                type="button"
              >
                <X size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleSave}>
              <label className="field">
                <span>{t(catalog, language, "settings.cliTargets.form.name")}</span>
                <input
                  autoComplete="off"
                  name="cli-target-name"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, displayName: event.target.value }))
                  }
                  placeholder={t(catalog, language, "settings.cliTargets.form.namePlaceholder")}
                  required
                  value={draft.displayName}
                />
              </label>

              <label className="field">
                <span>{t(catalog, language, "settings.cliTargets.form.path")}</span>
                <input
                  autoComplete="off"
                  name="cli-target-relative-path"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, relativePath: event.target.value }))
                  }
                  placeholder={t(catalog, language, "settings.cliTargets.form.pathPlaceholder")}
                  required
                  value={draft.relativePath}
                />
              </label>

              <div className={styles.modalActions}>
                <button
                  className="button button-secondary"
                  disabled={isSaving}
                  onClick={closeDraftDialog}
                  type="button"
                >
                  {t(catalog, language, "settings.cliTargets.form.cancel")}
                </button>
                <button className="button button-primary" disabled={isSaving} type="submit">
                  {editingTarget
                    ? t(catalog, language, "settings.cliTargets.form.save")
                    : t(catalog, language, "settings.cliTargets.form.add")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function replaceCliTarget(current: CliTargetRecord[], target: CliTargetRecord) {
  const existingIndex = current.findIndex((item) => item.id === target.id);
  if (existingIndex === -1) {
    return [...current, target];
  }

  return current.map((item) => (item.id === target.id ? target : item));
}

function compareCliTargets(left: CliTargetRecord, right: CliTargetRecord) {
  return (
    Number(right.isBuiltIn) - Number(left.isBuiltIn) ||
    left.displayName.localeCompare(right.displayName) ||
    left.relativePath.localeCompare(right.relativePath)
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

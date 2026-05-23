import { FolderOpen, MagnifyingGlass, NotePencil, Plus, Trash, X } from "@phosphor-icons/react";
import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../../app/i18n";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import styles from "./ProjectsPage.module.css";
import {
  createProject,
  deleteProject,
  listProjects,
  selectProjectDirectory,
  type ProjectRecord
} from "../projectsApi";
import { buildProjectsPage } from "../projectsPageModel";

type ProjectsPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  onOpenProject: (projectId: string) => void;
};

const emptyDraft = {
  name: "",
  path: ""
};

export function ProjectsPage({
  catalog,
  language,
  onOpenProject
}: ProjectsPageProps) {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingDeleteProject, setPendingDeleteProject] = useState<ProjectRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPickingDirectory, setIsPickingDirectory] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  useEffect(() => {
    let ignore = false;

    listProjects()
      .then((items) => {
        if (!ignore) {
          setProjects(items);
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

  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  const page = useMemo(
    () => buildProjectsPage(projects, query, currentPage),
    [projects, query, currentPage]
  );

  useEffect(() => {
    if (page.currentPage !== currentPage) {
      setCurrentPage(page.currentPage);
    }
  }, [currentPage, page.currentPage]);

  function openCreateModal() {
    setError(null);
    setStatus(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateModal() {
    if (isSaving || isPickingDirectory) {
      return;
    }

    setDraft(emptyDraft);
    setIsCreateModalOpen(false);
  }

  function handleCreateModalKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      closeCreateModal();
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setStatus(null);

    try {
      const created = await createProject(draft);
      setProjects((current) =>
        [...current, created].sort((left, right) =>
          left.name.localeCompare(right.name) || left.path.localeCompare(right.path)
        )
      );
      setDraft(emptyDraft);
      setStatus(
        t(catalog, language, "projects.form.success", {
          name: created.name
        })
      );
      setIsCreateModalOpen(false);
      onOpenProject(created.id);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePickDirectory() {
    setIsPickingDirectory(true);
    setError(null);

    try {
      const selectedPath = await selectProjectDirectory();
      if (selectedPath) {
        setDraft((current) => ({ ...current, path: selectedPath }));
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsPickingDirectory(false);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteProject) {
      return;
    }

    const project = pendingDeleteProject;
    setError(null);
    setStatus(null);

    try {
      await deleteProject(project.id);
      setProjects((current) => current.filter((item) => item.id !== project.id));
      setPendingDeleteProject(null);
      setStatus(
        t(catalog, language, "projects.deleteSuccess", {
          name: project.name
        })
      );
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  return (
    <section className="page-stack" aria-labelledby="projects-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "projects.eyebrow")}</p>
          <h1 id="projects-title">{t(catalog, language, "projects.title")}</h1>
        </div>
      </header>

      <div className={styles.layout}>
        <section className="panel" aria-labelledby="projects-table-title">
          <div className="panel-header">
            <div>
              <h2 id="projects-table-title">{t(catalog, language, "projects.table.title")}</h2>
              <p>
                {t(catalog, language, "projects.table.description", {
                  count: projects.length
                })}
              </p>
            </div>

            <div className={styles.toolbar}>
              <label className="search-field">
                <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
                <span className="sr-only">{t(catalog, language, "projects.searchLabel")}</span>
                <input
                  autoComplete="off"
                  name="project-search"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t(catalog, language, "projects.searchPlaceholder")}
                  type="search"
                  value={query}
                />
              </label>

              <button className="button button-primary" onClick={openCreateModal} type="button">
                <Plus size={16} weight="bold" aria-hidden="true" />
                {t(catalog, language, "projects.form.openCreate")}
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
                  <th scope="col">{t(catalog, language, "projects.table.name")}</th>
                  <th scope="col">{t(catalog, language, "projects.table.path")}</th>
                  <th scope="col">{t(catalog, language, "projects.table.updated")}</th>
                  <th scope="col">{t(catalog, language, "projects.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4}>{t(catalog, language, "projects.loading")}</td>
                  </tr>
                ) : null}

                {!isLoading && page.filteredCount === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">
                        <FolderOpen size={20} weight="bold" aria-hidden="true" />
                        <strong>{t(catalog, language, "projects.empty.title")}</strong>
                        <p>{t(catalog, language, "projects.empty.copy")}</p>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {page.items.map((project) => (
                  <tr key={project.id}>
                    <td>
                      <button
                        className="table-link-button"
                        onClick={() => onOpenProject(project.id)}
                        type="button"
                      >
                        {project.name}
                      </button>
                    </td>
                    <td>
                      <span className="path-cell">{project.path}</span>
                    </td>
                    <td>{formatDate(project.updatedAt)}</td>
                    <td>
                      <ProjectRowActions
                        catalog={catalog}
                        language={language}
                        onDelete={() => setPendingDeleteProject(project)}
                        onOpen={() => onOpenProject(project.id)}
                        project={project}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!isLoading && page.filteredCount > 0 ? (
            <div className="pagination-bar" aria-label={t(catalog, language, "projects.pagination.label")}>
              <button
                className="button button-secondary"
                disabled={page.currentPage <= 1}
                onClick={() => setCurrentPage((value) => Math.max(1, value - 1))}
                type="button"
              >
                {t(catalog, language, "pagination.previous")}
              </button>
              <span>
                {t(catalog, language, "pagination.status", {
                  page: page.currentPage,
                  totalPages: page.totalPages
                })}
              </span>
              <button
                className="button button-secondary"
                disabled={page.currentPage >= page.totalPages}
                onClick={() =>
                  setCurrentPage((value) => Math.min(page.totalPages, value + 1))
                }
                type="button"
              >
                {t(catalog, language, "pagination.next")}
              </button>
            </div>
          ) : null}
        </section>
      </div>

      {isCreateModalOpen ? (
        <div aria-hidden={false} className="modal-backdrop" onClick={closeCreateModal}>
          <div
            aria-labelledby="projects-create-title"
            aria-modal="true"
            className="modal-panel"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={handleCreateModalKeyDown}
            role="dialog"
            tabIndex={-1}
          >
            <div className="panel-header">
              <div>
                <h2 id="projects-create-title">{t(catalog, language, "projects.form.title")}</h2>
                <p>{t(catalog, language, "projects.form.description")}</p>
              </div>
              <button
                aria-label={t(catalog, language, "projects.form.close")}
                className="icon-button"
                disabled={isSaving || isPickingDirectory}
                onClick={closeCreateModal}
                type="button"
              >
                <X size={18} weight="bold" aria-hidden="true" />
              </button>
            </div>

            <form className={styles.modalForm} onSubmit={handleCreateProject}>
              <label className="field">
                <span>{t(catalog, language, "projects.form.name")}</span>
                <input
                  autoComplete="off"
                  name="project-name"
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder={t(catalog, language, "projects.form.namePlaceholder")}
                  required
                  value={draft.name}
                />
              </label>

              <label className="field">
                <span>{t(catalog, language, "projects.form.path")}</span>
                <div className="field-with-action">
                  <input
                    autoComplete="off"
                    name="project-path"
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, path: event.target.value }))
                    }
                    placeholder={t(catalog, language, "projects.form.pathPlaceholder")}
                    required
                    value={draft.path}
                  />
                  <button
                    aria-label={t(catalog, language, "projects.form.pickDirectory")}
                    className="icon-button"
                    disabled={isSaving || isPickingDirectory}
                    onClick={() => void handlePickDirectory()}
                    type="button"
                  >
                    <FolderOpen size={18} weight="bold" aria-hidden="true" />
                  </button>
                </div>
              </label>

              <div className="modal-actions">
                <button
                  className="button button-secondary"
                  disabled={isSaving || isPickingDirectory}
                  onClick={closeCreateModal}
                  type="button"
                >
                  {t(catalog, language, "projects.form.cancel")}
                </button>
                <button
                  className="button button-primary"
                  disabled={isSaving || isPickingDirectory}
                  type="submit"
                >
                  <Plus size={16} weight="bold" aria-hidden="true" />
                  {isSaving
                    ? t(catalog, language, "projects.form.saving")
                    : t(catalog, language, "projects.form.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {pendingDeleteProject ? (
        <ConfirmDialog
          cancelLabel={t(catalog, language, "projects.deleteDialog.cancel")}
          confirmLabel={t(catalog, language, "projects.deleteDialog.confirm")}
          description={t(catalog, language, "projects.deleteConfirm", {
            name: pendingDeleteProject.name
          })}
          title={t(catalog, language, "projects.deleteDialog.title")}
          onCancel={() => setPendingDeleteProject(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </section>
  );
}

type ProjectRowActionsProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  onDelete: () => void;
  onOpen: () => void;
  project: ProjectRecord;
};

export function ProjectRowActions({
  catalog,
  language,
  onDelete,
  onOpen,
  project
}: ProjectRowActionsProps) {
  return (
    <div className="row-actions">
      <button
        aria-label={t(catalog, language, "projects.action.open", {
          name: project.name
        })}
        className="icon-button"
        onClick={onOpen}
        type="button"
      >
        <NotePencil size={18} weight="bold" aria-hidden="true" />
      </button>
      <button
        aria-label={t(catalog, language, "projects.action.delete", {
          name: project.name
        })}
        className="icon-button danger-button"
        onClick={onDelete}
        type="button"
      >
        <Trash size={18} weight="bold" aria-hidden="true" />
      </button>
    </div>
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

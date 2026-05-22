import { Check, PencilSimple, Plus, Trash, X } from "@phosphor-icons/react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../i18n";
import styles from "./DirectoriesPage.module.css";
import {
  createCustomDirectory,
  deleteCustomDirectory,
  listCustomDirectories,
  updateCustomDirectory,
  type CustomDirectory
} from "./directoriesApi";

type DirectoryFormState = {
  name: string;
  path: string;
};

const emptyForm: DirectoryFormState = {
  name: "",
  path: ""
};

type DirectoriesPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
};

export function DirectoriesPage({ catalog, language }: DirectoriesPageProps) {
  const [directories, setDirectories] = useState<CustomDirectory[]>([]);
  const [form, setForm] = useState<DirectoryFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let ignore = false;

    listCustomDirectories()
      .then((items) => {
        if (!ignore) {
          setDirectories(items);
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

  const filteredDirectories = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) {
      return directories;
    }

    return directories.filter((directory) =>
      `${directory.name} ${directory.path}`.toLowerCase().includes(term)
    );
  }, [directories, query]);

  const editingDirectory = editingId
    ? directories.find((directory) => directory.id === editingId)
    : null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      if (editingId) {
        const updated = await updateCustomDirectory(editingId, form);
        setDirectories((current) =>
          current.map((directory) =>
            directory.id === updated.id ? updated : directory
          )
        );
      } else {
        const created = await createCustomDirectory(form);
        setDirectories((current) => [...current, created]);
      }

      setForm(emptyForm);
      setEditingId(null);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(directory: CustomDirectory) {
    const confirmed = window.confirm(
      t(catalog, language, "directories.deleteConfirm", { name: directory.name })
    );

    if (!confirmed) {
      return;
    }

    setError(null);

    try {
      await deleteCustomDirectory(directory.id);
      setDirectories((current) =>
        current.filter((item) => item.id !== directory.id)
      );

      if (editingId === directory.id) {
        setEditingId(null);
        setForm(emptyForm);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    }
  }

  function startEdit(directory: CustomDirectory) {
    setEditingId(directory.id);
    setForm({
      name: directory.name,
      path: directory.path
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  return (
    <section className="page-stack" aria-labelledby="directories-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "directories.eyebrow")}</p>
          <h1 id="directories-title">{t(catalog, language, "directories.title")}</h1>
        </div>
        <label className="search-field">
          <span className="sr-only">
            {t(catalog, language, "directories.searchLabel")}
          </span>
          <input
            autoComplete="off"
            name="directory-search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(catalog, language, "directories.searchPlaceholder")}
            type="search"
            value={query}
          />
        </label>
      </header>

      <div className={styles.layout}>
        <section className="panel" aria-labelledby="directory-form-title">
          <div className="panel-header">
            <div>
              <h2 id="directory-form-title">
                {editingDirectory
                  ? t(catalog, language, "directories.form.editTitle")
                  : t(catalog, language, "directories.form.addTitle")}
              </h2>
              <p>{t(catalog, language, "directories.form.description")}</p>
            </div>
            {editingDirectory ? (
              <button
                aria-label={t(catalog, language, "directories.form.cancel")}
                className="icon-button"
                onClick={cancelEdit}
                type="button"
              >
                <X size={18} weight="bold" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className="field">
              <span>{t(catalog, language, "directories.form.name")}</span>
              <input
                autoComplete="off"
                name="directory-name"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    name: event.target.value
                  }))
                }
                placeholder={t(catalog, language, "directories.form.namePlaceholder")}
                required
                value={form.name}
              />
            </label>

            <label className="field">
              <span>{t(catalog, language, "directories.form.path")}</span>
              <input
                autoComplete="off"
                name="directory-path"
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    path: event.target.value
                  }))
                }
                placeholder={t(catalog, language, "directories.form.pathPlaceholder")}
                required
                value={form.path}
              />
            </label>

            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}

            <button className="button button-primary" disabled={isSaving} type="submit">
              {editingDirectory ? (
                <Check size={16} weight="bold" aria-hidden="true" />
              ) : (
                <Plus size={16} weight="bold" aria-hidden="true" />
              )}
              {isSaving
                ? t(catalog, language, "directories.form.saving")
                : editingDirectory
                  ? t(catalog, language, "directories.form.save")
                  : t(catalog, language, "directories.form.add")}
            </button>
          </form>
        </section>

        <section className="panel" aria-labelledby="directory-table-title">
          <div className="panel-header">
            <div>
              <h2 id="directory-table-title">
                {t(catalog, language, "directories.table.title")}
              </h2>
              <p>
                {t(catalog, language, "directories.table.description", {
                  count: directories.length
                })}
              </p>
            </div>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t(catalog, language, "directories.table.name")}</th>
                  <th scope="col">{t(catalog, language, "directories.table.path")}</th>
                  <th scope="col">{t(catalog, language, "directories.table.updated")}</th>
                  <th scope="col">{t(catalog, language, "directories.table.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={4}>{t(catalog, language, "directories.loading")}</td>
                  </tr>
                ) : null}

                {!isLoading && filteredDirectories.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">
                        <strong>{t(catalog, language, "directories.empty.title")}</strong>
                        <p>{t(catalog, language, "directories.empty.copy")}</p>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {filteredDirectories.map((directory) => (
                  <tr key={directory.id}>
                    <td>
                      <strong className="table-primary">{directory.name}</strong>
                    </td>
                    <td>
                      <span className="path-cell">{directory.path}</span>
                    </td>
                    <td>{formatDate(directory.updatedAt)}</td>
                    <td>
                      <div className="row-actions">
                        <button
                          aria-label={t(catalog, language, "directories.action.edit", {
                            name: directory.name
                          })}
                          className="icon-button"
                          onClick={() => startEdit(directory)}
                          type="button"
                        >
                          <PencilSimple size={18} weight="bold" aria-hidden="true" />
                        </button>
                        <button
                          aria-label={t(catalog, language, "directories.action.delete", {
                            name: directory.name
                          })}
                          className="icon-button danger-button"
                          onClick={() => void handleDelete(directory)}
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
      </div>
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

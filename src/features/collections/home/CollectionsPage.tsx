import { ArrowClockwise, MagnifyingGlass, Package, Stack, Trash } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../../app/i18n";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { message } from "../../../shared/components/message";
import { readSettings } from "../../settings/settingsApi";
import {
  listInstalledCollections,
  updateCollection,
  deleteCollection,
  type InstalledCollection,
  type CollectionInstallProgress
} from "../collectionsApi";

type CollectionsPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
};

export function CollectionsPage({ catalog, language }: CollectionsPageProps) {
  const [collections, setCollections] = useState<InstalledCollection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<CollectionInstallProgress | null>(null);

  const pendingDeleteCollection = useMemo(
    () => collections.find((c) => c.id === pendingDeleteId) ?? null,
    [collections, pendingDeleteId]
  );

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return collections;
    const q = searchQuery.toLowerCase();
    return collections.filter(
      (c) =>
        c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    );
  }, [collections, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(currentPage, totalPages);
  const pageCollections = useMemo(
    () => filtered.slice((clampedPage - 1) * pageSize, clampedPage * pageSize),
    [filtered, clampedPage, pageSize]
  );

  useEffect(() => {
    let ignore = false;
    readSettings()
      .then((settings) => {
        if (!ignore) setPageSize(settings.discoverPageSize);
      })
      .catch(() => {});
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    let ignore = false;
    listInstalledCollections()
      .then((items) => {
        if (!ignore) {
          setCollections(items);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!ignore) setError(errorMessage(reason));
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, []);

  async function handleUpdate(collection: InstalledCollection) {
    setUpdatingId(collection.id);
    setUpdateProgress(null);
    try {
      const updated = await updateCollection(collection.id, (p) => setUpdateProgress(p));
      setCollections((current) =>
        current.map((c) => (c.id === updated.id ? updated : c))
      );
      message.success(
        t(catalog, language, "collections.updateSuccess", { name: updated.title })
      );
    } catch (reason) {
      message.error(errorMessage(reason));
    } finally {
      setUpdatingId(null);
      setUpdateProgress(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDeleteId) return;
    setIsSaving(true);
    try {
      await deleteCollection(pendingDeleteId);
      setCollections((current) => current.filter((c) => c.id !== pendingDeleteId));
      const name = pendingDeleteCollection?.title ?? "";
      message.success(t(catalog, language, "collections.deleteSuccess", { name }));
      setPendingDeleteId(null);
    } catch (reason) {
      message.error(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="page-stack" aria-labelledby="collections-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "collections.eyebrow")}</p>
          <h1 id="collections-title">{t(catalog, language, "collections.title")}</h1>
        </div>
      </header>

      <section className="panel" aria-labelledby="collections-table-title">
        <div className="panel-header">
          <div>
            <h2 id="collections-table-title">
              {t(catalog, language, "collections.table.title")}
            </h2>
            <p>
              {t(catalog, language, "collections.table.description", {
                count: collections.length
              })}
            </p>
          </div>
        </div>

        <div className="collections-search-bar" style={{ padding: "0 1.5rem 1rem" }}>
          <label className="search-field">
            <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
            <span className="sr-only">{t(catalog, language, "collections.searchLabel")}</span>
            <input
              autoComplete="off"
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder={t(catalog, language, "collections.searchPlaceholder")}
              type="search"
              value={searchQuery}
            />
          </label>
        </div>

        {error ? (
          <p className="form-error panel-message" role="alert">
            {error}
          </p>
        ) : null}

        {updateProgress ? (
          <p className="form-progress panel-message" role="status">
            {t(catalog, language, "collections.progress.installing", {
              current: String(updateProgress.current ?? 0),
              total: String(updateProgress.total ?? 0),
              name: updateProgress.message
            })}
          </p>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t(catalog, language, "collections.table.name")}</th>
                <th scope="col">{t(catalog, language, "collections.table.description-col")}</th>
                <th scope="col">{t(catalog, language, "collections.table.version")}</th>
                <th scope="col">{t(catalog, language, "collections.table.totalSkills")}</th>
                <th scope="col">{t(catalog, language, "collections.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>{t(catalog, language, "collections.loading")}</td>
                </tr>
              ) : null}

              {!isLoading && filtered.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <Stack size={20} weight="bold" aria-hidden="true" />
                      <strong>{t(catalog, language, "collections.empty.title")}</strong>
                      <p>{t(catalog, language, "collections.empty.copy")}</p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? pageCollections.map((coll) => (
                    <tr key={coll.id}>
                      <td>
                        <strong className="table-primary">{coll.title}</strong>
                      </td>
                      <td>
                        <span className="table-secondary">{coll.description}</span>
                      </td>
                      <td>
                        <span className="table-primary">{coll.version}</span>
                      </td>
                      <td className="number-cell">{coll.totalSkills}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={t(catalog, language, "collections.action.update", {
                              name: coll.title
                            })}
                            className="icon-button"
                            disabled={updatingId !== null}
                            onClick={() => void handleUpdate(coll)}
                            type="button"
                          >
                            <ArrowClockwise size={18} weight="bold" aria-hidden="true" />
                          </button>
                          <button
                            aria-label={t(catalog, language, "collections.action.delete", {
                              name: coll.title
                            })}
                            className="icon-button danger-button"
                            disabled={updatingId !== null}
                            onClick={() => setPendingDeleteId(coll.id)}
                            type="button"
                          >
                            <Trash size={18} weight="bold" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 ? (
          <div
            className="pagination-bar"
            aria-label={t(catalog, language, "collections.pagination.label")}
          >
            <button
              className="button button-secondary"
              disabled={clampedPage <= 1}
              onClick={() => setCurrentPage((v) => Math.max(1, v - 1))}
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
              onClick={() => setCurrentPage((v) => Math.min(totalPages, v + 1))}
              type="button"
            >
              {t(catalog, language, "pagination.next")}
            </button>
          </div>
        ) : null}
      </section>

      {pendingDeleteCollection ? (
        <ConfirmDialog
          cancelLabel={t(catalog, language, "collections.detail.close")}
          confirmIcon={<Trash size={16} weight="bold" aria-hidden="true" />}
          confirmLabel={t(catalog, language, "collections.action.delete", {
            name: pendingDeleteCollection.title
          })}
          danger
          description={t(catalog, language, "collections.deleteConfirm", {
            name: pendingDeleteCollection.title
          })}
          disabled={isSaving}
          title={t(catalog, language, "collections.action.delete", {
            name: pendingDeleteCollection.title
          })}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </section>
  );
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

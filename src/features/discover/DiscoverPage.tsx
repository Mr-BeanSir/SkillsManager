import {
  DownloadSimple,
  Eye,
  MagnifyingGlass,
  Package,
  Plus,
  TrendUp,
} from "@phosphor-icons/react";
import { FormEvent, useEffect, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../i18n";
import { readSettings } from "../settings/settingsApi";
import styles from "./DiscoverPage.module.css";
import {
  discoverEntries,
  listDiscoverSkills,
  type DiscoverEntry,
  type DiscoverListState,
  type DiscoverPageResult,
  type DiscoverSkill
} from "./discoverApi";
import {
  checkRepositorySkill,
  installRepositorySkill,
  repositoryInstallInputFromDiscoverSkill
} from "./repositoryInstallApi";

type DiscoverPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  onOpenRemoteSkill: (skill: DiscoverSkill) => void;
};

const initialState: DiscoverListState = {
  entry: "all",
  page: 1,
  query: "",
  pageSize: 25
};

export function DiscoverPage({ catalog, language, onOpenRemoteSkill }: DiscoverPageProps) {
  const [state, setState] = useState<DiscoverListState>(initialState);
  const [draftQuery, setDraftQuery] = useState(initialState.query);
  const [result, setResult] = useState<DiscoverPageResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);
  const [isRepositoryInstallOpen, setIsRepositoryInstallOpen] = useState(false);
  const [repositorySource, setRepositorySource] = useState("");
  const [repositorySkillName, setRepositorySkillName] = useState("");
  const [repositoryCheckMessage, setRepositoryCheckMessage] = useState<string | null>(null);
  const [repositoryInstallError, setRepositoryInstallError] = useState<string | null>(null);
  const [isCheckingRepository, setIsCheckingRepository] = useState(false);
  const [isInstallingRepository, setIsInstallingRepository] = useState(false);

  useEffect(() => {
    let ignore = false;

    readSettings()
      .then((settings) => {
        if (!ignore) {
          setState((current) => ({
            ...current,
            pageSize: settings.discoverPageSize
          }));
        }
      })
      .catch(() => {
        if (!ignore) {
          setState((current) => ({
            ...current,
            pageSize: 25
          }));
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    setIsLoading(true);
    listDiscoverSkills(state)
      .then((page) => {
        if (!ignore) {
          setResult(page);
          setState((current) => ({
            ...current,
            page: page.page,
            query: page.query,
            pageSize: page.pageSize
          }));
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
  }, [state.entry, state.page, state.query, state.pageSize]);

  useEffect(() => {
    setInstallError(null);
    setInstallMessage(null);
  }, [state.entry, state.page]);

  useEffect(() => {
    if (!isRepositoryInstallOpen) {
      setRepositoryCheckMessage(null);
      setRepositoryInstallError(null);
      setIsCheckingRepository(false);
      setIsInstallingRepository(false);
    }
  }, [isRepositoryInstallOpen]);

  function handleEntryChange(entry: DiscoverEntry) {
    setState((current) => ({
      ...current,
      entry,
      page: 1
    }));
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState((current) => ({
      ...current,
      entry: "search",
      page: 1,
      query: draftQuery
    }));
  }

  function handlePageChange(page: number) {
    setState((current) => ({
      ...current,
      page
    }));
  }

  async function handleInstallDiscoveredSkill(skill: DiscoverSkill) {
    setInstallingSkillId(skill.id);
    setInstallError(null);
    setInstallMessage(null);

    try {
      const installed = await installRepositorySkill(repositoryInstallInputFromDiscoverSkill(skill));
      setInstallMessage(
        t(catalog, language, "discover.install.success", {
          name: installed.name,
          source: installed.sourceRef
        })
      );
    } catch (reason) {
      setInstallError(errorMessage(reason));
    } finally {
      setInstallingSkillId(null);
    }
  }

  async function handleCheckRepositoryInstall() {
    setIsCheckingRepository(true);
    setRepositoryInstallError(null);
    setRepositoryCheckMessage(null);

    try {
      const result = await checkRepositorySkill({
        source: repositorySource.trim(),
        skillName: repositorySkillName.trim()
      });
      setRepositoryCheckMessage(`${result.skillName} · ${result.sourceRef}`);
    } catch (reason) {
      setRepositoryInstallError(errorMessage(reason));
    } finally {
      setIsCheckingRepository(false);
    }
  }

  async function handleRepositoryInstall(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsInstallingRepository(true);
    setRepositoryInstallError(null);
    setRepositoryCheckMessage(null);
    setInstallError(null);
    setInstallMessage(null);

    try {
      const installed = await installRepositorySkill({
        source: repositorySource.trim(),
        skillName: repositorySkillName.trim()
      });
      setInstallMessage(
        t(catalog, language, "discover.install.success", {
          name: installed.name,
          source: installed.sourceRef
        })
      );
      setIsRepositoryInstallOpen(false);
      setRepositorySource("");
      setRepositorySkillName("");
    } catch (reason) {
      setRepositoryInstallError(errorMessage(reason));
    } finally {
      setIsInstallingRepository(false);
    }
  }

  const page = result?.page ?? state.page;
  const totalPages = result?.totalPages ?? 1;

  return (
    <section className="page-stack" aria-labelledby="discover-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "discover.eyebrow")}</p>
          <h1 id="discover-title">{t(catalog, language, "discover.title")}</h1>
        </div>
      </header>

      <section className={`panel ${styles.controls}`} aria-labelledby="discover-controls-title">
        <div className={`panel-header ${styles.controlsHeader}`}>
          <div>
            <h2 id="discover-controls-title">
              {t(catalog, language, "discover.controls.title")}
            </h2>
            <p>{t(catalog, language, "discover.controls.description")}</p>
          </div>
          <button
            className="button button-primary"
            onClick={() => setIsRepositoryInstallOpen(true)}
            type="button"
          >
            <Plus size={16} weight="bold" aria-hidden="true" />
            {t(catalog, language, "discover.install.title")}
          </button>
        </div>

        <div className={styles.controlBody}>
          <div
            className="tab-list"
            aria-label={t(catalog, language, "discover.tabs.label")}
          >
            {discoverEntries.map((entry) => {
              const selected = state.entry === entry;
              return (
                <button
                  aria-pressed={selected}
                  className={selected ? "tab-button tab-button-active" : "tab-button"}
                  key={entry}
                  onClick={() => handleEntryChange(entry)}
                  type="button"
                >
                  {t(catalog, language, `discover.tab.${entry}`)}
                </button>
              );
            })}
          </div>

          <form className={styles.searchForm} onSubmit={handleSearch}>
            <label className="search-field">
              <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
              <span className="sr-only">{t(catalog, language, "discover.search.label")}</span>
              <input
                autoComplete="off"
                name="discover-search"
                onChange={(event) => setDraftQuery(event.target.value)}
                placeholder={t(catalog, language, "discover.search.placeholder")}
                type="search"
                value={draftQuery}
              />
            </label>
            <button className="button button-primary" type="submit">
              <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "discover.search.submit")}
            </button>
          </form>
        </div>
      </section>

      <section
        aria-labelledby="discover-results-title"
        className="panel"
        id="discover-results-panel"
      >
        <div className="panel-header">
          <div>
            <h2 id="discover-results-title">{t(catalog, language, "discover.results.title")}</h2>
            <p>{t(catalog, language, "discover.results.description")}</p>
          </div>
          <TrendUp size={20} weight="bold" aria-hidden="true" />
        </div>

        {error ? (
          <p className="form-error panel-message" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t(catalog, language, "discover.table.name")}</th>
                <th scope="col">{t(catalog, language, "discover.table.source")}</th>
                <th scope="col">{t(catalog, language, "discover.table.tags")}</th>
                <th scope="col">{t(catalog, language, "discover.table.installs")}</th>
                <th scope="col">{t(catalog, language, "discover.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5}>{t(catalog, language, "discover.loading")}</td>
                </tr>
              ) : null}

              {!isLoading && result?.items.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="empty-state">
                      <Package size={20} weight="bold" aria-hidden="true" />
                      <strong>{t(catalog, language, "discover.empty.title")}</strong>
                      <p>{t(catalog, language, "discover.empty.copy")}</p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? result?.items.map((skill) => (
                    <tr key={skill.id}>
                      <td>
                        <strong className="table-primary">{skill.name}</strong>
                        {skill.description ? (
                          <span className="table-secondary">{skill.description}</span>
                        ) : null}
                      </td>
                      <td>
                        <span className="table-primary">{skill.sourceRef}</span>
                        <span className="table-secondary">{skill.skillPath}</span>
                      </td>
                      <td>
                        <div className="tag-list">
                          {skill.tags.map((tag) => (
                            <span className="status-badge status-custom" key={tag}>
                              {tag}
                            </span>
                          ))}
                          {skill.isOfficial ? (
                            <span className="status-badge status-global">
                              {t(catalog, language, "discover.remote.official")}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="number-cell">{formatNumber(skill.installs)}</td>
                      <td>
                        <div className="row-actions">
                          <button
                            aria-label={`Open ${skill.name} details`}
                            className="icon-button"
                            onClick={() => onOpenRemoteSkill(skill)}
                            type="button"
                          >
                            <Eye size={18} weight="bold" aria-hidden="true" />
                          </button>
                          <button
                            aria-label={`Install ${skill.name}`}
                            className="icon-button"
                            disabled={installingSkillId !== null}
                            onClick={() => void handleInstallDiscoveredSkill(skill)}
                            type="button"
                          >
                            <DownloadSimple size={18} weight="bold" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>

        <div
          className="pagination-bar"
          aria-label={t(catalog, language, "discover.pagination.label")}
        >
          <button
            className="button button-secondary"
            disabled={page <= 1 || isLoading}
            onClick={() => handlePageChange(page - 1)}
            type="button"
          >
            {t(catalog, language, "discover.pagination.previous")}
          </button>
          <span>
            {t(catalog, language, "discover.pagination.status", {
              page,
              totalPages
            })}
          </span>
          <button
            className="button button-secondary"
            disabled={page >= totalPages || isLoading}
            onClick={() => handlePageChange(page + 1)}
            type="button"
          >
            {t(catalog, language, "discover.pagination.next")}
          </button>
        </div>
      </section>

      {isRepositoryInstallOpen ? (
        <div className="modal-backdrop" onClick={() => setIsRepositoryInstallOpen(false)}>
          <section
            aria-labelledby="discover-install-dialog-title"
            aria-modal="true"
            className="modal-panel modal-panel-compact"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <h2 id="discover-install-dialog-title">
                  {t(catalog, language, "discover.install.title")}
                </h2>
                <p>{t(catalog, language, "discover.install.description")}</p>
              </div>
              <button
                aria-label={t(catalog, language, "discover.install.close")}
                className="icon-button"
                onClick={() => setIsRepositoryInstallOpen(false)}
                type="button"
              >
                ×
              </button>
            </div>

            <form className={styles.installForm} onSubmit={handleRepositoryInstall}>
              <div className={styles.installFields}>
                <label className="field">
                  <span>{t(catalog, language, "discover.install.source")}</span>
                  <input
                    name="repository-source"
                    onChange={(event) => setRepositorySource(event.target.value)}
                    placeholder={t(catalog, language, "discover.install.sourcePlaceholder")}
                    type="text"
                    value={repositorySource}
                  />
                </label>

                <label className="field">
                  <span>{t(catalog, language, "discover.install.skillName")}</span>
                  <input
                    name="repository-skill-name"
                    onChange={(event) => setRepositorySkillName(event.target.value)}
                    placeholder={t(catalog, language, "discover.install.skillNamePlaceholder")}
                    type="text"
                    value={repositorySkillName}
                  />
                </label>
              </div>

              {(repositoryInstallError || repositoryCheckMessage) ? (
                <div className={styles.installMessages}>
                  {repositoryInstallError ? (
                    <p className="form-error" role="alert">
                      {repositoryInstallError}
                    </p>
                  ) : null}

                  {repositoryCheckMessage ? (
                    <p className="form-hint" role="status">
                      {repositoryCheckMessage}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.installActions}>
                <button
                  className="button button-secondary"
                  disabled={
                    isCheckingRepository ||
                    isInstallingRepository ||
                    repositorySource.trim().length === 0 ||
                    repositorySkillName.trim().length === 0
                  }
                  onClick={() => void handleCheckRepositoryInstall()}
                  type="button"
                >
                  {isCheckingRepository
                    ? t(catalog, language, "discover.install.checking")
                    : t(catalog, language, "discover.install.check")}
                </button>
                <button
                  className="button button-primary"
                  disabled={
                    isCheckingRepository ||
                    isInstallingRepository ||
                    repositorySource.trim().length === 0 ||
                    repositorySkillName.trim().length === 0
                  }
                  type="submit"
                >
                  {isInstallingRepository
                    ? t(catalog, language, "discover.install.installing")
                    : t(catalog, language, "discover.install.submit")}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

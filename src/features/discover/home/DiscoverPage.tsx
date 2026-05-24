import {
  DownloadSimple,
  Eye,
  FileArrowUp,
  MagnifyingGlass,
  Package,
  Plus,
  TrendUp,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { FormEvent, useEffect, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../../app/i18n";
import { message } from "../../../shared/components/message";
import { Modal } from "../../../shared/components/Modal";
import { readSettings } from "../../settings/settingsApi";
import styles from "./DiscoverPage.module.css";
import {
  discoverEntries,
  listDiscoverSkills,
  type DiscoverEntry,
  type DiscoverListState,
  type DiscoverPageResult,
  type DiscoverSkill
} from "../discoverApi";
import {
  checkRepositorySkill,
  installRepositorySkill,
  isCheckAllResult,
  repositoryInstallInputFromDiscoverSkill,
  type RepositoryInstallProgress
} from "../repositoryInstallApi";
import {
  checkFileImport,
  installFromFile,
  type FileImportCheckResult,
  type FileImportProgress,
  type FileImportType
} from "../../skills/fileImportApi";
import { CollectionDetailModal } from "./CollectionDetailModal";
import { refreshCollectionIndex } from "../../collections/collectionsApi";

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
  const [installingSkillId, setInstallingSkillId] = useState<string | null>(null);
  const [isRepositoryInstallOpen, setIsRepositoryInstallOpen] = useState(false);
  const [repositorySource, setRepositorySource] = useState("");
  const [repositorySkillName, setRepositorySkillName] = useState("");
  const [repositoryCheckMessage, setRepositoryCheckMessage] = useState<string | null>(null);
  const [repositoryInstallError, setRepositoryInstallError] = useState<string | null>(null);
  const [isCheckingRepository, setIsCheckingRepository] = useState(false);
  const [isInstallingRepository, setIsInstallingRepository] = useState(false);
  const [repositoryProgress, setRepositoryProgress] = useState<RepositoryInstallProgress | null>(null);

  // File import state
  const [installTab, setInstallTab] = useState<"repository" | "file">("repository");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileType, setFileType] = useState<FileImportType>("npx");
  const [fileCheckResult, setFileCheckResult] = useState<FileImportCheckResult | null>(null);
  const [fileImportError, setFileImportError] = useState<string | null>(null);
  const [isCheckingFile, setIsCheckingFile] = useState(false);
  const [isInstallingFile, setIsInstallingFile] = useState(false);
  const [fileProgress, setFileProgress] = useState<FileImportProgress | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<import("../../collections/collectionsApi").CollectionIndexEntry | null>(null);
  const [isRefreshingCollections, setIsRefreshingCollections] = useState(false);

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
    if (!isRepositoryInstallOpen) {
      setRepositoryCheckMessage(null);
      setRepositoryInstallError(null);
      setIsCheckingRepository(false);
      setIsInstallingRepository(false);
      setRepositoryProgress(null);
      setInstallTab("repository");
      setSelectedFile(null);
      setFileCheckResult(null);
      setFileImportError(null);
      setIsCheckingFile(false);
      setIsInstallingFile(false);
      setFileProgress(null);
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

  async function handleRefreshCollections() {
    setIsRefreshingCollections(true);
    try {
      await refreshCollectionIndex();
      setState((current) => ({ ...current, page: 1 }));
    } catch {
      // ignore
    } finally {
      setIsRefreshingCollections(false);
    }
  }

  async function handleInstallDiscoveredSkill(skill: DiscoverSkill) {
    setInstallingSkillId(skill.id);

    try {
      const installed = await installRepositorySkill(repositoryInstallInputFromDiscoverSkill(skill));
      const first = installed[0];
      message.success(
        t(catalog, language, "discover.install.success", {
          name: first.name,
          source: first.sourceRef
        })
      );
    } catch (reason) {
      message.error(errorMessage(reason));
    } finally {
      setInstallingSkillId(null);
    }
  }

  async function handleCheckRepositoryInstall() {
    setIsCheckingRepository(true);
    setRepositoryInstallError(null);
    setRepositoryCheckMessage(null);

    try {
      const outcome = await checkRepositorySkill({
        source: repositorySource.trim(),
        skillName: repositorySkillName.trim()
      });
      if (isCheckAllResult(outcome)) {
        setRepositoryCheckMessage(
          t(catalog, language, "discover.install.checkAll", {
            count: String(outcome.total),
            names: outcome.names.join(", ")
          })
        );
      } else {
        setRepositoryCheckMessage(`${outcome.skillName} · ${outcome.sourceRef}`);
      }
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
    setRepositoryProgress(null);

    try {
      const installed = await installRepositorySkill(
        {
          source: repositorySource.trim(),
          skillName: repositorySkillName.trim()
        },
        (progress) => setRepositoryProgress(progress)
      );
      if (installed.length === 1) {
        message.success(
          t(catalog, language, "discover.install.success", {
            name: installed[0].name,
            source: installed[0].sourceRef
          })
        );
      } else {
        message.success(
          t(catalog, language, "discover.install.successAll", {
            count: String(installed.length),
            source: installed[0].sourceRef
          })
        );
      }
      setIsRepositoryInstallOpen(false);
      setRepositorySource("");
      setRepositorySkillName("");
    } catch (reason) {
      setRepositoryInstallError(errorMessage(reason));
    } finally {
      setIsInstallingRepository(false);
    }
  }

  async function handleSelectFile() {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "JSON",
            extensions: ["json"]
          }
        ]
      });
      if (selected) {
        setSelectedFile(selected as string);
        setFileCheckResult(null);
        setFileImportError(null);
      }
    } catch (reason) {
      setFileImportError(errorMessage(reason));
    }
  }

  function handleFileDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const files = event.dataTransfer.files;
    if (files.length > 0) {
      const file = files[0];
      const filePath = (file as any).path;
      if (filePath) {
        setSelectedFile(filePath);
        setFileCheckResult(null);
        setFileImportError(null);
      }
    }
  }

  function handleDragOver(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function handleCheckFile() {
    if (!selectedFile) return;

    setIsCheckingFile(true);
    setFileImportError(null);
    setFileCheckResult(null);

    try {
      const result = await checkFileImport(selectedFile, fileType);
      setFileCheckResult(result);
    } catch (reason) {
      setFileImportError(errorMessage(reason));
    } finally {
      setIsCheckingFile(false);
    }
  }

  async function handleInstallFromFile() {
    if (!selectedFile) return;

    setIsInstallingFile(true);
    setFileImportError(null);
    setFileProgress(null);

    try {
      const installed = await installFromFile(
        selectedFile,
        fileType,
        (progress) => setFileProgress(progress)
      );
      message.success(
        t(catalog, language, "skills.fileImport.success", {
          count: String(installed.length)
        })
      );
      setIsRepositoryInstallOpen(false);
      setSelectedFile(null);
      setFileCheckResult(null);
    } catch (reason) {
      setFileImportError(errorMessage(reason));
    } finally {
      setIsInstallingFile(false);
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
            {t(catalog, language, "skills.install.title")}
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

          {state.entry === "collections" ? (
            <button
              className="button button-secondary"
              disabled={isRefreshingCollections}
              onClick={() => void handleRefreshCollections()}
              type="button"
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
              {isRefreshingCollections
                ? t(catalog, language, "collections.detail.installing")
                : t(catalog, language, "collections.refresh")}
            </button>
          ) : (
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
          )}
        </div>
      </section>

      <section
        aria-labelledby="discover-results-title"
        className="panel"
        id="discover-results-panel"
      >
        <div className="panel-header">
          <div>
            <h2 id="discover-results-title">
              {state.entry === "collections"
                ? t(catalog, language, "discover.collections.title")
                : t(catalog, language, "discover.results.title")}
            </h2>
            <p>
              {state.entry === "collections"
                ? t(catalog, language, "discover.collections.description")
                : t(catalog, language, "discover.results.description")}
            </p>
          </div>
          {state.entry === "collections" ? (
            <Package size={20} weight="bold" aria-hidden="true" />
          ) : (
            <TrendUp size={20} weight="bold" aria-hidden="true" />
          )}
        </div>

        {error ? (
          <p className="form-error panel-message" role="alert" aria-live="assertive">
            {error}
          </p>
        ) : null}

        <div className="table-wrap">
          {state.entry === "collections" ? (
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

                {!isLoading && result?.items.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <Package size={20} weight="bold" aria-hidden="true" />
                        <strong>{t(catalog, language, "discover.collections.empty.title")}</strong>
                        <p>{t(catalog, language, "discover.collections.empty.copy")}</p>
                      </div>
                    </td>
                  </tr>
                ) : null}

                {!isLoading
                  ? result?.items.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong className="table-primary">{item.name}</strong>
                        </td>
                        <td>
                          <span className="table-secondary">{item.description}</span>
                        </td>
                        <td>
                          <span className="table-primary">{item.version ?? ""}</span>
                        </td>
                        <td className="number-cell">{formatNumber(item.installs)}</td>
                        <td>
                          <div className="row-actions">
                            <button
                              aria-label={`${t(catalog, language, "discover.collections.action.viewDetail")} ${item.name}`}
                              className="icon-button"
                              onClick={() => setSelectedCollection({
                                title: item.name,
                                description: item.description ?? "",
                                version: item.version ?? "",
                                totalSkills: item.installs,
                                file: item.id
                              })}
                              type="button"
                            >
                              <Eye size={18} weight="bold" aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  : null}
              </tbody>
            </table>
          ) : (
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
          )}
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
            {t(catalog, language, "pagination.previous")}
          </button>
          <span>
            {t(catalog, language, "pagination.status", {
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
            {t(catalog, language, "pagination.next")}
          </button>
        </div>
      </section>

      {isRepositoryInstallOpen ? (
        <Modal
          closeLabel={t(catalog, language, "discover.install.close")}
          description={t(catalog, language, "discover.install.description")}
          title={t(catalog, language, "discover.install.title")}
          onClose={() => setIsRepositoryInstallOpen(false)}
          compact={false}
        >
          <div className={styles.installTabs}>
            <button
              aria-pressed={installTab === "repository"}
              className={installTab === "repository" ? "tab-button tab-button-active" : "tab-button"}
              onClick={() => setInstallTab("repository")}
              type="button"
            >
              {t(catalog, language, "skills.install.tab.repository")}
            </button>
            <button
              aria-pressed={installTab === "file"}
              className={installTab === "file" ? "tab-button tab-button-active" : "tab-button"}
              onClick={() => setInstallTab("file")}
              type="button"
            >
              {t(catalog, language, "skills.install.tab.file")}
            </button>
          </div>

          {installTab === "repository" ? (
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
                  <p className="field-hint">{t(catalog, language, "discover.install.skillNameHint")}</p>
                </label>
              </div>

              {(repositoryInstallError || repositoryCheckMessage || repositoryProgress) ? (
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

                  {repositoryProgress ? (
                    <p className="form-progress" role="status">
                      {repositoryProgress.message}
                      {repositoryProgress.current && repositoryProgress.total ? (
                        <span className={styles.progressFraction}>
                          {" "}{repositoryProgress.current}/{repositoryProgress.total}
                        </span>
                      ) : null}
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
          ) : (
            <div className={styles.installForm}>
              <div className={styles.installFields}>
                <div className={styles.fileInputRow}>
                  <label className="field" style={{ flex: 1 }}>
                    <span>{t(catalog, language, "skills.fileImport.selectFile")}</span>
                    <div
                      className={styles.fileInputWrapper}
                      onDrop={handleFileDrop}
                      onDragOver={handleDragOver}
                    >
                      <input
                        className={styles.fileInputDisplay}
                        readOnly
                        type="text"
                        value={selectedFile ?? t(catalog, language, "skills.fileImport.noFileSelected")}
                      />
                      <button
                        className="button button-secondary"
                        onClick={() => void handleSelectFile()}
                        type="button"
                      >
                        <FileArrowUp size={16} weight="bold" aria-hidden="true" />
                      </button>
                    </div>
                    <p className="field-hint">{t(catalog, language, "skills.fileImport.dropHint")}</p>
                  </label>
                  <label className="field" style={{ width: "180px" }}>
                    <span>{t(catalog, language, "skills.fileImport.fileType")}</span>
                    <select
                      onChange={(event) => {
                        setFileType(event.target.value as FileImportType);
                        setFileCheckResult(null);
                      }}
                      value={fileType}
                    >
                      <option value="npx">{t(catalog, language, "skills.fileImport.fileType.npx")}</option>
                    </select>
                  </label>
                </div>
              </div>

              {(fileImportError || fileCheckResult || fileProgress) ? (
                <div className={styles.installMessages}>
                  {fileImportError ? (
                    <p className="form-error" role="alert">
                      {fileImportError}
                    </p>
                  ) : null}

                  {fileCheckResult ? (
                    <p className={fileCheckResult.valid ? "form-hint" : "form-error"} role="status">
                      {fileCheckResult.valid
                        ? t(catalog, language, "skills.fileImport.checkResult", {
                            count: String(fileCheckResult.skillCount),
                            names: fileCheckResult.skillNames.join(", ")
                          })
                        : t(catalog, language, "skills.fileImport.invalidFile")}
                    </p>
                  ) : null}

                  {fileProgress ? (
                    <p className="form-progress" role="status">
                      {fileProgress.message}
                      {fileProgress.current && fileProgress.total ? (
                        <span className={styles.progressFraction}>
                          {" "}{fileProgress.current}/{fileProgress.total}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.installActions}>
                <button
                  className="button button-secondary"
                  disabled={
                    !selectedFile ||
                    isCheckingFile ||
                    isInstallingFile
                  }
                  onClick={() => void handleCheckFile()}
                  type="button"
                >
                  {isCheckingFile
                    ? t(catalog, language, "skills.fileImport.checking")
                    : t(catalog, language, "skills.fileImport.check")}
                </button>
                <button
                  className="button button-primary"
                  disabled={
                    !selectedFile ||
                    !fileCheckResult?.valid ||
                    isCheckingFile ||
                    isInstallingFile
                  }
                  onClick={() => void handleInstallFromFile()}
                  type="button"
                >
                  {isInstallingFile
                    ? fileProgress
                      ? t(catalog, language, "skills.fileImport.installing", {
                          current: String(fileProgress.current ?? 0),
                          total: String(fileProgress.total ?? 0)
                        })
                      : t(catalog, language, "discover.install.installing")
                    : t(catalog, language, "skills.fileImport.install")}
                </button>
              </div>
            </div>
          )}
        </Modal>
      ) : null}

      {selectedCollection ? (
        <CollectionDetailModal
          catalog={catalog}
          entry={selectedCollection}
          language={language}
          onClose={() => setSelectedCollection(null)}
          onInstalled={() => {
            setSelectedCollection(null);
          }}
        />
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

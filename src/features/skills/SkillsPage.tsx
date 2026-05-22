import {
  ArrowClockwise,
  Eye,
  MagnifyingGlass,
  Package
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../i18n";
import { readSettings } from "../settings/settingsApi";
import {
  checkInstalledSkillUpdates,
  listInstalledSkills,
  updateInstalledSkill,
  updateInstalledSkills,
  type InstalledSkill,
  type SkillUpdateBatchResult,
  type SkillUpdateRepositoryErrorRecord,
  type SkillUpdateStatusRecord
} from "./skillsApi";
import { buildSkillsPage, buildSkillsSummary, filterInstalledSkills } from "./skillsPageModel";
import {
  buildInitialUpdateRuntimeState,
  buildUpdateRuntimeView,
  finishCheckingUpdates,
  finishUpdatingSkill,
  startCheckingUpdates,
  startUpdatingAllSkills,
  startUpdatingSkill,
  type SkillUpdateRuntimeState
} from "./skillsUpdateState";

type SkillsPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  onOpenSkill: (skillId: string) => void;
};

export function SkillsPage({ catalog, language, onOpenSkill }: SkillsPageProps) {
  const [skills, setSkills] = useState<InstalledSkill[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [updateState, setUpdateState] = useState<SkillUpdateRuntimeState>(
    buildInitialUpdateRuntimeState()
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

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
    let ignore = false;

    listInstalledSkills()
      .then((items) => {
        if (!ignore) {
          setSkills(items);
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

  const filteredSkills = filterInstalledSkills(skills, query);
  const page = useMemo(
    () => buildSkillsPage(filteredSkills, currentPage, pageSize),
    [filteredSkills, currentPage, pageSize]
  );
  const summary = buildSkillsSummary(skills);
  const updateRuntimeView = buildUpdateRuntimeView(skills, updateState);

  async function handleCheckUpdates() {
    setUpdateState((current) => startCheckingUpdates(current));
    setError(null);

    try {
      const results = await checkInstalledSkillUpdates();
      setSkills((current) => mergeSkillStatuses(current, results.statuses));
      setUpdateState((current) => finishCheckingUpdates(current, results.statuses));
      setError(formatBatchError(catalog, language, "check", results));
    } catch (reason: unknown) {
      setError(errorMessage(reason));
      setUpdateState((current) => ({
        ...current,
        isCheckingUpdates: false
      }));
    }
  }

  async function handleUpdateSkill(skillId: string) {
    setUpdateState((current) => startUpdatingSkill(current, skillId));
    setError(null);

    try {
      const result = await updateInstalledSkill(skillId);
      setSkills((current) => mergeSkillStatuses(current, [result]));
      setUpdateState((current) => finishUpdatingSkill(current, result));
    } catch (reason: unknown) {
      setError(errorMessage(reason));
      setUpdateState((current) => finishUpdatingSkill(current, {
        id: skillId,
        updateAvailable:
          skills.find((skill) => skill.id === skillId)?.updateAvailable ?? false
      }));
    }
  }

  async function handleUpdateAll() {
    const targetIds = updateRuntimeView.rows
      .filter((row) => row.showRowUpdateAction)
      .map((row) => row.id);

    if (targetIds.length === 0) {
      return;
    }

    setUpdateState((current) => startUpdatingAllSkills(current, targetIds));
    setError(null);

    try {
      const results = await updateInstalledSkills(targetIds);
      setSkills((current) => mergeSkillStatuses(current, results.statuses));
      setUpdateState((current) =>
        results.statuses.reduce(
          (state, result) => finishUpdatingSkill(state, result),
          current
        )
      );
      setError(formatBatchError(catalog, language, "update", results));
    } catch (reason: unknown) {
      setError(errorMessage(reason));
      setUpdateState((current) =>
        targetIds.reduce(
          (state, skillId) =>
            finishUpdatingSkill(state, {
              id: skillId,
              updateAvailable:
                skills.find((skill) => skill.id === skillId)?.updateAvailable ?? false
            }),
          current
        )
      );
    }
  }

  return (
    <section className="page-stack" aria-labelledby="skills-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "skills.eyebrow")}</p>
          <h1 id="skills-title">{t(catalog, language, "skills.title")}</h1>
        </div>
        <div className="toolbar" aria-label={t(catalog, language, "skills.actionsLabel")}>
          <label className="search-field">
            <MagnifyingGlass size={16} weight="bold" aria-hidden="true" />
            <span className="sr-only">{t(catalog, language, "skills.searchLabel")}</span>
            <input
              autoComplete="off"
              name="skill-search"
              onChange={(event) => { setQuery(event.target.value); setCurrentPage(1); }}
              placeholder={t(catalog, language, "skills.searchPlaceholder")}
              type="search"
              value={query}
            />
          </label>
          {updateRuntimeView.showUpdateAll ? (
            <button
              className="button button-primary"
              disabled={updateRuntimeView.updateAllDisabled}
              onClick={() => void handleUpdateAll()}
              type="button"
            >
              <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "skills.updateAll")}
            </button>
          ) : null}
          <button
            aria-busy={updateRuntimeView.isCheckingUpdates}
            className="button button-secondary"
            disabled={updateRuntimeView.isCheckingUpdates}
            onClick={() => void handleCheckUpdates()}
            type="button"
          >
            <ArrowClockwise size={16} weight="bold" aria-hidden="true" />
            {updateRuntimeView.isCheckingUpdates
              ? t(catalog, language, "skills.checkingUpdates")
              : t(catalog, language, "skills.checkUpdates")}
          </button>
        </div>
      </header>

      <section className="stats-grid" aria-label={t(catalog, language, "skills.summaryLabel")}>
        <article className="metric-card">
          <p>{t(catalog, language, "skills.metric.managed")}</p>
          <strong>{summary.managed}</strong>
        </article>
        <article className="metric-card">
          <p>{t(catalog, language, "skills.metric.inUse")}</p>
          <strong>{summary.inUse}</strong>
        </article>
        <article className="metric-card">
          <p>{t(catalog, language, "skills.metric.updates")}</p>
          <strong>{summary.updates}</strong>
        </article>
        <article className="metric-card">
          <p>{t(catalog, language, "skills.metric.unused")}</p>
          <strong>{summary.unused}</strong>
        </article>
      </section>

      <section className="panel" aria-labelledby="skills-table-title">
        <div className="panel-header">
          <div>
            <h2 id="skills-table-title">{t(catalog, language, "skills.table.title")}</h2>
            <p>{t(catalog, language, "skills.table.description")}</p>
          </div>
        </div>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">{t(catalog, language, "skills.table.name")}</th>
                <th scope="col">{t(catalog, language, "skills.table.source")}</th>
                <th scope="col">{t(catalog, language, "skills.table.projects")}</th>
                <th scope="col">{t(catalog, language, "skills.table.usage")}</th>
                <th scope="col">{t(catalog, language, "skills.table.update")}</th>
                <th scope="col">{t(catalog, language, "skills.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6}>{t(catalog, language, "skills.loading")}</td>
                </tr>
              ) : null}

              {!isLoading && filteredSkills.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Package size={20} weight="bold" aria-hidden="true" />
                      <strong>{t(catalog, language, "skills.empty.title")}</strong>
                      <p>{t(catalog, language, "skills.empty.copy")}</p>
                    </div>
                  </td>
                </tr>
              ) : null}

              {page.items.map((skill) => {
                const rowState = updateRuntimeView.rows.find((row) => row.id === skill.id);

                return (
                <tr
                  key={skill.id}
                  aria-disabled={rowState?.rowDisabled ? "true" : undefined}
                  className={rowState?.rowDisabled ? "table-row-disabled" : undefined}
                >
                  <td>
                    <button
                      className="table-link-button"
                      disabled={rowState?.rowDisabled}
                      onClick={() => onOpenSkill(skill.id)}
                      type="button"
                    >
                      {skill.name}
                    </button>
                    <span className="table-secondary">{skill.skillPath}</span>
                  </td>
                  <td>
                    <span className="table-primary">{skill.sourceType}</span>
                    <span className="table-secondary">{skill.sourceRef}</span>
                  </td>
                  <td>
                    <span className="table-primary">
                      {t(catalog, language, "skills.projects.activeProjects", {
                        count: skill.activeProjectCount
                      })}
                    </span>
                    <span className="table-secondary">
                      {t(catalog, language, "skills.projects.attachedProjects", {
                        count: skill.attachedProjectCount
                      })}
                    </span>
                  </td>
                  <td>
                    {skill.activeProjectCount > 0 ? (
                      <span className="status-badge status-current">
                        {t(catalog, language, "skills.status.inUse")}
                      </span>
                    ) : skill.attachedProjectCount > 0 ? (
                      <span className="status-badge status-update">
                        {t(catalog, language, "skills.status.disabled")}
                      </span>
                    ) : (
                      <span className="status-badge status-project">
                        {t(catalog, language, "skills.status.unused")}
                      </span>
                    )}
                  </td>
                  <td>
                    {rowState?.updateLabel === "loading" ? (
                      <span className="status-badge status-project">
                        {t(catalog, language, "skills.checkingStatus")}
                      </span>
                    ) : rowState?.updateLabel === "updating" ? (
                      <span className="status-badge status-project">
                        {t(catalog, language, "skills.updating")}
                      </span>
                    ) : rowState?.updateLabel === "available" ? (
                      <span className="status-badge status-update">
                        {t(catalog, language, "skills.updateAvailable")}
                      </span>
                    ) : (
                      <span className="status-badge status-current">
                        {t(catalog, language, "skills.current")}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="row-actions">
                      {rowState?.showRowUpdateAction ? (
                        <button
                          aria-label={t(catalog, language, "skills.action.update", {
                            name: skill.name
                          })}
                          className="icon-button"
                          disabled={rowState.rowDisabled || updateRuntimeView.updateAllDisabled}
                          onClick={() => void handleUpdateSkill(skill.id)}
                          type="button"
                        >
                          <ArrowClockwise size={18} weight="bold" aria-hidden="true" />
                        </button>
                      ) : null}
                      <button
                        aria-label={t(catalog, language, "skills.action.viewUsage", {
                          name: skill.name
                        })}
                        className="icon-button"
                        disabled={rowState?.rowDisabled}
                        onClick={() => onOpenSkill(skill.id)}
                        type="button"
                      >
                        <Eye size={18} weight="bold" aria-hidden="true" />
                      </button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>

        {!isLoading && page.filteredCount > 0 ? (
          <div className="pagination-bar" aria-label={t(catalog, language, "skills.pagination.label")}>
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
              onClick={() => setCurrentPage((value) => Math.min(page.totalPages, value + 1))}
              type="button"
            >
              {t(catalog, language, "pagination.next")}
            </button>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

function formatBatchError(
  catalog: I18nCatalog,
  language: LanguageCode,
  mode: "check" | "update",
  result: SkillUpdateBatchResult
) {
  if (result.repositoryErrors.length === 0) {
    return null;
  }

  return result.repositoryErrors
    .map((item) => formatRepositoryError(catalog, language, mode, item))
    .join(" ");
}

function formatRepositoryError(
  catalog: I18nCatalog,
  language: LanguageCode,
  mode: "check" | "update",
  error: SkillUpdateRepositoryErrorRecord
) {
  return t(
    catalog,
    language,
    mode === "check"
      ? "skills.repositoryCheckError"
      : "skills.repositoryUpdateError",
    {
      source: error.sourceRef,
      count: error.skillCount,
      message: error.message
    }
  );
}

function mergeSkillStatuses(
  skills: InstalledSkill[],
  updates: SkillUpdateStatusRecord[]
) {
  const updatesById = new Map(updates.map((update) => [update.id, update]));

  return skills.map((skill) => {
    const update = updatesById.get(skill.id);

    if (!update) {
      return skill;
    }

    return {
      ...skill,
      updateAvailable: update.updateAvailable,
      installedVersion: update.installedVersion,
      latestVersion: update.latestVersion
    };
  });
}

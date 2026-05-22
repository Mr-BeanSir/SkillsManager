import { useEffect, useState } from "react";
import { appNavItems } from "./appNav";
import { MessageProvider } from "./message";
import {
  type AppPageState,
  cliTargetsRoute,
  getNavPageId,
  getRouteEntityId,
  groupDetailRoute,
  isCliTargetsRoute,
  isGroupDetailRoute,
  isProjectDetailRoute,
  isRemoteSkillDetailRoute,
  isSkillDetailRoute,
  projectDetailRoute,
  remoteSkillDetailRoute,
  skillDetailRoute
} from "./appPageState";
import { DiscoverPage } from "./features/discover/DiscoverPage";
import { RemoteSkillDetailPage } from "./features/discover/RemoteSkillDetailPage";
import type { DiscoverSkill } from "./features/discover/discoverApi";
import { ConnectedGroupDetailPage } from "./features/groups/GroupDetailPage";
import { GroupsPage } from "./features/groups/GroupsPage";
import { ProjectDetailPage } from "./features/projects/ProjectDetailPage";
import { ProjectsPage } from "./features/projects/ProjectsPage";
import { CliTargetsPage } from "./features/settings/CliTargetsPage";
import { SettingsPage } from "./features/settings/SettingsPage";
import {
  exitApplication,
  readDesktopRuntime,
  restartAsAdministrator,
  type DesktopRuntimeRecord
} from "./features/settings/desktopRuntimeApi";
import { SkillDetailPage } from "./features/skills/SkillDetailPage";
import { SkillsPage } from "./features/skills/SkillsPage";
import {
  fallbackLocale,
  I18nCatalog,
  loadExternalI18nCatalog,
  loadI18nCatalogForLanguage,
  languageHtmlLang,
  loadStoredLanguage,
  setStoredLanguage,
  t,
  type LanguageCode
} from "./i18n";

export function App() {
  const [currentPage, setCurrentPage] = useState<AppPageState>("projects");
  const [pendingPage, setPendingPage] = useState<AppPageState | null>(null);
  const [selectedRemoteSkill, setSelectedRemoteSkill] = useState<DiscoverSkill | null>(null);
  const [skillDetailDirty, setSkillDetailDirty] = useState(false);
  const [catalog, setCatalog] = useState<I18nCatalog>(fallbackLocale);
  const [language, setLanguage] = useState<LanguageCode>(() =>
    loadStoredLanguage(fallbackLocale, window.localStorage)
  );
  const [languageError, setLanguageError] = useState<string | null>(null);
  const [desktopRuntime, setDesktopRuntime] = useState<DesktopRuntimeRecord | null>(null);
  const [isRestartingAsAdmin, setIsRestartingAsAdmin] = useState(false);

  useEffect(() => {
    let ignore = false;

    loadExternalI18nCatalog(undefined, window.localStorage)
      .then((externalCatalog) => {
        if (!ignore) {
          setCatalog(externalCatalog);
          setLanguage(loadStoredLanguage(externalCatalog, window.localStorage));
          setLanguageError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!ignore) {
          setLanguageError(errorMessage(reason));
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = languageHtmlLang(catalog, language);
  }, [catalog, language]);

  useEffect(() => {
    let ignore = false;

    readDesktopRuntime()
      .then((record) => {
        if (!ignore) {
          setDesktopRuntime(record);
        }
      })
      .catch(() => {
        if (!ignore) {
          setDesktopRuntime(null);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function handleLanguageChange(nextLanguage: LanguageCode) {
    setStoredLanguage(window.localStorage, nextLanguage);

    try {
      const nextCatalog = await loadI18nCatalogForLanguage(catalog, nextLanguage);
      setCatalog(nextCatalog);
      setLanguage(loadStoredLanguage(nextCatalog, window.localStorage));
      setLanguageError(null);
      document.documentElement.lang = languageHtmlLang(nextCatalog, nextLanguage);
    } catch (reason) {
      setLanguage(nextLanguage);
      setLanguageError(errorMessage(reason));
      document.documentElement.lang = languageHtmlLang(catalog, nextLanguage);
    }
  }

  function requestPageChange(nextPage: AppPageState) {
    if (currentPage === nextPage) {
      return;
    }

    if (isSkillDetailRoute(currentPage) && skillDetailDirty) {
      setPendingPage(nextPage);
      return;
    }

    setCurrentPage(nextPage);
  }

  async function handleRestartAsAdministrator() {
    if (isRestartingAsAdmin) {
      return;
    }

    setIsRestartingAsAdmin(true);

    try {
      await restartAsAdministrator();
      await exitApplication();
    } catch {
      setIsRestartingAsAdmin(false);
    }
  }

  return (
    <div className="app-shell">
      {desktopRuntime?.shouldPromptForAdminRestart && !window.location.origin.includes("127.0.0.1") ? (
        <div className="modal-backdrop">
          <div
            aria-labelledby="admin-restart-title"
            aria-modal="true"
            className="modal-panel modal-panel-compact"
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <h2 id="admin-restart-title">
                  {t(catalog, language, "settings.adminRestart.title")}
                </h2>
                <p>{t(catalog, language, "settings.adminRestart.description")}</p>
              </div>
            </div>
            <div className="modal-actions modal-actions-pad">
              <button
                className="button button-secondary"
                disabled={isRestartingAsAdmin}
                onClick={() => void exitApplication()}
                type="button"
              >
                {t(catalog, language, "settings.adminRestart.exit")}
              </button>
              <button
                className="button button-primary"
                disabled={isRestartingAsAdmin}
                onClick={() => void handleRestartAsAdministrator()}
                type="button"
              >
                {t(catalog, language, "settings.adminRestart.confirm")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <a className="skip-link" href="#main-content">
        {t(catalog, language, "app.skipLink")}
      </a>
      <aside className="sidebar" aria-label={t(catalog, language, "app.navLabel")}>
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            SM
          </div>
          <div className="brand-copy">
            <p className="eyebrow">{t(catalog, language, "app.brand.eyebrow")}</p>
            <p>{t(catalog, language, "app.brand.description")}</p>
          </div>
        </div>

        <nav className="nav-list">
          {appNavItems.map((item) => {
            const Icon = item.icon;
            const isCurrent = item.id === getNavPageId(currentPage);
            return (
              <button
                className={isCurrent ? "nav-item nav-item-active" : "nav-item"}
                key={item.id}
                onClick={() => requestPageChange(item.id)}
                type="button"
                aria-current={isCurrent ? "page" : undefined}
              >
                <Icon size={18} weight="bold" aria-hidden="true" />
                <span>
                  <strong>{t(catalog, language, item.labelKey)}</strong>
                  <small>{t(catalog, language, item.descriptionKey)}</small>
                </span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main id="main-content" className="workspace" tabIndex={-1}>
        {currentPage === "settings" ? (
          <SettingsPage
            catalog={catalog}
            language={language}
            languageError={languageError}
            onLanguageChange={handleLanguageChange}
            onOpenCliTargets={() => requestPageChange(cliTargetsRoute())}
          />
        ) : isCliTargetsRoute(currentPage) ? (
          <CliTargetsPage
            catalog={catalog}
            language={language}
            onBack={() => requestPageChange("settings")}
          />
        ) : currentPage === "groups" ? (
          <GroupsPage
            catalog={catalog}
            language={language}
            onOpenGroup={(groupId) => requestPageChange(groupDetailRoute(groupId))}
          />
        ) : isGroupDetailRoute(currentPage) ? (
          <ConnectedGroupDetailPage
            catalog={catalog}
            groupId={getRouteEntityId(currentPage) ?? ""}
            language={language}
            onBack={() => requestPageChange("groups")}
            onOpenProject={(projectId) => requestPageChange(projectDetailRoute(projectId))}
          />
        ) : currentPage === "projects" ? (
          <ProjectsPage
            catalog={catalog}
            language={language}
            onOpenProject={(projectId) => requestPageChange(projectDetailRoute(projectId))}
          />
        ) : isProjectDetailRoute(currentPage) ? (
          <ProjectDetailPage
            catalog={catalog}
            language={language}
            onBack={() => requestPageChange("projects")}
            projectId={getRouteEntityId(currentPage) ?? ""}
          />
        ) : currentPage === "skills" ? (
          <SkillsPage
            catalog={catalog}
            language={language}
            onOpenSkill={(skillId) => requestPageChange(skillDetailRoute(skillId))}
          />
        ) : isSkillDetailRoute(currentPage) ? (
          <SkillDetailPage
            catalog={catalog}
            language={language}
            onDirtyChange={setSkillDetailDirty}
            onNavigate={requestPageChange}
            skillId={getRouteEntityId(currentPage) ?? ""}
          />
        ) : isRemoteSkillDetailRoute(currentPage) && selectedRemoteSkill ? (
          <RemoteSkillDetailPage
            catalog={catalog}
            initialSkill={selectedRemoteSkill}
            language={language}
            onNavigate={requestPageChange}
          />
        ) : currentPage === "discover" ? (
          <DiscoverPage
            catalog={catalog}
            language={language}
            onOpenRemoteSkill={(skill) => {
              setSelectedRemoteSkill(skill);
              requestPageChange(remoteSkillDetailRoute(skill.id));
            }}
          />
        ) : (
          <PlaceholderPage catalog={catalog} language={language} />
        )}
      </main>

      {pendingPage ? (
        <div className="modal-backdrop" onClick={() => setPendingPage(null)}>
          <div
            aria-labelledby="skill-leave-title"
            aria-modal="true"
            className="modal-panel modal-panel-compact"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <h2 id="skill-leave-title">
                  {t(catalog, language, "skills.detail.leaveDialog.title")}
                </h2>
                <p>{t(catalog, language, "skills.detail.leaveDialog.copy")}</p>
              </div>
            </div>
            <div className="modal-actions modal-actions-pad">
              <button
                className="button button-secondary"
                onClick={() => setPendingPage(null)}
                type="button"
              >
                {t(catalog, language, "skills.detail.leaveDialog.stay")}
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  setSkillDetailDirty(false);
                  setCurrentPage(pendingPage);
                  setPendingPage(null);
                }}
                type="button"
              >
                {t(catalog, language, "skills.detail.leaveDialog.discard")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <MessageProvider />
    </div>
  );
}

function PlaceholderPage({
  catalog,
  language
}: {
  catalog: I18nCatalog;
  language: LanguageCode;
}) {
  return (
    <section className="page-stack" aria-labelledby="placeholder-title">
      <header className="topbar page-topbar">
        <div>
          <p className="eyebrow">{t(catalog, language, "page.placeholder.eyebrow")}</p>
          <h1 id="placeholder-title">
            {t(catalog, language, "page.placeholder.title")}
          </h1>
        </div>
      </header>
      <section className="panel">
        <div className="panel-header">
          <p>{t(catalog, language, "page.placeholder.copy")}</p>
        </div>
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

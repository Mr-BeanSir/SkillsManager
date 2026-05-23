import { useEffect, useState } from "react";
import { appNavItems } from "./appNav";
import { MessageProvider } from "../shared/components/message";
import { ConfirmDialog } from "../shared/components/ConfirmDialog";
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
import { DiscoverPage } from "../features/discover/home/DiscoverPage";
import { RemoteSkillDetailPage } from "../features/discover/detail/RemoteSkillDetailPage";
import type { DiscoverSkill } from "../features/discover/discoverApi";
import { ConnectedGroupDetailPage } from "../features/groups/detail/GroupDetailPage";
import { GroupsPage } from "../features/groups/home/GroupsPage";
import { ProjectDetailPage } from "../features/projects/detail/ProjectDetailPage";
import { ProjectsPage } from "../features/projects/home/ProjectsPage";
import { CliTargetsPage } from "../features/settings/detail/CliTargetsPage";
import { SettingsPage } from "../features/settings/home/SettingsPage";
import { SkillDetailPage } from "../features/skills/detail/SkillDetailPage";
import { SkillsPage } from "../features/skills/home/SkillsPage";
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

  return (
    <div className="app-shell">
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
        <ConfirmDialog
          cancelLabel={t(catalog, language, "skills.detail.leaveDialog.stay")}
          confirmLabel={t(catalog, language, "skills.detail.leaveDialog.discard")}
          description={t(catalog, language, "skills.detail.leaveDialog.copy")}
          title={t(catalog, language, "skills.detail.leaveDialog.title")}
          onCancel={() => setPendingPage(null)}
          onConfirm={() => {
            setSkillDetailDirty(false);
            setCurrentPage(pendingPage);
            setPendingPage(null);
          }}
        />
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

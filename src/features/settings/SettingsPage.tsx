import { useEffect, useRef, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../i18n";
import styles from "./SettingsPage.module.css";
import {
  readSettings,
  updateDiscoverPageSizeSetting,
  updateAutoReconcileSetting,
  updateLaunchAtStartupSetting,
  updateSilentStartSetting,
  getAppVersion,
  checkAppUpdate,
  downloadAppUpdate,
  installUpdateAndRestart,
  type SettingsRecord,
  type UpdateInfo,
  type DownloadProgress
} from "./settingsApi";

type SettingsPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  languageError: string | null;
  onLanguageChange: (language: LanguageCode) => void;
  onOpenCliTargets: () => void;
};

type NavGroup = {
  id: string;
  labelKey: string;
  items: { id: string; labelKey: string }[];
};

const navGroups: NavGroup[] = [
  {
    id: "general",
    labelKey: "settings.nav.general",
    items: [
      { id: "reconcile", labelKey: "settings.nav.reconcile" },
      { id: "language", labelKey: "settings.nav.language" },
      { id: "discoverPageSize", labelKey: "settings.nav.discoverPageSize" },
      { id: "launchAtStartup", labelKey: "settings.nav.launchAtStartup" },
      { id: "silentStart", labelKey: "settings.nav.silentStart" }
    ]
  },
  {
    id: "tools",
    labelKey: "settings.nav.tools",
    items: [
      { id: "cliTargets", labelKey: "settings.nav.cliTargets" }
    ]
  },
  {
    id: "about",
    labelKey: "settings.nav.about",
    items: [
      { id: "update", labelKey: "settings.nav.update" }
    ]
  }
];

export function SettingsPage({
  catalog,
  language,
  languageError,
  onLanguageChange,
  onOpenCliTargets
}: SettingsPageProps) {
  const [settings, setSettings] = useState<SettingsRecord>({
    autoReconcile: true,
    discoverPageSize: 25,
    launchAtStartup: false,
    silentStart: false
  });
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsStatus, setSettingsStatus] = useState<string | null>(null);
  const [isSettingsLoading, setIsSettingsLoading] = useState(true);
  const [isSettingsSaving, setIsSettingsSaving] = useState(false);
  const [draftLanguage, setDraftLanguage] = useState(language);
  const [languageStatus, setLanguageStatus] = useState<string | null>(null);
  const [draftDiscoverPageSize, setDraftDiscoverPageSize] = useState("25");
  const [activeSection, setActiveSection] = useState("reconcile");
  const layoutRef = useRef<HTMLDivElement>(null);
  const [appVersion, setAppVersion] = useState("");
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);

  useEffect(() => {
    let ignore = false;

    readSettings()
      .then((record) => {
        if (!ignore) {
          setSettings(record);
          setDraftDiscoverPageSize(String(record.discoverPageSize));
          setSettingsError(null);
        }
      })
      .catch((reason: unknown) => {
        if (!ignore) {
          setSettingsError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (!ignore) {
          setIsSettingsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    setDraftLanguage(language);
  }, [language]);

  useEffect(() => {
    getAppVersion().then(setAppVersion).catch(() => {});
  }, []);

  useEffect(() => {
    const layout = layoutRef.current;
    if (!layout) return;

    const scrollRoot = layout.closest(".workspace") ?? null;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { root: scrollRoot, rootMargin: "-20% 0px -70% 0px" }
    );

    const sections = layout.querySelectorAll(`.${styles.section}`);
    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
  }, []);

  function scrollToSection(sectionId: string) {
    const layout = layoutRef.current;
    if (!layout) return;
    const section = layout.querySelector(`#${sectionId}`);
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function handleAutoReconcileChange(enabled: boolean) {
    if (isSettingsSaving || settings.autoReconcile === enabled) {
      return;
    }

    setIsSettingsSaving(true);
    setSettingsError(null);
    setSettingsStatus(null);

    try {
      const updated = await updateAutoReconcileSetting(enabled);
      setSettings(updated);
      setSettingsStatus(
        t(
          catalog,
          language,
          updated.autoReconcile
            ? "settings.reconcile.updatedOn"
            : "settings.reconcile.updatedOff"
        )
      );
    } catch (reason) {
      setSettingsError(errorMessage(reason));
    } finally {
      setIsSettingsSaving(false);
    }
  }

  async function handleDiscoverPageSizeApply() {
    if (isSettingsSaving) {
      return;
    }

    const parsed = Number.parseInt(draftDiscoverPageSize, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
      setSettingsError(t(catalog, language, "settings.discoverPageSize.invalid"));
      setSettingsStatus(null);
      return;
    }

    if (parsed === settings.discoverPageSize) {
      return;
    }

    setIsSettingsSaving(true);
    setSettingsError(null);
    setSettingsStatus(null);

    try {
      const updated = await updateDiscoverPageSizeSetting(parsed);
      setSettings(updated);
      setDraftDiscoverPageSize(String(updated.discoverPageSize));
      setSettingsStatus(
        t(catalog, language, "settings.discoverPageSize.updated", {
          count: updated.discoverPageSize
        })
      );
    } catch (reason) {
      setSettingsError(errorMessage(reason));
    } finally {
      setIsSettingsSaving(false);
    }
  }

  async function handleBooleanSettingChange(
    updater: () => Promise<SettingsRecord>,
    successKey: string
  ) {
    if (isSettingsSaving) {
      return;
    }

    setIsSettingsSaving(true);
    setSettingsError(null);
    setSettingsStatus(null);

    try {
      const updated = await updater();
      setSettings(updated);
      setSettingsStatus(t(catalog, language, successKey));
    } catch (reason) {
      setSettingsError(errorMessage(reason));
    } finally {
      setIsSettingsSaving(false);
    }
  }

  function handleLanguageApply() {
    if (draftLanguage === language) {
      return;
    }

    onLanguageChange(draftLanguage);
    setLanguageStatus(
      `${draftLanguage} ${t(catalog, language, "settings.language.applied")}`
    );
  }

  async function handleCheckUpdate() {
    setIsCheckingUpdate(true);
    setUpdateError(null);

    try {
      const info = await checkAppUpdate();
      if (info) {
        setUpdateInfo(info);
        setShowUpdateDialog(true);
      } else {
        setUpdateError(t(catalog, language, "settings.update.noUpdate"));
      }
    } catch (reason) {
      setUpdateError(errorMessage(reason));
    } finally {
      setIsCheckingUpdate(false);
    }
  }

  async function handleDownloadUpdate() {
    if (!updateInfo) return;

    setIsDownloading(true);
    setDownloadProgress(null);
    setUpdateError(null);

    try {
      const installerPath = await downloadAppUpdate(
        updateInfo.download_url,
        setDownloadProgress
      );
      await installUpdateAndRestart(installerPath);
    } catch (reason) {
      setUpdateError(errorMessage(reason));
      setIsDownloading(false);
    }
  }

  return (
    <section className={`page-stack ${styles.page}`} aria-labelledby="settings-title">
      <header className="topbar page-topbar">
        <div className={styles.pageHeader}>
          <p className="eyebrow">{t(catalog, language, "settings.eyebrow")}</p>
          <h1 className={styles.pageTitle} id="settings-title">
            {t(catalog, language, "settings.title")}
          </h1>
        </div>
      </header>

      <div className={styles.settingsLayout} ref={layoutRef}>
        <nav className={styles.settingsNav} aria-label={t(catalog, language, "settings.nav.label")}>
          {navGroups.map((group) => (
            <div key={group.id} className={styles.navGroup}>
              <p className={styles.navGroupLabel}>{t(catalog, language, group.labelKey)}</p>
              <div className={styles.navGroupItems}>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    className={
                      activeSection === item.id
                        ? `${styles.navItem} ${styles.navItemActive}`
                        : styles.navItem
                    }
                    onClick={() => scrollToSection(item.id)}
                    type="button"
                  >
                    {t(catalog, language, item.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className={styles.settingsContent}>
          <section className={`panel ${styles.panel} ${styles.section}`} id="reconcile" aria-labelledby="reconcile-title">
            <div className={styles.reconcileHeader}>
              <div className={styles.sectionIntro}>
                <h2 className={styles.sectionTitle} id="reconcile-title">
                  {t(catalog, language, "settings.reconcile.title")}
                </h2>
                <p className={styles.sectionDescription}>
                  {t(catalog, language, "settings.reconcile.description")}
                </p>
              </div>
              {isSettingsLoading ? null : (
                <label className={styles.switchLabel}>
                  <input
                    checked={settings.autoReconcile}
                    disabled={isSettingsSaving}
                    onChange={() => void handleAutoReconcileChange(!settings.autoReconcile)}
                    type="checkbox"
                    role="switch"
                    aria-checked={settings.autoReconcile}
                  />
                  <span className={styles.switchTrack}>
                    <span className={styles.switchThumb} />
                  </span>
                </label>
              )}
            </div>
          </section>

          <section className={`panel ${styles.panel} ${styles.section}`} id="language" aria-labelledby="language-title">
            <div className="panel-header">
              <div className={styles.sectionIntro}>
                <h2 className={styles.sectionTitle} id="language-title">
                  {t(catalog, language, "settings.language.title")}
                </h2>
                <p className={styles.sectionDescription}>
                  {t(catalog, language, "settings.language.description")}
                </p>
              </div>
            </div>

            <div className={styles.body}>
              <fieldset className={styles.segmentedField}>
                <legend>{t(catalog, language, "settings.language.fieldLegend")}</legend>
                <label className={`field ${styles.field}`}>
                  <span>{t(catalog, language, "settings.language.selectLabel")}</span>
                  <select
                    name="display-language"
                    onChange={(event) => setDraftLanguage(event.target.value)}
                    value={draftLanguage}
                  >
                    {catalog.languages.map((option) => (
                      <option key={option.code} value={option.code}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </fieldset>
              <div className={styles.actions}>
                <button
                  className="button button-primary"
                  disabled={draftLanguage === language}
                  onClick={handleLanguageApply}
                  type="button"
                >
                  {t(catalog, language, "settings.language.apply")}
                </button>
              </div>
              <p className={styles.note}>{t(catalog, language, "settings.language.note")}</p>
              {languageStatus ? (
                <p className="form-success" role="status" aria-live="polite">
                  {languageStatus}
                </p>
              ) : null}
              {languageError ? (
                <p className="form-error" role="alert">
                  {t(catalog, language, "settings.language.loadError")}
                </p>
              ) : null}
            </div>
          </section>

          <section className={`panel ${styles.panel} ${styles.section}`} id="discoverPageSize" aria-labelledby="discover-page-size-title">
            <div className="panel-header">
              <div className={styles.sectionIntro}>
                <h2 className={styles.sectionTitle} id="discover-page-size-title">
                  {t(catalog, language, "settings.discoverPageSize.title")}
                </h2>
                <p className={styles.sectionDescription}>
                  {t(catalog, language, "settings.discoverPageSize.description")}
                </p>
              </div>
            </div>

            <div className={styles.body}>
              <label className={`field ${styles.field}`}>
                <span>{t(catalog, language, "settings.discoverPageSize.label")}</span>
                <input
                  autoComplete="off"
                  className={styles.numberInput}
                  inputMode="numeric"
                  name="discover-page-size"
                  onChange={(event) => setDraftDiscoverPageSize(event.target.value)}
                  type="number"
                  min={1}
                  max={100}
                  value={draftDiscoverPageSize}
                />
              </label>
              <div className={styles.actions}>
                <button
                  className="button button-primary"
                  disabled={
                    isSettingsSaving ||
                    Number.parseInt(draftDiscoverPageSize, 10) === settings.discoverPageSize
                  }
                  onClick={() => void handleDiscoverPageSizeApply()}
                  type="button"
                >
                  {t(catalog, language, "settings.discoverPageSize.apply")}
                </button>
              </div>
              <p className={styles.note}>
                {t(catalog, language, "settings.discoverPageSize.note")}
              </p>
            </div>
          </section>

          <section className={`panel ${styles.panel} ${styles.section}`} id="launchAtStartup" aria-labelledby="launch-at-startup-title">
            <div className={styles.reconcileHeader}>
              <div className={styles.sectionIntro}>
                <h2 className={styles.sectionTitle} id="launch-at-startup-title">
                  {t(catalog, language, "settings.startup.launchAtStartup.title")}
                </h2>
                <p className={styles.sectionDescription}>
                  {t(catalog, language, "settings.startup.launchAtStartup.description")}
                </p>
              </div>
              <label className={styles.switchLabel}>
                <input
                  checked={settings.launchAtStartup}
                  disabled={isSettingsSaving}
                  onChange={() =>
                    void handleBooleanSettingChange(
                      () => updateLaunchAtStartupSetting(!settings.launchAtStartup),
                      !settings.launchAtStartup
                        ? "settings.startup.launchAtStartup.enabledStatus"
                        : "settings.startup.launchAtStartup.disabledStatus"
                    )
                  }
                  type="checkbox"
                  role="switch"
                  aria-checked={settings.launchAtStartup}
                />
                <span className={styles.switchTrack}>
                  <span className={styles.switchThumb} />
                </span>
              </label>
            </div>
          </section>

          <section className={`panel ${styles.panel} ${styles.section}`} id="silentStart" aria-labelledby="silent-start-title">
            <div className={styles.reconcileHeader}>
              <div className={styles.sectionIntro}>
                <h2 className={styles.sectionTitle} id="silent-start-title">
                  {t(catalog, language, "settings.startup.silentStart.title")}
                </h2>
                <p className={styles.sectionDescription}>
                  {t(catalog, language, "settings.startup.silentStart.description")}
                </p>
              </div>
              <label className={styles.switchLabel}>
                <input
                  checked={settings.silentStart}
                  disabled={isSettingsSaving}
                  onChange={() =>
                    void handleBooleanSettingChange(
                      () => updateSilentStartSetting(!settings.silentStart),
                      !settings.silentStart
                        ? "settings.startup.silentStart.enabledStatus"
                        : "settings.startup.silentStart.disabledStatus"
                    )
                  }
                  type="checkbox"
                  role="switch"
                  aria-checked={settings.silentStart}
                />
                <span className={styles.switchTrack}>
                  <span className={styles.switchThumb} />
                </span>
              </label>
            </div>
          </section>

          <section className={`panel ${styles.panel} ${styles.section}`} id="cliTargets" aria-labelledby="cli-targets-settings-title">
            <div className={styles.reconcileHeader}>
              <div className={styles.sectionIntro}>
                <h2 className={styles.sectionTitle} id="cli-targets-settings-title">
                  {t(catalog, language, "settings.cliTargets.title")}
                </h2>
                <p className={styles.sectionDescription}>
                  {t(catalog, language, "settings.cliTargets.description")}
                </p>
              </div>
              <button className="button button-primary" onClick={onOpenCliTargets} type="button">
                {t(catalog, language, "settings.cliTargets.open")}
              </button>
            </div>
          </section>

          <section className={`panel ${styles.panel} ${styles.section}`} id="update" aria-labelledby="update-settings-title">
            <div className={styles.reconcileHeader}>
              <div className={styles.sectionIntro}>
                <h2 className={styles.sectionTitle} id="update-settings-title">
                  {t(catalog, language, "settings.update.title")}
                </h2>
                <p className={styles.sectionDescription}>
                  {t(catalog, language, "settings.update.description")}
                </p>
              </div>
              <div className={styles.versionRow}>
                <span className={styles.versionLabel}>{t(catalog, language, "settings.update.currentVersion")}</span>
                <span className={styles.versionValue}>v{appVersion}</span>
                <button
                  className="button button-primary"
                  disabled={isCheckingUpdate}
                  onClick={() => void handleCheckUpdate()}
                  type="button"
                >
                  {isCheckingUpdate
                    ? t(catalog, language, "settings.update.checking")
                    : t(catalog, language, "settings.update.checkButton")}
                </button>
              </div>
            </div>
            {updateError ? (
              <p className={`form-error ${styles.body}`} role="alert" aria-live="assertive">
                {updateError}
              </p>
            ) : null}
          </section>
        </div>
      </div>

      {showUpdateDialog && updateInfo ? (
        <div className="modal-backdrop" onClick={() => { if (!isDownloading) setShowUpdateDialog(false); }}>
          <div
            aria-labelledby="update-dialog-title"
            aria-modal="true"
            className="modal-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <h2 id="update-dialog-title">
                  {t(catalog, language, "settings.update.dialogTitle", { version: updateInfo.version })}
                </h2>
              </div>
            </div>
            <div className={styles.updateDialogBody}>
              <div className={styles.updateReleaseBody}>
                {updateInfo.body || t(catalog, language, "settings.update.noReleaseNotes")}
              </div>

              {isDownloading && downloadProgress ? (
                <div className={styles.progressBar}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                  <span className={styles.progressLabel}>
                    {downloadProgress.percent}%
                  </span>
                </div>
              ) : null}
            </div>
            <div className="modal-actions modal-actions-pad">
              <button
                className="button button-secondary"
                disabled={isDownloading}
                onClick={() => setShowUpdateDialog(false)}
                type="button"
              >
                {t(catalog, language, "settings.update.cancel")}
              </button>
              <button
                className="button button-primary"
                disabled={isDownloading}
                onClick={() => void handleDownloadUpdate()}
                type="button"
              >
                {isDownloading
                  ? t(catalog, language, "settings.update.downloading")
                  : t(catalog, language, "settings.update.installButton")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

    </section>
  );
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

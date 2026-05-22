import { useEffect, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../i18n";
import styles from "./SettingsPage.module.css";
import {
  readSettings,
  updateDiscoverPageSizeSetting,
  updateAutoReconcileSetting,
  updateLaunchAtStartupSetting,
  updateSilentStartSetting,
  type SettingsRecord
} from "./settingsApi";

type SettingsPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  languageError: string | null;
  onLanguageChange: (language: LanguageCode) => void;
  onOpenCliTargets: () => void;
};

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

      <section
        className={`panel ${styles.panel} ${styles.primaryPanel}`}
        aria-labelledby="reconcile-title"
      >
        <div className="panel-header">
          <div className={styles.sectionIntro}>
            <h2 className={styles.sectionTitle} id="reconcile-title">
              {t(catalog, language, "settings.reconcile.title")}
            </h2>
            <p className={styles.sectionDescription}>
              {t(catalog, language, "settings.reconcile.description")}
            </p>
          </div>
        </div>

        <div className={styles.body}>
          {isSettingsLoading ? (
            <p className={styles.note} role="status" aria-live="polite">
              {t(catalog, language, "settings.reconcile.loading")}
            </p>
          ) : (
            <fieldset className={styles.segmentedField}>
              <legend>{t(catalog, language, "settings.reconcile.fieldLegend")}</legend>
              <label>
                <input
                  checked={settings.autoReconcile}
                  disabled={isSettingsSaving}
                  name="auto-reconcile"
                  onChange={() => void handleAutoReconcileChange(true)}
                  type="radio"
                  value="true"
                />
                <span>{t(catalog, language, "settings.reconcile.enabled")}</span>
              </label>
              <label>
                <input
                  checked={!settings.autoReconcile}
                  disabled={isSettingsSaving}
                  name="auto-reconcile"
                  onChange={() => void handleAutoReconcileChange(false)}
                  type="radio"
                  value="false"
                />
                <span>{t(catalog, language, "settings.reconcile.disabled")}</span>
              </label>
            </fieldset>
          )}

          <p className={styles.note}>{t(catalog, language, "settings.reconcile.note")}</p>

          {isSettingsSaving ? (
            <p className={styles.note} role="status" aria-live="polite">
              {t(catalog, language, "settings.reconcile.saving")}
            </p>
          ) : null}

          {settingsStatus ? (
            <p className="form-success" role="status" aria-live="polite">
              {settingsStatus}
            </p>
          ) : null}

          {settingsError ? (
            <p className="form-error" role="alert" aria-live="assertive">
              {isSettingsLoading
                ? t(catalog, language, "settings.reconcile.loadError")
                : settingsError}
            </p>
          ) : null}
        </div>
      </section>

      <div className={styles.secondaryGrid}>
        <section className={`panel ${styles.panel}`} aria-labelledby="language-title">
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

        <section className={`panel ${styles.panel}`} aria-labelledby="discover-page-size-title">
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

        <section className={`panel ${styles.panel}`} aria-labelledby="startup-settings-title">
          <div className="panel-header">
            <div className={styles.sectionIntro}>
              <h2 className={styles.sectionTitle} id="startup-settings-title">
                {t(catalog, language, "settings.startup.title")}
              </h2>
              <p className={styles.sectionDescription}>
                {t(catalog, language, "settings.startup.description")}
              </p>
            </div>
          </div>

          <div className={styles.body}>
            <fieldset className={styles.segmentedField}>
              <legend>{t(catalog, language, "settings.startup.fieldLegend")}</legend>
              <label>
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
                />
                <span>{t(catalog, language, "settings.startup.launchAtStartup.label")}</span>
              </label>
              <label>
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
                />
                <span>{t(catalog, language, "settings.startup.silentStart.label")}</span>
              </label>
            </fieldset>
            <p className={styles.note}>{t(catalog, language, "settings.startup.note")}</p>
          </div>
        </section>

        <section className={`panel ${styles.panel}`} aria-labelledby="cli-targets-settings-title">
          <div className="panel-header">
            <div className={styles.sectionIntro}>
              <h2 className={styles.sectionTitle} id="cli-targets-settings-title">
                {t(catalog, language, "settings.cliTargets.title")}
              </h2>
              <p className={styles.sectionDescription}>
                {t(catalog, language, "settings.cliTargets.description")}
              </p>
            </div>
          </div>

          <div className={styles.body}>
            <div className={styles.actions}>
              <button className="button button-primary" onClick={onOpenCliTargets} type="button">
                {t(catalog, language, "settings.cliTargets.open")}
              </button>
            </div>
            <p className={styles.note}>{t(catalog, language, "settings.cliTargets.note")}</p>
          </div>
        </section>
      </div>
    </section>
  );
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

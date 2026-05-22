import { type I18nCatalog, type LanguageCode, t } from "../../i18n";
import { type ProjectOnlyMigrationReport } from "./migrationApi";
import styles from "./MigrationWizard.module.css";

export type MigrationWizardState =
  | { kind: "idle" }
  | { kind: "running"; step: "backup" | "migrate" | "report" }
  | { kind: "error"; message: string }
  | { kind: "success"; report: ProjectOnlyMigrationReport };

type MigrationWizardProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  onRun?: () => void | Promise<void>;
  state: MigrationWizardState;
};

export function MigrationWizard({
  catalog,
  language,
  onRun,
  state
}: MigrationWizardProps) {
  const isRunning = state.kind === "running";
  const report = state.kind === "success" ? state.report : null;
  const progressSteps = [
    {
      id: "backup",
      label: t(catalog, language, "settings.migration.progress.backup"),
      note: t(catalog, language, "settings.migration.progress.backupNote")
    },
    {
      id: "migrate",
      label: t(catalog, language, "settings.migration.progress.migrate"),
      note: t(catalog, language, "settings.migration.progress.migrateNote")
    },
    {
      id: "report",
      label: t(catalog, language, "settings.migration.progress.report"),
      note: t(catalog, language, "settings.migration.progress.reportNote")
    }
  ] as const;
  const currentStep =
    state.kind === "running"
      ? progressSteps.find((step) => step.id === state.step) ?? progressSteps[0]
      : null;

  return (
    <section className="panel settings-panel" aria-labelledby="migration-title">
      <div className="panel-header">
        <div>
          <h2 id="migration-title">{t(catalog, language, "settings.migration.title")}</h2>
          <p>{t(catalog, language, "settings.migration.description")}</p>
        </div>
      </div>

      <div className="settings-body">
        <p className="settings-note">{t(catalog, language, "settings.migration.note")}</p>

        <div className="migration-actions">
          <button
            className="button button-primary"
            disabled={isRunning}
            onClick={() => void onRun?.()}
            type="button"
          >
            {isRunning
              ? t(catalog, language, "settings.migration.running")
              : t(catalog, language, "settings.migration.action")}
          </button>
        </div>

        {isRunning ? (
          <div className={styles.progress} role="status" aria-live="polite">
            <p className="settings-note">{t(catalog, language, "settings.migration.runningStatus")}</p>
            <div className="compact-list" aria-label={t(catalog, language, "settings.migration.progress.label")}>
              {progressSteps.map((step, index) => {
                const isComplete =
                  state.step === "migrate"
                    ? step.id === "backup"
                    : state.step === "report"
                      ? step.id === "backup" || step.id === "migrate"
                      : false;
                const isCurrent = currentStep?.id === step.id;
                const toneClass = isCurrent
                  ? `${styles.step} ${styles.stepCurrent}`
                  : isComplete
                    ? `${styles.step} ${styles.stepComplete}`
                    : styles.step;

                return (
                  <div className={toneClass} key={step.id}>
                    <span className={styles.stepIndex} aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className={styles.stepCopy}>
                      <strong>{step.label}</strong>
                      <span className="table-secondary">
                        {isCurrent ? step.note : null}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {state.kind === "error" ? (
          <div className={`${styles.callout} ${styles.calloutError}`} role="alert" aria-live="assertive">
            <strong>{t(catalog, language, "settings.migration.failed")}</strong>
            <p>{state.message}</p>
            <p className="settings-note">
              {t(catalog, language, "settings.migration.failedNote")}
            </p>
            <ul className={styles.list}>
              <li>{t(catalog, language, "settings.migration.failedRecovery.permissions")}</li>
              <li>{t(catalog, language, "settings.migration.failedRecovery.backup")}</li>
            </ul>
          </div>
        ) : null}

        {report ? (
          <div className={styles.report} aria-live="polite">
            <div className={styles.reportHeader}>
              <strong>
                {report.alreadyMigrated
                  ? t(catalog, language, "settings.migration.alreadyMigrated")
                  : t(catalog, language, "settings.migration.complete")}
              </strong>
              <p className="settings-note">
                {report.alreadyMigrated
                  ? t(catalog, language, "settings.migration.alreadyMigratedNote")
                  : t(catalog, language, "settings.migration.completeNote")}
              </p>
            </div>

            <dl className={styles.stats} aria-label={t(catalog, language, "settings.migration.summaryLabel")}>
              <div className={styles.stat}>
                <dt>{t(catalog, language, "settings.migration.projectsMigrated")}</dt>
                <dd>{report.migratedProjects}</dd>
              </div>
              <div className={styles.stat}>
                <dt>{t(catalog, language, "settings.migration.projectSkillsMigrated")}</dt>
                <dd>{report.migratedProjectSkills}</dd>
              </div>
              <div className={styles.stat}>
                <dt>{t(catalog, language, "settings.migration.manualFollowUp")}</dt>
                <dd>{report.manualSkillCount}</dd>
              </div>
            </dl>

            {report.backupPath ? (
              <div className={styles.block}>
                <strong>{t(catalog, language, "settings.migration.backupPath")}</strong>
                <code className={`path-cell ${styles.path}`}>{report.backupPath}</code>
              </div>
            ) : null}

            {report.warnings.length > 0 ? (
              <div className={styles.block}>
                <strong>{t(catalog, language, "settings.migration.warningsTitle")}</strong>
                <ul className={styles.list}>
                  {report.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className={styles.block}>
              <strong>{t(catalog, language, "settings.migration.followUpTitle")}</strong>
              {report.manualSkills.length > 0 ? (
                <div className="compact-list">
                  {report.manualSkills.map((skill) => (
                    <div className="compact-list-row" key={skill.id}>
                      <strong>{skill.name}</strong>
                      <span className="table-secondary">
                        {t(catalog, language, "settings.migration.linkModeLabel", {
                          mode: skill.linkMode
                        })}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="settings-note">
                  {t(catalog, language, "settings.migration.noManualFollowUp")}
                </p>
              )}
            </div>

            {report.nextSteps.length > 0 ? (
              <div className={styles.block}>
                <strong>{t(catalog, language, "settings.migration.nextStepsTitle")}</strong>
                <ul className={styles.list}>
                  {report.nextSteps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

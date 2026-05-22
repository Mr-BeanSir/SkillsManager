import { ArrowLeft, DownloadSimple } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import type { AppPageState } from "../../appPageState";
import { I18nCatalog, LanguageCode } from "../../i18n";
import { SafeRemoteMarkdownPreview } from "../../shared/remote-content/SafeRemoteMarkdownPreview";
import styles from "./RemoteSkillDetailPage.module.css";
import {
  installRepositorySkill,
  repositoryInstallInputFromDiscoverSkill
} from "./repositoryInstallApi";
import {
  getRemoteSkillDetail,
  type RemoteSkillDetailInput,
  type RemoteSkillDetailRecord
} from "./remoteSkillDetailApi";

type RemoteSkillDetailPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  initialSkill: {
    id: string;
    name: string;
    sourceRef: string;
    skillPath: string;
    isOfficial?: boolean;
    tags?: string[];
  };
  onNavigate: (nextPage: AppPageState) => void;
};

export function RemoteSkillDetailPage({
  catalog,
  language,
  initialSkill,
  onNavigate
}: RemoteSkillDetailPageProps) {
  const [detail, setDetail] = useState<RemoteSkillDetailRecord | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [installMessage, setInstallMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    let ignore = false;
    const input: RemoteSkillDetailInput = {
      sourceRef: initialSkill.sourceRef,
      skillPath: initialSkill.skillPath,
      fallbackName: initialSkill.name
    };

    setIsLoading(true);
    setLoadError(null);

    getRemoteSkillDetail(input)
      .then((record) => {
        if (!ignore) {
          setDetail(record);
        }
      })
      .catch((reason: unknown) => {
        if (!ignore) {
          setLoadError(errorMessage(reason));
          setDetail(null);
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
  }, [initialSkill]);

  async function handleInstall() {
    setIsInstalling(true);
    setInstallError(null);
    setInstallMessage(null);

    try {
      const installed = await installRepositorySkill(
        repositoryInstallInputFromDiscoverSkill({
          sourceRef: initialSkill.sourceRef,
          name: initialSkill.name
        })
      );
      setInstallMessage(`${installed.name} installed from ${installed.sourceRef}.`);
    } catch (reason) {
      setInstallError(errorMessage(reason));
    } finally {
      setIsInstalling(false);
    }
  }

  const displayDetail = detail ?? {
    id: initialSkill.id,
    name: initialSkill.name,
    sourceRef: initialSkill.sourceRef,
    sourceUrl: `https://github.com/${initialSkill.sourceRef}`,
    skillPath: initialSkill.skillPath,
    summary: null,
    installs: null,
    githubStars: null,
    firstSeen: null,
    securityAudits: null,
    tags: initialSkill.tags ?? [],
    relatedSkills: [],
    isOfficial: initialSkill.isOfficial ?? false
  };

  return (
    <section className="page-stack" aria-labelledby="remote-skill-title">
      <header className="topbar page-topbar">
        <div>
          <p className={`eyebrow ${styles.detailEyebrow}`}>Discover</p>
          <h1 id="remote-skill-title">{displayDetail.name}</h1>
          <p className={styles.detailCopy}>
            {displayDetail.sourceRef} · {displayDetail.skillPath}
          </p>
        </div>
        <div className={styles.detailActions}>
          <button className="button button-secondary" onClick={() => onNavigate("discover")} type="button">
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            Back to Discover
          </button>
          <button
            className="button button-primary"
            disabled={isInstalling}
            onClick={() => void handleInstall()}
            type="button"
          >
            <DownloadSimple size={16} weight="bold" aria-hidden="true" />
            {isInstalling ? "Installing..." : "Install Skill"}
          </button>
        </div>
      </header>

      {loadError ? (
        <p className="form-error panel-message" role="alert">
          {loadError}
        </p>
      ) : null}

      {installError ? (
        <p className="form-error panel-message" role="alert">
          {installError}
        </p>
      ) : null}

      {installMessage ? (
        <p className="form-success panel-message" role="status">
          {installMessage}
        </p>
      ) : null}

      <section className={styles.summaryLayout}>
        <section className="panel" aria-labelledby="remote-skill-summary-title">
          <div className="panel-header">
            <div>
              <h2 id="remote-skill-summary-title">Summary</h2>
            </div>
          </div>
          <div className={styles.summaryBody}>
            <RemoteSkillSummary
              summary={isLoading ? "Loading remote skill details..." : displayDetail.summary ?? "No stable summary available."}
            />
          </div>
        </section>

        <section className="panel" aria-labelledby="remote-skill-stats-title">
          <div className="panel-header">
            <div>
              <h2 id="remote-skill-stats-title">Remote Signals</h2>
            </div>
          </div>
          <RemoteSkillStats catalog={catalog} detail={displayDetail} language={language} />
        </section>
      </section>

      <section className="panel" aria-labelledby="remote-skill-related-title">
        <div className="panel-header">
          <div>
            <h2 id="remote-skill-related-title">Related skills</h2>
          </div>
        </div>
        <RemoteSkillRelatedList detail={displayDetail} />
      </section>
    </section>
  );
}

export function RemoteSkillStats({
  detail
}: {
  catalog: I18nCatalog;
  detail: RemoteSkillDetailRecord;
  language: LanguageCode;
}) {
  const audits = parseSecurityAudits(detail.securityAudits);

  return (
    <div className={styles.statsPanelBody}>
      <div className={styles.statsHighlights}>
        <div className={styles.statsMetric}>
          <span className={styles.statsMetricLabel}>GitHub Stars</span>
          <strong className={`${styles.statsMetricValue} number-cell`}>{detail.githubStars ?? "—"}</strong>
        </div>
        <div className={styles.statsMetric}>
          <span className={styles.statsMetricLabel}>Installs</span>
          <strong className={`${styles.statsMetricValue} number-cell`}>{detail.installs ?? "—"}</strong>
        </div>
      </div>

      <dl className={styles.statsMetaList}>
        <div className={styles.statsMetaRow}>
          <dt>First Seen</dt>
          <dd>{detail.firstSeen ?? "—"}</dd>
        </div>
      </dl>

      <section className={styles.statsAuditSection} aria-labelledby="remote-skill-audits-title">
        <div className={styles.statsAuditHeader}>
          <h3 className={styles.statsAuditTitle} id="remote-skill-audits-title">
            Security Audits
          </h3>
          <span className={styles.statsAuditCount}>{audits.length === 0 ? "No checks" : `${audits.length} checks`}</span>
        </div>
        <SecurityAuditList audits={audits} />
      </section>
    </div>
  );
}

export function RemoteSkillRelatedList({
  detail
}: {
  detail: RemoteSkillDetailRecord;
}) {
  if (detail.relatedSkills.length === 0) {
    return (
      <div className="empty-state compact-empty-state">
        <strong>No related skills available.</strong>
      </div>
    );
  }

  return (
      <div className={`compact-list compact-list-embedded ${styles.relatedList}`}>
      {detail.relatedSkills.map((skill) => (
        <a
          className={`compact-list-row ${styles.relatedLink}`}
          href={skill.href}
          key={skill.href}
          rel="noreferrer"
          target="_blank"
        >
          <strong>{skill.name}</strong>
          {skill.description ? (
            <span className={`table-secondary ${styles.relatedDescription}`}>
              <SafeRemoteMarkdownPreview
                fallback="Unsafe remote description hidden."
                value={skill.description}
              />
            </span>
          ) : null}
          <span className="path-cell">{skill.sourceRef}</span>
        </a>
      ))}
    </div>
  );
}

export function RemoteSkillSummary({ summary }: { summary: string }) {
  return (
    <div className={styles.summaryCopy}>
      <SafeRemoteMarkdownPreview
        allowUnsafeText
        bulletClassName={styles.summaryBullet}
        fallback="Summary unavailable."
        lineClassName={styles.summaryLine}
        value={summary}
      />
    </div>
  );
}

function SecurityAuditList({
  audits
}: {
  audits: Array<{ name: string; status: string }>;
}) {
  if (audits.length === 0) {
    return <span>—</span>;
  }

  return (
    <div className={styles.securityAuditList}>
      {audits.map((audit) => (
        <div className={styles.securityAuditRow} key={`${audit.name}-${audit.status}`}>
          <span className={styles.securityAuditName}>{audit.name}</span>
          <span
            className={
              audit.status === "PASS"
                ? `${styles.securityAuditBadge} ${styles.securityAuditBadgePass}`
                : `${styles.securityAuditBadge} ${styles.securityAuditBadgeWarn}`
            }
          >
            {audit.status}
          </span>
        </div>
      ))}
    </div>
  );
}

function parseSecurityAudits(securityAudits: string | null) {
  if (!securityAudits) {
    return [];
  }

  const bracketMatches = Array.from(
    securityAudits.matchAll(/\[\s*([^\]]*?(?:Pass|Warn))\s*\]/g)
  )
    .map((match) => parseSecurityAuditChunk(match[1]))
    .filter((item): item is { name: string; status: string } => item !== null);

  if (bracketMatches.length > 0) {
    return bracketMatches;
  }

  const text = securityAudits.replace(/\[(\d+)\]/g, "").replace(/\s+/g, " ").trim();
  const rawParts = text
    .split(/(?=[A-Z][a-z]+(?:Pass|Warn))/g)
    .map((part) => part.trim())
    .filter(Boolean);

  return rawParts
    .map((part) => parseSecurityAuditChunk(part))
    .filter((item): item is { name: string; status: string } => item !== null);
}

function parseSecurityAuditChunk(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ");
  const match = normalized.match(/^(.*?)(Pass|Warn)$/);
  if (!match) {
    return null;
  }

  return {
    name: match[1].trim(),
    status: match[2].toUpperCase()
  };
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

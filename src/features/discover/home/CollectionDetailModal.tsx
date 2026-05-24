import { DownloadSimple, Package } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import { I18nCatalog, LanguageCode, t } from "../../../app/i18n";
import { message } from "../../../shared/components/message";
import { Modal } from "../../../shared/components/Modal";
import { Tooltip } from "../../../shared/components/Tooltip";
import {
  getCollectionDetail,
  installCollection,
  type CollectionIndexEntry,
  type CollectionDetail,
  type CollectionInstallProgress
} from "../../collections/collectionsApi";
import {
  listInstalledSkills,
  type InstalledSkill
} from "../../skills/skillsApi";
import styles from "./CollectionDetailModal.module.css";

type CollectionDetailModalProps = {
  entry: CollectionIndexEntry;
  catalog: I18nCatalog;
  language: LanguageCode;
  onClose: () => void;
  onInstalled: () => void;
};

export function CollectionDetailModal({
  entry,
  catalog,
  language,
  onClose,
  onInstalled
}: CollectionDetailModalProps) {
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [progress, setProgress] = useState<CollectionInstallProgress | null>(null);
  const [installedSkills, setInstalledSkills] = useState<InstalledSkill[]>([]);

  const installedSet = useMemo(() => {
    const set = new Set<string>();
    for (const skill of installedSkills) {
      set.add(`${skill.sourceRef}:${skill.name}`);
    }
    return set;
  }, [installedSkills]);

  useEffect(() => {
    let ignore = false;

    setIsLoading(true);
    Promise.all([
      getCollectionDetail(entry.file),
      listInstalledSkills()
    ])
      .then(([detailResult, installedResult]) => {
        if (!ignore) {
          setDetail(detailResult);
          setInstalledSkills(installedResult);
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
  }, [entry.file]);

  function isSkillInstalled(sourceRef: string, name: string) {
    return installedSet.has(`${sourceRef}:${name}`);
  }

  async function handleInstall() {
    setIsInstalling(true);
    setError(null);
    setProgress(null);

    try {
      const installed = await installCollection(entry.file, (p) => setProgress(p));
      message.success(
        t(catalog, language, "collections.detail.installSuccess", {
          name: installed.title,
          count: String(installed.skills.length)
        })
      );
      onInstalled();
      onClose();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setIsInstalling(false);
      setProgress(null);
    }
  }

  return (
    <Modal
      closeLabel={t(catalog, language, "collections.detail.close")}
      description={t(catalog, language, "collections.detail.description")}
      title={t(catalog, language, "collections.detail.title")}
      onClose={onClose}
      compact={false}
    >
      {isLoading ? (
        <div className="loading-state">
          <div className="spin" />
          <p>{t(catalog, language, "collections.detail.installing")}</p>
        </div>
      ) : error ? (
        <p className="form-error" role="alert" style={{ margin: 18 }}>
          {error}
        </p>
      ) : detail ? (
        <div className={styles.content}>
          <div className={styles.meta}>
            <div className={styles.metaHeader}>
              <div>
                <p className={styles.metaTitle}>{detail.title}</p>
                {detail.description ? (
                  <p className={styles.metaDescription}>{detail.description}</p>
                ) : null}
                <p className={styles.metaVersion}>
                  {t(catalog, language, "collections.detail.version", {
                    version: detail.version
                  })}
                </p>
              </div>
              <button
                className="button button-primary"
                onClick={() => void handleInstall()}
                type="button"
                disabled={isInstalling}
              >
                <DownloadSimple size={16} weight="bold" aria-hidden="true" />
                {isInstalling
                  ? t(catalog, language, "collections.detail.installing")
                  : t(catalog, language, "collections.detail.install")}
              </button>
            </div>
          </div>

          <div className={`table-wrap ${styles.skillsTable}`}>
            <table>
              <thead>
                <tr>
                  <th scope="col">{t(catalog, language, "collections.detail.skillName")}</th>
                  <th scope="col">
                    {t(catalog, language, "collections.detail.skillDescription")}
                  </th>
                  <th scope="col">{t(catalog, language, "collections.detail.skillSource")}</th>
                  <th scope="col">{t(catalog, language, "collections.detail.skillStatus")}</th>
                </tr>
              </thead>
              <tbody>
                {detail.skills.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="empty-state">
                        <Package size={20} weight="bold" aria-hidden="true" />
                        <p>{t(catalog, language, "discover.collections.empty.copy")}</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  detail.skills.map((skill) => {
                    const installed = isSkillInstalled(skill.sourceRef, skill.name);
                    return (
                      <tr key={`${skill.sourceType}:${skill.sourceRef}:${skill.name}`}>
                        <td>
                          <strong className="table-primary">{skill.name}</strong>
                        </td>
                        <td>
                          <Tooltip content={skill.description} placement="bottom">
                            <span className="table-secondary">{skill.description}</span>
                          </Tooltip>
                        </td>
                        <td>
                          <span className="table-primary">{skill.sourceRef}</span>
                        </td>
                        <td>
                          {installed ? (
                            <span className="status-badge status-global">
                              {t(catalog, language, "collections.detail.skillInstalled")}
                            </span>
                          ) : (
                            <span className="status-badge status-project">
                              {t(catalog, language, "collections.detail.skillNotInstalled")}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {progress ? (
            <p className={`form-progress ${styles.statusBar}`} role="status">
              {t(catalog, language, "collections.progress.installing", {
                current: String(progress.current ?? 0),
                total: String(progress.total ?? 0),
                name: progress.message
              })}
            </p>
          ) : null}

        </div>
      ) : null}
    </Modal>
  );
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }
  return String(reason);
}

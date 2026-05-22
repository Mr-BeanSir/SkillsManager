import { ArrowLeft, CaretDown, CaretRight, FloppyDisk, FileText, Folder } from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AppPageState } from "../../appPageState";
import { I18nCatalog, LanguageCode, t } from "../../i18n";
import styles from "./SkillDetailPage.module.css";
import {
  DEFAULT_APP_WINDOW_WIDTH,
  resolveSkillDetailLayout,
  type SkillDetailLayoutMode
} from "./skillDetailLayout";
import {
  getSkillDetail,
  readSkillFile,
  type SkillDetailRecord,
  type SkillFileTreeEntry,
  writeSkillFile
} from "./skillDetailApi";

type SkillDetailPageProps = {
  catalog: I18nCatalog;
  language: LanguageCode;
  onDirtyChange: (isDirty: boolean) => void;
  onNavigate: (nextPage: AppPageState) => void;
  skillId: string;
};

type FileNode = {
  path: string;
  name: string;
  kind: "file" | "directory";
  editable: boolean;
  depth: number;
};

export function SkillDetailPage({
  catalog,
  language,
  onDirtyChange,
  onNavigate,
  skillId
}: SkillDetailPageProps) {
  const [layoutMode, setLayoutMode] = useState<SkillDetailLayoutMode>(() =>
    getSkillDetailLayoutMode()
  );
  const [detail, setDetail] = useState<SkillDetailRecord | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [originalContents, setOriginalContents] = useState("");
  const [draftContents, setDraftContents] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const isDirty = selectedPath !== null && draftContents !== originalContents;

  useEffect(() => {
    onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const updateLayoutMode = () => {
      setLayoutMode(resolveSkillDetailLayout(window.innerWidth));
    };

    updateLayoutMode();
    window.addEventListener("resize", updateLayoutMode);

    return () => {
      window.removeEventListener("resize", updateLayoutMode);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    setIsLoading(true);
    setLoadError(null);
    setFileError(null);
    setSaveStatus(null);
    setSelectedPath(null);
    setPendingPath(null);
    setOriginalContents("");
    setDraftContents("");

    getSkillDetail(skillId)
      .then((record) => {
        if (ignore) {
          return;
        }

        setDetail(record);
        setExpandedPaths(defaultExpandedPaths(record.fileTree));
        const defaultPath = defaultFilePath(record.fileTree);

        if (defaultPath) {
          void loadFile(
            record.id,
            defaultPath,
            ignore,
            setSelectedPath,
            setOriginalContents,
            setDraftContents,
            setIsReadingFile,
            setFileError
          );
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
      onDirtyChange(false);
    };
  }, [skillId, onDirtyChange]);

  const fileNodes = useMemo(() => buildVisibleNodes(detail?.fileTree ?? [], expandedPaths), [detail?.fileTree, expandedPaths]);

  async function handleFileSelection(nextPath: string) {
    if (!detail || selectedPath === nextPath || isReadingFile) {
      return;
    }

    setSaveStatus(null);

    if (isDirty) {
      setPendingPath(nextPath);
      return;
    }

    await loadFile(
      detail.id,
      nextPath,
      false,
      setSelectedPath,
      setOriginalContents,
      setDraftContents,
      setIsReadingFile,
      setFileError
    );
  }

  async function handleSave() {
    if (!detail || !selectedPath || !isDirty) {
      return;
    }

    setIsSaving(true);
    setFileError(null);
    setSaveStatus(null);

    try {
      await writeSkillFile(detail.id, selectedPath, draftContents);
      setOriginalContents(draftContents);
      setSaveStatus(t(catalog, language, "skills.detail.saveSuccess"));
    } catch (reason) {
      setFileError(errorMessage(reason));
    } finally {
      setIsSaving(false);
    }
  }

  function handleBack() {
    onNavigate("skills");
  }

  function toggleDirectory(path: string) {
    setExpandedPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }

  async function handleDiscardAndSwitch() {
    if (!detail || !pendingPath) {
      return;
    }

    const nextPath = pendingPath;
    setPendingPath(null);
    await loadFile(
      detail.id,
      nextPath,
      false,
      setSelectedPath,
      setOriginalContents,
      setDraftContents,
      setIsReadingFile,
      setFileError
    );
  }

  if (isLoading && !detail) {
    return (
      <section className="page-stack" aria-labelledby="skill-detail-title">
        <header className="topbar page-topbar">
          <div>
            <button className="button button-secondary" onClick={handleBack} type="button">
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "skills.detail.back")}
            </button>
            <p className={`eyebrow ${styles.detailEyebrow}`}>{t(catalog, language, "skills.eyebrow")}</p>
            <h1 id="skill-detail-title">{t(catalog, language, "skills.detail.loading")}</h1>
          </div>
        </header>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className="page-stack" aria-labelledby="skill-detail-missing-title">
        <header className="topbar page-topbar">
          <div>
            <button className="button button-secondary" onClick={handleBack} type="button">
              <ArrowLeft size={16} weight="bold" aria-hidden="true" />
              {t(catalog, language, "skills.detail.back")}
            </button>
            <p className={`eyebrow ${styles.detailEyebrow}`}>{t(catalog, language, "skills.eyebrow")}</p>
            <h1 id="skill-detail-missing-title">
              {t(catalog, language, "skills.detail.missing.title")}
            </h1>
            <p className={styles.detailCopy}>
              {loadError ?? t(catalog, language, "skills.detail.missing.copy")}
            </p>
          </div>
        </header>
      </section>
    );
  }

  return (
    <section className="page-stack" aria-labelledby="skill-detail-title">
      <header className="topbar page-topbar">
        <div>
          <p className={`eyebrow ${styles.detailEyebrow}`}>{t(catalog, language, "skills.eyebrow")}</p>
          <h1 id="skill-detail-title">{detail.name}</h1>
          <p className={styles.detailCopy}>
            {detail.sourceType} · {detail.sourceRef}
          </p>
        </div>

        <SkillDetailTopbarActions
          backLabel={t(catalog, language, "skills.detail.back")}
          currentLabel={t(catalog, language, "skills.current")}
          isCurrent={!detail.updateAvailable}
          isUpdateAvailable={detail.updateAvailable}
          onBack={handleBack}
          updateAvailableLabel={t(catalog, language, "skills.updateAvailable")}
        />
      </header>

      {layoutMode === "merged" ? (
        <>
          <section className={styles.summaryGrid}>
            <section className="panel" aria-labelledby="skill-summary-title">
              <SkillDetailSplitHeader
                leftDescription={t(catalog, language, "skills.detail.summaryDescription")}
                leftTitle={t(catalog, language, "skills.detail.summaryTitle")}
                rightDescription={t(catalog, language, "skills.detail.workspaceDescription")}
                rightTitle={t(catalog, language, "skills.detail.workspaceTitle")}
              />
              <div className={`${styles.splitBody} ${styles.splitBody3070}`}>
                <div className={`${styles.splitColumn} ${styles.splitColumnPrimary}`}>
                  <SkillSnapshotSummary catalog={catalog} detail={detail} language={language} />
                </div>
                <div className={styles.splitDivider} aria-hidden="true" />
                <div className={`${styles.splitColumn} ${styles.splitColumnSecondary}`}>
                  <SkillProjectAssignments catalog={catalog} detail={detail} language={language} />
                </div>
              </div>
            </section>
          </section>

          <section className={styles.workspaceGrid}>
            <section className="panel" aria-labelledby="skill-file-tree-title">
              <SkillDetailSplitHeader
                leftDescription={t(catalog, language, "skills.detail.fileTreeDescription")}
                leftTitle={t(catalog, language, "skills.detail.fileTreeTitle")}
                rightActions={
                  isDirty ? (
                    <button
                      className="button button-primary"
                      disabled={isSaving || isReadingFile}
                      onClick={() => void handleSave()}
                      type="button"
                    >
                      <FloppyDisk size={16} weight="bold" aria-hidden="true" />
                      {isSaving
                        ? t(catalog, language, "skills.detail.saving")
                        : t(catalog, language, "skills.detail.save")}
                    </button>
                  ) : null
                }
                rightDescription={selectedPath ?? t(catalog, language, "skills.detail.editorEmpty.copy")}
                rightTitle={t(catalog, language, "skills.detail.editorTitle")}
              />
              <div className={`${styles.splitBody} ${styles.splitBody3070}`}>
                <div className={`${styles.splitColumn} ${styles.splitColumnPrimary} skill-file-tree-panel`}>
                  <SkillFileTree
                    catalog={catalog}
                    detail={detail}
                    expandedPaths={expandedPaths}
                    fileNodes={fileNodes}
                    language={language}
                    onFileSelection={handleFileSelection}
                    onToggleDirectory={toggleDirectory}
                    selectedPath={selectedPath}
                  />
                </div>
                <div className={styles.splitDivider} aria-hidden="true" />
                <div className={`${styles.splitColumn} ${styles.splitColumnSecondary} skill-editor-panel`}>
                  <SkillEditorPanel
                    catalog={catalog}
                    draftContents={draftContents}
                    fileError={fileError}
                    isReadingFile={isReadingFile}
                    language={language}
                    onDraftChange={setDraftContents}
                    saveStatus={saveStatus}
                    selectedPath={selectedPath}
                  />
                </div>
              </div>
            </section>
          </section>
        </>
      ) : (
        <>
          <section className={`${styles.summaryGrid} ${styles.summaryGridSeparated}`}>
            <section className="panel" aria-labelledby="skill-summary-title">
              <div className="panel-header">
                <div>
                  <h2 id="skill-summary-title">
                    {t(catalog, language, "skills.detail.summaryTitle")}
                  </h2>
                  <p>{t(catalog, language, "skills.detail.summaryDescription")}</p>
                </div>
              </div>
              <SkillSnapshotSummary catalog={catalog} detail={detail} language={language} />
            </section>

            <section className="panel" aria-labelledby="skill-projects-title">
              <div className="panel-header">
                <div>
                  <h2 id="skill-projects-title">
                    {t(catalog, language, "skills.detail.workspaceTitle")}
                  </h2>
                  <p>{t(catalog, language, "skills.detail.workspaceDescription")}</p>
                </div>
              </div>
              <SkillProjectAssignments catalog={catalog} detail={detail} language={language} />
            </section>
          </section>

          <section className={`${styles.workspaceGrid} ${styles.workspaceGridSeparated}`}>
            <section className="panel skill-file-tree-panel" aria-labelledby="skill-file-tree-title">
              <div className="panel-header">
                <div>
                  <h2 id="skill-file-tree-title">
                    {t(catalog, language, "skills.detail.fileTreeTitle")}
                  </h2>
                  <p>{t(catalog, language, "skills.detail.fileTreeDescription")}</p>
                </div>
              </div>
              <SkillFileTree
                catalog={catalog}
                detail={detail}
                expandedPaths={expandedPaths}
                fileNodes={fileNodes}
                language={language}
                onFileSelection={handleFileSelection}
                onToggleDirectory={toggleDirectory}
                selectedPath={selectedPath}
              />
            </section>

            <section className="panel skill-editor-panel" aria-labelledby="skill-editor-title">
              <SkillEditorHeader
                isDirty={isDirty}
                isReadingFile={isReadingFile}
                isSaving={isSaving}
                onSave={() => void handleSave()}
                saveLabel={t(catalog, language, "skills.detail.save")}
                savingLabel={t(catalog, language, "skills.detail.saving")}
                subtitle={selectedPath ?? t(catalog, language, "skills.detail.editorEmpty.copy")}
                title={t(catalog, language, "skills.detail.editorTitle")}
              />
              <SkillEditorPanel
                catalog={catalog}
                draftContents={draftContents}
                fileError={fileError}
                isReadingFile={isReadingFile}
                language={language}
                onDraftChange={setDraftContents}
                saveStatus={saveStatus}
                selectedPath={selectedPath}
              />
            </section>
          </section>
        </>
      )}

      {pendingPath ? (
        <div className="modal-backdrop" onClick={() => setPendingPath(null)}>
          <div
            aria-labelledby="skill-discard-title"
            aria-modal="true"
            className="modal-panel modal-panel-compact"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="panel-header">
              <div>
                <h2 id="skill-discard-title">
                  {t(catalog, language, "skills.detail.discardDialog.title")}
                </h2>
                <p>{t(catalog, language, "skills.detail.discardDialog.copy")}</p>
              </div>
            </div>
            <div className="modal-actions modal-actions-pad">
              <button
                className="button button-secondary"
                onClick={() => setPendingPath(null)}
                type="button"
              >
                {t(catalog, language, "skills.detail.discardDialog.stay")}
              </button>
              <button
                className="button button-primary"
                onClick={() => void handleDiscardAndSwitch()}
                type="button"
              >
                {t(catalog, language, "skills.detail.discardDialog.discard")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type SkillDetailSplitHeaderProps = {
  leftDescription: string;
  leftTitle: string;
  rightActions?: ReactNode;
  rightDescription: string;
  rightTitle: string;
};

export function SkillDetailSplitHeader({
  leftDescription,
  leftTitle,
  rightActions,
  rightDescription,
  rightTitle
}: SkillDetailSplitHeaderProps) {
  return (
    <div className={`${styles.splitHeader} ${styles.splitHeader3070}`}>
      <div className={styles.splitHeaderCopy}>
        <h2>{leftTitle}</h2>
        <p>{leftDescription}</p>
      </div>
      <div className={styles.splitDivider} aria-hidden="true" />
      <div className={styles.splitHeaderCopy}>
        <div className={styles.splitHeaderTitleRow}>
          <h2>{rightTitle}</h2>
          {rightActions ? (
            <div className={styles.splitHeaderActions}>{rightActions}</div>
          ) : null}
        </div>
        <p>{rightDescription}</p>
      </div>
    </div>
  );
}

type SkillDetailTopbarActionsProps = {
  backLabel: string;
  currentLabel: string;
  isCurrent: boolean;
  isUpdateAvailable: boolean;
  onBack: () => void;
  updateAvailableLabel: string;
};

export function SkillDetailTopbarActions({
  backLabel,
  currentLabel,
  isCurrent,
  isUpdateAvailable,
  onBack,
  updateAvailableLabel
}: SkillDetailTopbarActionsProps) {
  return (
    <div className={styles.detailActions}>
      <span className={isUpdateAvailable ? "status-badge status-update" : "status-badge status-current"}>
        {isUpdateAvailable ? updateAvailableLabel : currentLabel}
      </span>
      <button className="button button-secondary" onClick={onBack} type="button">
        <ArrowLeft size={16} weight="bold" aria-hidden="true" />
        {backLabel}
      </button>
    </div>
  );
}

type SkillEditorHeaderProps = {
  isDirty: boolean;
  isReadingFile: boolean;
  isSaving: boolean;
  onSave: () => void;
  saveLabel: string;
  savingLabel: string;
  subtitle: string;
  title: string;
};

export function SkillEditorHeader({
  isDirty,
  isReadingFile,
  isSaving,
  onSave,
  saveLabel,
  savingLabel,
  subtitle,
  title
}: SkillEditorHeaderProps) {
  return (
    <div className={`panel-header ${styles.editorHeader}`}>
      <div>
        <h2 id="skill-editor-title">{title}</h2>
        <p>{subtitle}</p>
      </div>
      <div className={styles.editorHeaderActions}>
        {isDirty ? (
          <button
            className="button button-primary"
            disabled={isSaving || isReadingFile}
            onClick={onSave}
            type="button"
          >
            <FloppyDisk size={16} weight="bold" aria-hidden="true" />
            {isSaving ? savingLabel : saveLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

type SkillDetailContentProps = Pick<SkillDetailPageProps, "catalog" | "language"> & {
  detail: SkillDetailRecord;
};

type SkillFileTreeProps = SkillDetailContentProps & {
  expandedPaths: Set<string>;
  fileNodes: FileNode[];
  onFileSelection: (nextPath: string) => Promise<void>;
  onToggleDirectory: (path: string) => void;
  selectedPath: string | null;
};

type SkillEditorPanelProps = Pick<SkillDetailPageProps, "catalog" | "language"> & {
  draftContents: string;
  fileError: string | null;
  isReadingFile: boolean;
  onDraftChange: (nextValue: string) => void;
  saveStatus: string | null;
  selectedPath: string | null;
};

function SkillSnapshotSummary({ catalog, detail, language }: SkillDetailContentProps) {
  return (
    <dl className={`${styles.detailDataList} ${styles.detailDataListSingle}`}>
      <div>
        <dt>{t(catalog, language, "skills.detail.snapshotTitle")}</dt>
        <dd>{detail.sourceType} · {detail.sourceRef}</dd>
      </div>
      <div>
        <dt>{t(catalog, language, "skills.detail.snapshotDescription")}</dt>
        <dd className={styles.detailPathInline}>{detail.skillPath}</dd>
      </div>
      <div>
        <dt>{t(catalog, language, "skills.detail.managedRoot")}</dt>
        <dd className={styles.detailPathInline}>{detail.managedRootPath}</dd>
      </div>
      <div>
        <dt>{t(catalog, language, "skills.detail.workspaceTitle")}</dt>
        <dd>{detail.attachedProjectCount}</dd>
      </div>
    </dl>
  );
}

export function SkillProjectAssignments({ catalog, detail, language }: SkillDetailContentProps) {
  if (detail.projectUsages.length === 0) {
    return (
      <div className={`empty-state compact-empty-state ${styles.projectEmptyState}`}>
        <strong>{t(catalog, language, "skills.usage.empty.title")}</strong>
        <p>{t(catalog, language, "skills.usage.empty.copy")}</p>
      </div>
    );
  }

  return (
    <div className="compact-list compact-list-embedded">
      {detail.projectUsages.map((usage) => (
        <div className="compact-list-row compact-list-row-action" key={usage.projectId}>
          <div>
            <strong>{usage.projectName}</strong>
            <span className="path-cell">{usage.projectPath}</span>
          </div>
          <span
            className={
              usage.enabled ? "status-badge status-current" : "status-badge status-update"
            }
          >
            {t(
              catalog,
              language,
              usage.enabled
                ? "skills.usage.projectStatus.enabled"
                : "skills.usage.projectStatus.disabled"
            )}
          </span>
        </div>
      ))}
    </div>
  );
}

function SkillFileTree({
  catalog,
  detail,
  expandedPaths,
  fileNodes,
  language,
  onFileSelection,
  onToggleDirectory,
  selectedPath
}: SkillFileTreeProps) {
  if (detail.fileTree.length === 0) {
    return (
      <div className="empty-state compact-empty-state">
        <strong>{t(catalog, language, "skills.detail.fileTreeEmpty.title")}</strong>
        <p>{t(catalog, language, "skills.detail.fileTreeEmpty.copy")}</p>
      </div>
    );
  }

  return (
    <div className={styles.fileList} role="tree">
      {fileNodes.map((node) =>
        node.kind === "directory" ? (
          <button
            aria-expanded={expandedPaths.has(node.path)}
            className={`${styles.fileRow} ${styles.fileRowDirectory}`}
            key={node.path}
            onClick={() => onToggleDirectory(node.path)}
            role="treeitem"
            style={{ paddingLeft: `${16 + node.depth * 16}px` }}
            type="button"
          >
            {expandedPaths.has(node.path) ? (
              <CaretDown size={14} weight="bold" aria-hidden="true" />
            ) : (
              <CaretRight size={14} weight="bold" aria-hidden="true" />
            )}
            <Folder size={14} weight="bold" aria-hidden="true" />
            <span>{node.name}</span>
          </button>
        ) : (
          <button
            className={
              selectedPath === node.path
                ? `${styles.fileRow} ${styles.fileRowSelected}`
                : styles.fileRow
            }
            key={node.path}
            onClick={() => void onFileSelection(node.path)}
            role="treeitem"
            style={{ paddingLeft: `${16 + node.depth * 16}px` }}
            type="button"
          >
            <FileText size={14} weight="bold" aria-hidden="true" />
            <span>{node.name}</span>
          </button>
        )
      )}
    </div>
  );
}

function SkillEditorPanel({
  catalog,
  draftContents,
  fileError,
  isReadingFile,
  language,
  onDraftChange,
  saveStatus,
  selectedPath
}: SkillEditorPanelProps) {
  return (
    <>
      {fileError ? (
        <p className="form-error panel-message" role="alert">
          {fileError}
        </p>
      ) : null}

      {saveStatus ? (
        <p className="form-success panel-message" role="status">
          {saveStatus}
        </p>
      ) : null}

      {isReadingFile ? (
        <div className={styles.editorEmpty}>
          <strong>{t(catalog, language, "skills.detail.readingFile")}</strong>
        </div>
      ) : selectedPath ? (
        <div className={styles.editorShell}>
          <textarea
            className={styles.editor}
            onChange={(event) => onDraftChange(event.target.value)}
            spellCheck={false}
            value={draftContents}
          />
        </div>
      ) : (
        <div className={styles.editorEmpty}>
          <strong>{t(catalog, language, "skills.detail.editorEmpty.title")}</strong>
          <p>{t(catalog, language, "skills.detail.editorEmpty.copy")}</p>
        </div>
      )}
    </>
  );
}

function getSkillDetailLayoutMode(): SkillDetailLayoutMode {
  if (typeof window === "undefined") {
    return "merged";
  }

  return resolveSkillDetailLayout(window.innerWidth);
}

function buildVisibleNodes(
  entries: SkillFileTreeEntry[],
  expandedPaths: Set<string>
): FileNode[] {
  return entries
    .filter((entry) => isNodeVisible(entry.path, expandedPaths))
    .map((entry) => ({
      ...entry,
      depth: entry.path.split("/").length - 1
    }));
}

function isNodeVisible(path: string, expandedPaths: Set<string>) {
  const segments = path.split("/");
  if (segments.length <= 1) {
    return true;
  }

  for (let index = 0; index < segments.length - 1; index += 1) {
    const parentPath = segments.slice(0, index + 1).join("/");
    if (!expandedPaths.has(parentPath)) {
      return false;
    }
  }

  return true;
}

function defaultExpandedPaths(entries: SkillFileTreeEntry[]) {
  const next = new Set<string>();
  const defaultPath = defaultFilePath(entries);

  if (!defaultPath) {
    return next;
  }

  const segments = defaultPath.split("/");
  for (let index = 0; index < segments.length - 1; index += 1) {
    next.add(segments.slice(0, index + 1).join("/"));
  }

  return next;
}

function defaultFilePath(entries: SkillFileTreeEntry[]) {
  const editableFiles = entries.filter((entry) => entry.kind === "file" && entry.editable);
  const skillFile = editableFiles.find((entry) => entry.path === "SKILL.md");
  return skillFile?.path ?? editableFiles[0]?.path ?? null;
}

async function loadFile(
  skillId: string,
  relativePath: string,
  ignore: boolean,
  setSelectedPath: (value: string) => void,
  setOriginalContents: (value: string) => void,
  setDraftContents: (value: string) => void,
  setIsReadingFile: (value: boolean) => void,
  setFileError: (value: string | null) => void
) {
  setIsReadingFile(true);
  setFileError(null);

  try {
    const file = await readSkillFile(skillId, relativePath);
    if (ignore) {
      return;
    }
    setSelectedPath(file.path);
    setOriginalContents(file.contents);
    setDraftContents(file.contents);
  } catch (reason) {
    if (!ignore) {
      setFileError(errorMessage(reason));
    }
  } finally {
    if (!ignore) {
      setIsReadingFile(false);
    }
  }
}

function errorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

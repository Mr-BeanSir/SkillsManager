import { type MigrationWizardState } from "../migration/MigrationWizard";
import { type ProjectOnlyMigrationReport } from "../migration/migrationApi";

type RunMigrationWorkflowOptions = {
  executeMigration: () => Promise<ProjectOnlyMigrationReport>;
  onError?: (reason: unknown) => string;
  onState: (state: MigrationWizardState) => void;
};

export async function runMigrationWorkflow({
  executeMigration,
  onError = defaultErrorMessage,
  onState
}: RunMigrationWorkflowOptions) {
  onState({ kind: "running", step: "backup" });

  try {
    onState({ kind: "running", step: "migrate" });
    const report = await executeMigration();
    onState({ kind: "running", step: "report" });
    onState({ kind: "success", report });
  } catch (reason) {
    onState({ kind: "error", message: onError(reason) });
  }
}

function defaultErrorMessage(reason: unknown) {
  if (reason instanceof Error) {
    return reason.message;
  }

  return String(reason);
}

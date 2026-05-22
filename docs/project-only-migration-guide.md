# Project-Only Migration Guide

Last updated: 2026-05-19

## Purpose

Use this guide when an existing Skills Manager database still contains the legacy `global/custom/project` model and needs to move to the explicit project-only schema.

This migration is intentionally **manual and explicit**. It is **not** wired into normal database startup yet.

New first-run databases created by the current app bootstrap already use the project-only schema directly. This guide is only for upgrading older existing databases.

## What Changes

The project-only migration makes these behavior changes:

- downloaded skills remain stored as managed snapshots only
- skills become active only when a project enables them
- skill links are created only under project-local CLI target paths such as `.agents/skills` or `.codex/skills`
- legacy `global` and `custom` skills are reported for manual follow-up instead of being auto-converted into active project assignments

## Before You Run It

Confirm these points first:

- the current build already includes the project-only services and UI
- you are ready to review manual follow-up items after migration
- no one expects startup to auto-apply `0002_project_only_refactor.sql`

Recommended verification baseline:

```powershell
npm test
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

## How To Run The Migration

The migration command still exists in the Tauri backend, but the wizard is not currently mounted in the active Settings UI.

Before re-exposing or invoking it, confirm:

1. the database really comes from a legacy pre-project-only build
2. you want an operator-only upgrade flow, not automatic first-run initialization
3. the current build still includes `migrate_project_only_database_record`

## What The Wizard Reports

The migration wizard reports:

- whether the database was already migrated
- the backup file path created before applying the migration
- migrated project count
- migrated project-skill count
- warnings for legacy `global` or `custom` skills
- next-step guidance for operator follow-up

If the database already uses the project-only schema, the wizard reports that state and does not create another backup.

## Manual Follow-Up

Legacy `global` and `custom` skills are not auto-activated in the new model. After migration:

1. Review the listed skills in the migration report.
2. Open `Projects`.
3. For each project that should use one of those skills, add the managed snapshot to that project.
4. Select the needed project CLI targets such as `.agents/skills` or `.codex/skills`.
5. Reconcile if needed, or rely on `auto_reconcile` when enabled.

## Failure Recovery

If the migration fails:

- read the error surfaced by the invoking frontend or command runner
- keep any backup file that was already created
- fix the reported filesystem or database access issue
- rerun the migration explicitly from the wizard

Common operator checks:

- confirm the app can write to the database directory
- confirm the database file is not blocked by permissions or external tooling
- confirm you are running the intended build of the app

## After Migration

Expected steady-state behavior:

- installation stores snapshots only and creates no links
- activation happens from the `Projects` page
- reconcile manages only project-local links
- `Directories` remains out of the primary navigation
- `auto_reconcile` is controlled from `Settings`

## Related Files

- `src-tauri/migrations/0002_project_only_refactor.sql`
- `src-tauri/src/migration.rs`
- `src/features/migration/MigrationWizard.tsx`
- `src/features/migration/migrationApi.ts`
- `docs/design/project-only-refactor.md`

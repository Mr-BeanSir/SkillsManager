# Agent Instructions

## Read First

Before implementation, read:

1. `CONTEXT.md`
2. `docs/design/skills-manager-core-design.md`
3. `docs/design/project-only-refactor.md`
4. `docs/superpowers/plans/2026-05-17-mvp-task-breakdown.md`
5. `docs/ai-session-handoff.md`

For UI work, also load:

- `.agents/skills/minimalist-ui/SKILL.md`
- `web-design-guidelines` and fetch its latest guideline source before review

## Current Direction

The original MVP task breakdown is complete through Task 15. Active implementation is now the project-only refactor in `docs/design/project-only-refactor.md`.

Current refactor progress:

- Phase 1 Task 1.1 complete: `0002_project_only_refactor.sql`
- Phase 1 Task 1.2 complete: explicit migration service and Tauri command
- Phase 1 Task 1.3 complete: Rust domain models updated to the project-only schema
- Phase 2 Task 2.1 complete: `projects.rs` CRUD service and Tauri commands
- Phase 2 Task 2.2 complete: `project_skills.rs` service for add/list/enable/disable/remove
- Phase 2 Task 2.3 complete: `project_groups.rs` service for attach/list/enable/disable/remove
- Phase 2 Task 2.4 complete: `reconcile.rs` rewritten for the project-only schema
- Phase 2 Task 2.5 complete: symlink helpers updated for project-only cleanup
- Phase 2 Task 2.6 complete: install services decoupled from symlink creation
- Phase 3 Task 3.1 complete: Projects page and project CRUD UI wiring
- Phase 3 Task 3.2 complete: Project detail page for project skills, groups, and CLI targets
- Phase 3 Task 3.3 complete: Skills page updated for project-only usage visibility
- Phase 3 Task 3.4 complete: Groups page updated for project-only group definitions and project usage visibility
- Phase 3 Task 3.5 complete: Discover page install flow aligned to project-only snapshot installs
- Phase 3 Task 3.6 complete: Settings page wired to the `auto_reconcile` toggle
- Phase 3 Task 3.7 complete: Directories removed from the active primary navigation
- Phase 3 Task 3.8 complete: bundled i18n fallback copy synced to `public/locales`
- Phase 4 Task 4.1 complete in backend/frontend support code: migration workflow components and the explicit Tauri migration command remain in the repo for operator-only use when needed
- Phase 4 Task 4.2 complete in backend/frontend support code: migration flow supports staged progress, richer reporting, and clearer error guidance, but is intentionally not surfaced in the active Settings UI
- Phase 5 Task 5.1 partial: targeted unit tests now cover migration workflow state transitions and `auto_reconcile` parsing
- Phase 5 Task 5.2 partial: reconcile integration coverage now includes project deletion cleanup, multi-target selective cleanup, and cross-project isolation
- Phase 5 Task 5.3 complete: project-only docs, glossary, and migration guide synced to the current implementation
- Phase 5 Task 5.4 complete by operator decision: manual testing will happen later in the desktop app, outside the coding session
- Post-phase runtime and UI polish complete on 2026-05-19:
  - first-run app-data databases now initialize directly to the current project-only schema
  - Settings exposes `auto_reconcile`, language selection, and discover page size
  - Discover uses a modal repository install flow with a pre-install `Check` action
  - the app shell keeps the left navigation fixed while the right workspace scrolls independently
- Deferred follow-ups from Phase 5.1 and 5.2 live in `future/phase5-followups.md`
- Current stage status: implementation phase closed unless one of the deferred follow-ups is reactivated

Each task needs passing verification and a git commit before moving on.

## Hard Rules

- Tauri 2 + React + TypeScript frontend + Rust backend is the chosen architecture.
- SQLite is the source of truth for app state.
- Rust owns persistence, filesystem, symlinks, app-data paths, and Tauri commands.
- The frontend never talks to SQLite directly.
- `docs/design/project-only-refactor.md` is the active target architecture. `docs/design/skills-manager-core-design.md` is legacy MVP context and is partially superseded during the transition.
- Do not auto-apply `0002_project_only_refactor.sql` during normal database startup yet. Use the explicit migration command until Phase 2 and Phase 3 complete.
- Skill Links are filesystem symlinks only. Do not copy folders and do not create Windows `.lnk` shortcuts as a fallback.
- Deletes are hard deletes for owned app records and managed symlinks.

## Verification

Use these before claiming completion:

```powershell
npm test
npm run build
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml
```

Current full verification passed again after Phase 3 Task 3.5 on 2026-05-18.
Current full verification passed again after Phase 4 Task 4.1 on 2026-05-19.
Additional targeted verification passed during Phase 4 Task 4.2 and Phase 5 follow-up test work on 2026-05-19.
Current full verification passed again after the post-phase Discover and Settings polish on 2026-05-19.

## UI Rules

- Build a dense utility app, not a landing page.
- Use warm monochrome, restrained borders, no gradients, no heavy shadows.
- Use semantic buttons and labelled controls.
- Icon-only buttons need `aria-label`.
- Tables and long paths must handle truncation without layout overlap.
- All user-visible copy must go through the i18n catalog. Do not hardcode visible strings in components, dialogs, badges, buttons, placeholders, empty states, toasts, or runtime status text.
- When adding or changing user-visible copy, update both `src/locales/en.json` and `src/locales/zh.json`, and keep fallback behavior working.

# Agent Instructions

## Read First

Before implementation, read:

1. `CONTEXT.md`
2. `docs/design/skills-manager-core-design.md`
3. `docs/design/project-only-refactor.md`
4. `docs/ai-session-handoff.md`

For UI work, also load:

- `.agents/skills/minimalist-ui/SKILL.md`
- `web-design-guidelines` and fetch its latest guideline source before review

## Current Status

Project-only refactor is **complete** (all 5 phases). Implementation phase is closed unless deferred follow-ups are reactivated.

- Deferred follow-ups live in `future/phase5-followups.md`
- First-run databases initialize to the current project-only schema
- Settings exposes `auto_reconcile`, language selection, and discover page size

Each task needs passing verification and a git commit before moving on.

## Hard Rules

- Tauri 2 + React + TypeScript frontend + Rust backend is the chosen architecture.
- SQLite is the source of truth for app state.
- Rust owns persistence, filesystem, symlinks, app-data paths, and Tauri commands.
- The frontend never talks to SQLite directly.
- `docs/design/project-only-refactor.md` is the active target architecture. `docs/design/skills-manager-core-design.md` is legacy MVP context.
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

## UI Rules

- Build a dense utility app, not a landing page.
- Use warm monochrome, restrained borders, no gradients, no heavy shadows.
- Use semantic buttons and labelled controls.
- Icon-only buttons need `aria-label`.
- Tables and long paths must handle truncation without layout overlap.
- All user-visible copy must go through the i18n catalog. Do not hardcode visible strings in components, dialogs, badges, buttons, placeholders, empty states, toasts, or runtime status text.
- When adding or changing user-visible copy, update both `src/locales/en.json` and `src/locales/zh.json`, and keep fallback behavior working.

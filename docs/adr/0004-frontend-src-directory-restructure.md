# 0004 — Frontend src/ Directory Restructure

## Status

Accepted

## Context

The `src/` directory currently uses a feature-based structure (`features/projects/`, `features/skills/`, etc.), but within each feature directory, all files are flat: list pages, detail pages, APIs, state modules, test files, and CSS modules are mixed in a single directory. For example, `features/projects/` has 16 files. This makes it hard to navigate and understand the structure at a glance.

The project is a React 18 + Tauri 2 desktop SPA with 82 source files, using Vite, Vitest, CSS Modules, and a custom i18n system. There is no router library — navigation is state-based.

## Decision

Restructure `src/` into the following layout:

```
src/
├── main.tsx                          ← Vite entry point
│
├── app/                              ← App Shell layer
│   ├── App.tsx                       ← Root component + routing
│   ├── appNav.ts                     ← Navigation config (PageId)
│   ├── appPageState.ts               ← Page state / route definitions
│   ├── i18n.ts                       ← Custom i18n engine
│   ├── message.tsx                   ← Toast / notification system
│   ├── styles/                       ← Global styles
│   │   ├── base.css
│   │   ├── components.css
│   │   ├── layout.css
│   │   ├── message.css
│   │   ├── pages.css
│   │   └── styles.css                ← Former root-level styles.css
│   └── locales/                      ← Translation files
│       ├── en.json
│       └── zh.json
│
├── features/                         ← Feature modules
│   ├── discover/
│   │   ├── home/                     ← Browse/discover page
│   │   │   ├── DiscoverPage.tsx
│   │   │   ├── DiscoverPage.module.css
│   │   │   └── __tests__/
│   │   │       └── DiscoverPage.test.tsx
│   │   ├── detail/                   ← Remote skill detail page
│   │   │   ├── RemoteSkillDetailPage.tsx
│   │   │   ├── RemoteSkillDetailPage.module.css
│   │   │   └── __tests__/
│   │   │       └── RemoteSkillDetailPage.test.tsx
│   │   ├── discoverApi.ts
│   │   ├── remoteSkillDetailApi.ts
│   │   └── repositoryInstallApi.ts
│   │
│   ├── groups/
│   │   ├── home/
│   │   │   ├── GroupsPage.tsx
│   │   │   ├── GroupsPage.model.ts
│   │   │   ├── GroupsPage.module.css
│   │   │   └── __tests__/
│   │   │       └── GroupsPage.test.tsx
│   │   ├── detail/
│   │   │   ├── GroupDetailPage.tsx
│   │   │   └── __tests__/
│   │   │       └── GroupDetailPage.test.tsx
│   │   └── groupsApi.ts
│   │
│   ├── migration/
│   │   ├── wizard/                   ← Single "page" — wizard
│   │   │   ├── MigrationWizard.tsx
│   │   │   ├── MigrationWizard.module.css
│   │   │   └── __tests__/
│   │   │       └── MigrationWizard.test.tsx
│   │   └── migrationApi.ts
│   │
│   ├── projects/
│   │   ├── home/
│   │   │   ├── ProjectsPage.tsx
│   │   │   ├── ProjectsPage.module.css
│   │   │   └── __tests__/
│   │   │       └── ProjectsPage.test.tsx
│   │   ├── detail/
│   │   │   ├── ProjectDetailPage.tsx
│   │   │   ├── ProjectDetailPage.module.css
│   │   │   ├── projectDetailRowState.ts
│   │   │   ├── projectDetailSelectionModel.ts
│   │   │   └── __tests__/
│   │   │       ├── ProjectDetailPage.test.tsx
│   │   │       ├── projectDetailRowState.test.ts
│   │   │       └── projectDetailSelectionModel.test.ts
│   │   ├── projectsApi.ts
│   │   ├── projectDetailApi.ts
│   │   ├── projectCliTargetsApi.ts
│   │   └── projectsPageModel.ts
│   │
│   ├── settings/
│   │   ├── home/
│   │   │   ├── SettingsPage.tsx
│   │   │   ├── SettingsPage.module.css
│   │   │   └── __tests__/
│   │   │       └── SettingsPage.test.tsx
│   │   ├── detail/
│   │   │   ├── CliTargetsPage.tsx
│   │   │   ├── CliTargetsPage.module.css
│   │   │   └── __tests__/
│   │   │       └── CliTargetsPage.test.tsx
│   │   ├── settingsApi.ts
│   │   ├── cliTargetsApi.ts
│   │   ├── desktopRuntimeApi.ts
│   │   └── settingsPageModel.ts
│   │
│   └── skills/
│       ├── home/
│       │   ├── SkillsPage.tsx
│       │   └── __tests__/
│       │       └── (no test currently)
│       ├── detail/
│       │   ├── SkillDetailPage.tsx
│       │   ├── SkillDetailPage.module.css
│       │   ├── skillDetailLayout.ts
│       │   └── __tests__/
│       │       └── SkillDetailPage.test.tsx
│       ├── skillsApi.ts
│       ├── skillDetailApi.ts
│       ├── skillsPageModel.ts
│       └── skillsUpdateState.ts
│
├── domain/                           ← Pure business logic (no React)
│   ├── cliTargets.ts
│   ├── cliTargets.test.ts
│   ├── skillIdentity.ts
│   └── skillIdentity.test.ts
│
└── shared/                           ← Cross-feature reusable code
    ├── components/
    │   ├── Modal.tsx                 ← Base: backdrop + panel + header + actions
    │   ├── Modal.module.css
    │   ├── ConfirmDialog.tsx         ← Built on Modal: title + description + cancel/confirm
    │   ├── FormDialog.tsx            ← Built on Modal: title + description + form + cancel/submit
    │   └── __tests__/
    └── remote-content/
        ├── remoteContent.ts
        ├── remoteContent.test.ts
        ├── SafeRemoteMarkdownPreview.tsx
        ├── SafeRemoteMarkdownPreview.test.tsx
        └── README.md
```

## Principles

1. **Page-based subdirectories** — Each page (home, detail) gets its own directory under the feature. This directly solves the original pain point of mixed files.

2. **Tests in `__tests__/`** — Test files are moved from co-location into `__tests__/` subdirectories within each page directory. Keeps tests near their subjects but out of the main file listing.

3. **APIs and shared state at feature root** — API modules and cross-page state stay at the feature root level. They are not page-specific and are imported by multiple pages.

4. **App Shell in `app/`** — Routing, navigation, i18n, global styles, and the message system are all App Shell concerns. They move into `app/`, leaving `main.tsx` as the sole root entry point.

5. **Extract shared modal components** — The project has 13 modal instances across 7 files, all repeating the same backdrop + panel + header + actions HTML skeleton. Extract `Modal`, `ConfirmDialog`, and `FormDialog` into `shared/components/` to eliminate this duplication.

6. **domain/ and shared/ unchanged** — These layers are already clean and small. No restructuring needed.

## Consequences

- **Positive**: Feature directories become scannable at a glance — you can immediately see which pages exist and where tests live.
- **Positive**: Adding a new page to a feature is predictable: create a new subdirectory under the feature.
- **Positive**: `app/` clearly separates framework wiring from business features.
- **Positive**: 13 modal instances collapse to 3 shared components, reducing ~300 lines of duplicated boilerplate.
- **Negative**: More directory nesting means slightly longer import paths (mitigated by IDE auto-import).
- **Negative**: One-time migration cost — every import path in the project needs updating.
- **Negative**: `domain/` tests remain co-located (not in `__tests__/`), which is a minor inconsistency. Accepted because domain has only 4 files.

## Alternatives considered

- **Responsibility-based subdirectories** (`components/`, `services/`, `state/`): Rejected — this recreates the "scan multiple directories to find one page" problem at a different level.
- **Keep tests co-located**: Rejected per user preference — the explicit goal is to reduce visual clutter in directory listings.
- **Merge domain/ into shared/**: Rejected — domain is pure business logic with no UI coupling; keeping it separate reinforces the dependency direction.

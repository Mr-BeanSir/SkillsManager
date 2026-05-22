# Projects And Skills Detail Refactor Design

Date: 2026-05-19
Status: Approved for implementation

## Goal

Refactor the `Projects` and `Skills` surfaces so they use dedicated detail pages instead of inline expansion panels, while also tightening the project management workflow and adding editable skill file browsing.

This design is intentionally scoped to the current Tauri 2 + React + TypeScript + Rust architecture and the existing project-only model. It does not introduce a routing library, backend pagination, or a general-purpose file manager.

## Constraints

- Follow `AGENTS.md` and the current project-only direction.
- Keep Rust as the owner of filesystem access, path resolution, and file writes.
- The frontend must never read or write the filesystem directly.
- Reuse the app's current page-state navigation pattern, but extend it to support true detail views.
- Preserve the dense utility-app visual language.

## Scope

### In scope

- Promote project detail and skill detail into explicit page-level views.
- Remove the top stats cards from the `Projects` page.
- Move new-project creation into a modal with a directory picker button.
- Replace browser `confirm` usage in the `Projects` page with a custom confirmation dialog.
- Add local pagination to the `Projects` list with a default page size of 20.
- Change the `Skills` page eye action into navigation to a dedicated `SkillDetailPage`.
- Add a skill detail file tree and text editor with save support.

### Out of scope

- Adding a routing library such as React Router.
- Adding project favorites.
- Backend pagination for projects.
- A general-purpose reusable global modal framework.
- Editing binary files or acting as a broad filesystem browser.

## Navigation Model

Extend the app-level page state from a flat tab identifier into a lightweight route-like structure:

- `projects`
- `projects/:projectId`
- `skills`
- `skills/:skillId`

Implementation intent:

- `ProjectsPage` handles only the project list.
- `ProjectDetailPage` handles only a single project's detail view.
- `SkillsPage` handles only the skills list.
- `SkillDetailPage` handles only a single skill's detail view.
- `App.tsx` owns switching between list and detail pages.

This preserves the current architecture while removing inline detail panels from list pages.

## Projects Page

### Layout

The `Projects` page becomes a single primary list panel.

Remove:

- The 4 summary metric cards at the top.

Keep:

- Page heading.
- One main list panel for registered projects.

### Toolbar

The list panel header contains:

- Search input.
- Primary `新增` / `Add` button at the right side.

### New Project Modal

The modal contains:

- Project name input.
- Project path input.
- A directory picker button attached to the right side of the project path input.
- Cancel button.
- Create button.

Behavior:

- Clicking the directory picker opens the native Tauri directory selection dialog.
- When the user chooses a directory, its absolute path fills the project path input.
- Closing the modal resets the draft when safe to do so.

### Project List Table

Columns:

- Name
- Path
- Updated
- Actions

Behavior:

- Clicking the project name navigates to `projects/:projectId`.
- The actions column contains only the delete button.

### Delete Confirmation

Replace `window.confirm` with a custom page-level confirmation dialog.

Behavior:

- Triggered by the row delete button.
- Shows the project name in the warning copy.
- Confirms deletion without deleting the real project folder.

### Pagination

Use local pagination in the frontend.

Rules:

- Default page size: 20.
- Apply search filtering first, then paginate the filtered results.
- Reset to page 1 when the search query changes.
- If deletion empties the current page, clamp back to the nearest valid page.

## Skills Page

### List Page

The `Skills` page remains a list-first management screen.

Behavior changes:

- The eye action no longer expands usage details below the table.
- The eye action navigates to `skills/:skillId`.
- The inline usage detail panel is removed from the list page.

Optional navigation affordance:

- The skill name may also navigate to the detail page for a more direct interaction model.

### Skill Detail Page

The skill detail view has three vertical sections.

#### 1. Header

Contains:

- Back to skills list action.
- Skill name.
- Source type and source reference.
- Skill path.
- Update state.
- Save button area at the upper right.

Rules:

- Save button only appears when the currently opened file has unsaved changes.

#### 2. Summary And Project Usage

Two-column information area:

- Left: snapshot summary
- Right: project assignments

Snapshot summary includes:

- Source
- Skill path
- Managed directory name or resolved managed root path
- Attached project count

Project assignments include:

- Project name
- Project path
- Enabled / disabled status badge

Empty state:

- If no project assignments exist, show the existing project-only empty-state message pattern.

#### 3. File Workspace

Two-column workspace:

- Left: file tree
- Right: file editor

File tree behavior:

- Display the managed skill directory as a tree.
- Support nested directories.
- Allow collapsing directories.
- Prefer selecting `SKILL.md` by default when present.

Editor behavior:

- Show the selected file's relative path.
- Load text content for the selected file.
- Allow inline editing.
- Track dirty state by comparing original and current content.
- Show save button only when dirty.

Unsaved changes behavior:

- Intercept file switches when current content is dirty.
- Intercept leaving the skill detail page when current content is dirty.
- Use a custom confirmation dialog with:
  - discard changes
  - continue editing

## Backend Additions

Add only the backend capabilities required for the approved UI.

### Directory picker

Command:

- `select_directory`

Responsibility:

- Open native directory picker.
- Return selected absolute path.
- Return empty or null-equivalent result when canceled.

### Skill detail

Command:

- `get_skill_detail`

Responsibility:

- Resolve a skill by `skill_id`.
- Return:
  - base skill metadata
  - managed directory info
  - project usage
  - file tree metadata

### File read

Command:

- `read_skill_file`

Responsibility:

- Read one text file within the selected skill's managed directory.

### File write

Command:

- `write_skill_file`

Responsibility:

- Save one text file within the selected skill's managed directory.

## File Tree And Editing Rules

### Supported file types in v1

Editable:

- `.md`
- `.txt`
- `.json`
- `.yaml`
- `.yml`

Not editable in v1:

- Binary files
- Very large files
- Hidden system files

### Security boundaries

All file operations must:

- Resolve the managed skill root from `skill_id`.
- Accept only normalized relative paths.
- Reject:
  - absolute paths
  - `..`
  - any path escaping the skill root

No file read or write is allowed outside the managed directory of the requested skill.

## Component And API Structure

### Frontend

Add or refactor:

- `src/features/projects/ProjectsPage.tsx`
- `src/features/projects/ProjectDetailPage.tsx`
- `src/features/projects/projectsApi.ts`
- `src/features/skills/SkillsPage.tsx`
- `src/features/skills/SkillDetailPage.tsx`
- `src/features/skills/skillsApi.ts`
- `src/features/skills/skillDetailApi.ts` if splitting detail-specific calls is cleaner

### Backend

Add or refactor:

- dialog command wiring in `src-tauri/src/lib.rs`
- skill detail / file access module, likely a dedicated `src-tauri/src/skill_files.rs` or similarly named module

## Error Handling

### Projects page

- Directory selection cancel should do nothing and preserve current draft state.
- Deletion errors should surface in the panel status/error area.

### Skill detail page

- Reading an unsupported or invalid file should show an inline error state.
- Save failures should not discard local unsaved text.
- If a file disappears between tree load and read, show a recoverable error and keep the user in the detail page.

## Testing Plan

### Frontend verification

- `npm run build`

### Rust verification

- Add unit tests for:
  - skill root path resolution
  - safe relative-path validation
  - allowed file read/write inside root
  - rejected traversal attempts

- Run:
  - `cargo test --manifest-path src-tauri/Cargo.toml`
  - `cargo check --manifest-path src-tauri/Cargo.toml`

### Manual behavior checks after implementation

- Create project from modal using typed path.
- Create project from modal using directory picker.
- Delete project through custom confirmation dialog.
- Project list pagination at >20 projects.
- Enter skill detail from eye action.
- Browse nested skill files.
- Edit and save a markdown file.
- Confirm unsaved-change interception on file switch and page exit.

## Recommended Implementation Order

1. Extend app-level navigation model for `projects/:id` and `skills/:id`.
2. Refactor `ProjectsPage` into list-only page.
3. Add project modal directory picker and custom delete dialog.
4. Add local projects pagination.
5. Refactor `SkillsPage` into list-only page.
6. Add backend skill detail and file tree APIs.
7. Build `SkillDetailPage`.
8. Add file read/write and unsaved-change guarding.
9. Run frontend and Rust verification.

## Decision Summary

- Approved approach: dedicated detail pages without adding a routing library.
- Do not implement project favorites in this slice.
- Do not add backend pagination in this slice.
- Keep scope centered on `Projects` and `Skills` only.

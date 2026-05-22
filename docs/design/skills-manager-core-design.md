# Skills Manager Core Design

> Status note (2026-05-19): this document is now legacy MVP context. The active runtime architecture has moved to the project-only model in `docs/design/project-only-refactor.md`. Keep this file only as historical baseline and migration comparison, not as the current source of truth for new implementation.

## Legacy Snapshot

This document preserves the original MVP `global/custom/project` design so later refactor work can explain what changed.

Current source of truth for active behavior:

- Project-only architecture and task plan: `docs/design/project-only-refactor.md`
- Operator migration steps: `docs/project-only-migration-guide.md`
- Repository continuation state: `docs/ai-session-handoff.md`

## Purpose

Skills Manager is a cross-platform desktop app for discovering, installing, updating, and linking agent Skills into local CLI skill directories. The app targets Windows, macOS, and Linux, and ships in both installer and portable package forms. All package forms use the platform App Data directory for persistent state.

## Architecture

The desktop app uses Tauri 2.

- The web frontend owns browsing, forms, tables, link mode selection, and update controls.
- The web frontend loads user-facing language labels from `public/locales/manifest.json` and per-language JSON files.
- The Rust backend owns filesystem access, SQLite persistence, symbolic link creation, reconcile jobs, and update/install operations.
- The app stores persistent data in SQLite under the platform App Data directory.
- Installed Skill snapshots live under the same App Data directory in a managed skills folder.

## Localization

The app ships with English and Chinese locale files under `public/locales`.

`public/locales/manifest.json` is the source of truth for available display languages. Each entry contains:

```text
code
label
htmlLang
path
```

To add a display language, add a locale JSON file under `public/locales` and add a matching manifest entry. Missing keys fall back to the default language before falling back to the built-in English/Chinese safety catalog.

Platform App Data locations are resolved through Tauri or Rust platform APIs rather than hard-coded:

- Windows: `%APPDATA%\SkillsManager`
- macOS: `~/Library/Application Support/SkillsManager`
- Linux: `~/.local/share/SkillsManager`

## Remote Source

The remote source is `skills.sh`.

The client exposes four discovery entry points:

- `search(query, page)`
- `listTrending(page)`
- `listHot(page)`
- `listAll(page)`

Remote discovery results are not cached locally. Discovery views use paginated lists rather than infinite scroll.

The first live discovery slice uses `https://www.skills.sh/api/search?q=<query>&page=<page>` for Search when the query has at least 2 characters. Short or empty Search queries, Trending, Hot, and All currently read the server-rendered skills.sh pages and normalize the embedded `skills` payload until stable JSON endpoints are available for those entry points. The frontend calls the Rust Tauri command for live discovery only in the desktop runtime; browser-only Vite preview keeps fixture fallback data.

Installing a Skill downloads a local snapshot and stores a remote reference for future updates. Installed Skills remain usable without network access, but update checks use the saved remote reference.

The live public source install path supports GitHub repositories, GitLab repositories, `.well-known/skills.json` manifests, and direct raw `SKILL.md` URLs without shelling out to `npx skills`. Repository installs clone into a temporary directory, search common Skill directories first, fall back to bounded recursive discovery, validate `SKILL.md` frontmatter, match the requested Skill name against the frontmatter name or folder name, then install that folder as the managed snapshot. Direct raw `SKILL.md` and well-known manifest installs download the selected entrypoint into a temporary Skill directory before using the same managed snapshot installer.

## Skill Identity And Storage

Each installed Skill has a stable `skill_id` derived from:

```text
source_type + source_ref + skill_path
```

The Skill display name is stored separately as `name`.

The local managed directory uses a readable, collision-resistant form:

```text
managed-skills/<safe_name>-<short_hash>/
```

Example:

```text
managed-skills/grill-with-docs-499b7424/
```

Symlink names default to the Skill `name`.

Only the latest local snapshot is retained. Updating a Skill downloads into a temporary location, validates the result, then replaces the current managed directory. Failed updates leave the old snapshot intact.

## Link Modes

Each Managed Skill has exactly one active `link_mode`.

### Global

Global mode automatically maintains Skill Links for:

- detected home-level built-in CLI targets
- all Custom Directories

Global discovery scans only the direct children of the user's home directory. It does not recursively scan the home directory. A home child matches a CLI target when its name equals `cli_targets.home_directory_name`.

For a matched built-in target, the link destination is:

```text
<home>/<home_directory_name>/<skills_subpath>
```

Global mode does not create missing built-in CLI directories. It only links into detected built-in targets and all configured Custom Directories.

### Custom

Custom mode lets the user explicitly select link targets.

The selection UI has three sections:

- Common CLI
- Other CLI
- Custom Directories

Common and Other CLI entries both come from `cli_targets`; `is_common` controls grouping. Missing CLI targets are still selectable in Custom mode. If selected, the app creates the needed target directory before creating the Skill Link.

Custom Directories are exact link destination directories. The app does not append a `skills` child directory to a Custom Directory.

Custom selections are stored in `skill_selected_targets`. Actual link results are stored in `skill_links`.

### Project

Project mode installs the Skill as a Managed Skill without creating Skill Links during installation.

Project links are created later through Skill Groups.

## Skill Groups

A Skill Group is a project-level deployment unit. It contains:

- project-eligible Skills
- Project Roots
- Project CLI Targets

Skill Groups are independent from Custom mode and do not reference CLI groups. CLI groups were rejected; Custom mode uses direct target selection.

Project Roots are shared path references. Deleting a Skill Group removes association rows but does not delete shared Project Root records and never deletes filesystem project directories.

The default project target is the Agents Common Directory:

```text
.agents/skills
```

Skill Groups may also include additional project targets derived from built-in CLI target definitions or custom project-relative paths. The app creates selected project target directories under each Project Root and then creates symlinks for the group's Skills.

## Symbolic Links

Skill Links are filesystem symbolic links.

The app never silently falls back to copied folders or Windows `.lnk` shortcuts. If symlink creation fails, the app records the failure and surfaces the platform-specific remediation to the user, such as enabling Windows Developer Mode or running with administrator rights.

Deleting a Custom Directory removes only symlinks that:

- are inside that Custom Directory
- are actual symlinks
- point into the Skills Manager managed skills directory

Regular files, real directories, and symlinks pointing outside the managed skills directory are never deleted by this cleanup.

## Reconcile

Reconcile makes the filesystem match the current database state and configured targets.

Reconcile runs:

- on app startup
- once per hour while the app is running
- after installing a Skill
- after changing a Custom Directory
- after changing a Skill's link mode
- after updating a Skill

Global reconcile computes targets from detected built-in CLI targets plus all Custom Directories.

Custom reconcile computes targets from `skill_selected_targets`.

Project reconcile computes targets from Skill Group memberships, Project Roots, and Project Targets.

`skill_links.status` values:

- `linked`: symlink exists and points to the expected managed Skill directory
- `missing`: a link record exists but the filesystem entry is absent
- `conflict`: the link path is occupied by a non-matching file, directory, or symlink
- `failed`: create, delete, or check failed because of permissions or another filesystem error

Deleted links are hard-deleted from the database rather than kept as a status.

## Update Checks

Update checks run on app startup and can also be triggered manually from the installed Skills list.

The installed Skills list has:

- a top-right "check updates" action
- a "update all" action shown only when at least one Skill has an available update
- a row-level update icon for each Skill with an available update

Updates are not applied automatically.

Updating a Skill:

- downloads the new snapshot
- validates it
- replaces the managed local snapshot
- preserves `link_mode`
- preserves Custom selected targets
- reconciles links for the updated Skill
- updates installed version/hash and update status

## SQLite Schema

### skills

```text
id
name
description
source_type
source_ref
skill_path
managed_dir_name
installed_version
installed_hash
latest_version
latest_hash
update_available
link_mode
created_at
updated_at
last_update_check_at
```

Constraints:

```text
primary key (id)
unique(source_type, source_ref, skill_path)
```

### skill_links

```text
id
skill_id
target_type
target_id
target_path
link_path
managed_target_path
status
error_message
created_at
updated_at
checked_at
```

Constraints:

```text
primary key (id)
unique(skill_id, target_type, target_id, link_path)
foreign key (skill_id) references skills(id) on delete cascade
```

### skill_selected_targets

```text
id
skill_id
target_type
target_id
created_at
updated_at
```

Constraints:

```text
primary key (id)
unique(skill_id, target_type, target_id)
foreign key (skill_id) references skills(id) on delete cascade
```

### custom_directories

```text
id
name
path
created_at
updated_at
```

Constraints:

```text
primary key (id)
unique(path)
```

### cli_targets

```text
id
display_name
home_directory_name
skills_subpath
is_common
created_at
updated_at
```

Constraints:

```text
primary key (id)
unique(home_directory_name)
```

### skill_groups

```text
id
name
created_at
updated_at
```

Constraints:

```text
primary key (id)
unique(name)
```

### project_roots

```text
id
name
path
created_at
updated_at
```

Constraints:

```text
primary key (id)
unique(path)
```

### skill_group_skills

```text
group_id
skill_id
created_at
```

Constraints:

```text
primary key (group_id, skill_id)
foreign key (group_id) references skill_groups(id) on delete cascade
foreign key (skill_id) references skills(id) on delete cascade
```

### skill_group_project_roots

```text
group_id
project_root_id
created_at
```

Constraints:

```text
primary key (group_id, project_root_id)
foreign key (group_id) references skill_groups(id) on delete cascade
foreign key (project_root_id) references project_roots(id) on delete cascade
```

### project_targets

```text
id
group_id
target_type
target_id
relative_path
is_default
created_at
updated_at
```

Constraints:

```text
primary key (id)
unique(group_id, target_type, target_id, relative_path)
foreign key (group_id) references skill_groups(id) on delete cascade
```

## Delete Behavior

Deleting a Skill:

- deletes its managed local snapshot
- deletes its symlinks
- deletes its `skill_links`
- deletes its `skill_selected_targets`
- deletes its `skill_group_skills` membership rows
- does not delete Project Roots or Skill Groups

Deleting a Custom Directory:

- deletes symlinks in that directory only if they point into the managed skills directory
- deletes related `skill_links`
- deletes related `skill_selected_targets`
- deletes the `custom_directories` record

Deleting a Skill Group:

- deletes project symlinks created by that group
- deletes `skill_group_skills`
- deletes `skill_group_project_roots`
- deletes `project_targets`
- deletes the `skill_groups` record
- does not delete Skills
- does not delete Project Roots
- does not delete filesystem project directories

Deleting a Project Root:

- deletes project symlinks associated with that root
- deletes `skill_group_project_roots` rows for that root
- deletes the `project_roots` record
- does not delete the filesystem project directory
- does not delete Skills

Deleting a CLI Target:

- deletes only the target definition
- does not delete real filesystem directories
- leaves existing link state to be resolved by reconcile

## Package Types

Installer and portable packages both use the platform App Data directory. The portable package is portable in launch form only; it does not keep application data beside the executable.

## Open Implementation Details

- Exact `skills.sh` API response shapes need to be verified during implementation.
- The initial built-in `cli_targets` list and Common CLI subset will be provided by the product owner.
- The install flow needs final UI copy, but the domain behavior is fixed by this document.

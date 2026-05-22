# Skills Manager

Skills Manager helps users discover, install, and expose agent skills to multiple local CLI tools across operating systems.

## Language

**Skill**:
A reusable agent capability packaged as a folder containing a `SKILL.md` entrypoint.
_Avoid_: Plugin, extension, prompt

**Managed Skill**:
A Skill installed into the Skills Manager controlled storage area.
_Avoid_: Local copy, package

**Skill Link**:
A filesystem symbolic link from a CLI Skill Directory to a Managed Skill.
_Avoid_: Shortcut, copy, install target

**Skill Link State**:
The recorded result of an attempted Skill Link, including its path and current status.
_Avoid_: Link config, target selection

**CLI Skill Directory**:
A local folder where a CLI tool discovers Skills.
_Avoid_: CLI directory, agent folder

**CLI Target Definition**:
A built-in or user-defined relative path template that a project can choose for Skill Links.
_Avoid_: Home directory rule, folder template

**CLI Target ID**:
The stable internal identifier for a CLI Target Definition.
_Avoid_: Directory name, display name

**Skills Manifest**:
The SQLite-backed store that records Managed Skills, Projects, Groups, CLI target selections, and project-scoped activation state.
_Avoid_: Lock file, config file, registry

**Remote Skill Source**:
The online skills.sh service used to browse and discover Skills.
_Avoid_: Remote cache, registry mirror

**Remote Skill Reference**:
The persisted source identity for an installed Skill so it can be updated later.
_Avoid_: Remote pointer, live link

**Skill ID**:
The stable internal identifier for an installed Skill, derived from its remote source type, source reference, and skill path.
_Avoid_: Display name, file name

**Managed Skill Directory Name**:
A readable local directory name derived from the Skill name and a short hash.
_Avoid_: Skill ID, display name

**Skill Source Client**:
The local adapter that queries the Remote Skill Source through the search, trending, hot, and all entry points.
_Avoid_: API client, fetch layer

**Paginated List**:
A page-based result list used for remote skill discovery.
_Avoid_: Infinite scroll, virtual feed

**Skill Group Registry**:
The SQLite-backed list of Skill Groups.
_Avoid_: Group cache, group links

**App Data Directory**:
The per-user application storage area where Skills Manager stores its registries and Managed Skills.
_Avoid_: Project directory, install directory

**Reconcile**:
The process that makes project-local Skill Links match the current project, skill, group, and CLI target selections.
_Avoid_: Sync, scan, refresh

**Update Check**:
The process that compares installed Managed Skills with their Remote Skill References to find available updates.
_Avoid_: Auto update, sync

**Skill Group**:
A reusable global definition of Skills that projects can attach and enable or disable.
_Avoid_: Bundle, collection, subscription

**Project CLI Target**:
A project-local CLI Skill Directory chosen from the CLI target definitions.
_Avoid_: Project CLI, project link target

**Project Target ID**:
The stable internal identifier for a project-local CLI target.
_Avoid_: Relative path, display name

**Agents Common Directory**:
The default project-local CLI Skill Directory seeded in CLI target definitions as `.agents/skills`.
_Avoid_: Common skills folder, default agent folder

## Relationships

- A **Managed Skill** is described by exactly one entry in the **Skills Manifest**.
- A **Managed Skill** can have zero or more **Skill Links**.
- A **Skill Link** points from exactly one **CLI Skill Directory** to exactly one **Managed Skill**.
- A **Skill Link State** records an actual Skill Link result, not a configuration source.
- A **Skill Link State** can be linked, missing, conflict, or failed.
- A **Skills Manifest** records Managed Skills and project-scoped activation state.
- A **Skill Group Registry** records Skill Groups independently from the Skills Manifest.
- The **App Data Directory** contains the Skills Manifest, Skill Group Registry, CLI target definitions, settings, and Managed Skills.
- The **Skills Manifest** is implemented as SQLite storage.
- The **Skills Manifest** is the source of truth for installed Skills and project-only activation state.
- All app package types use the same platform **App Data Directory**.
- The **Remote Skill Source** is not cached locally by default.
- A **Managed Skill** is installed as a local snapshot and also keeps a **Remote Skill Reference**.
- A **Managed Skill** keeps only the latest installed local snapshot.
- A **Skill ID** is derived from the remote source type, source reference, and skill path.
- A **Managed Skill Directory Name** combines a safe Skill name with a short hash to avoid name collisions.
- An **Update Check** runs on app startup and can also be triggered manually.
- The **Skill Source Client** exposes search, trending, hot, and all query capabilities.
- The remote skill discovery UI uses a **Paginated List**.
- A **Project** is the only activation boundary for a **Managed Skill**.
- A **Skill Group** contains one or more project-eligible **Skills**.
- A **Project** receives project-local **Skill Links** through its **Project CLI Targets**.
- The **Agents Common Directory** is seeded by default as a CLI target definition.
- A **Project CLI Target** is identified by a stable **Project Target ID**.
- A **Project** is a stored path reference, not an owned filesystem folder.
- Deletes are hard deletes for the owned Skills Manager records and managed symbolic links; deleting a **Skill** does not delete project folders.
- A **CLI Target Definition** contains the relative path where a project-local CLI discovers Skills.
- A **CLI Target Definition** is identified by a stable **CLI Target ID**.
- The core SQLite tables use uniqueness constraints to prevent duplicate identities and project assignments.
- A **Reconcile** runs on app startup and once per hour while the app is running.

## Example dialogue

> **Dev:** "When a user downloads a Skill, does it become active everywhere?"
> **Domain expert:** "No — download only stores a **Managed Skill** snapshot. It becomes active only when a **Project** enables it and selects a **Project CLI Target**."

## Flagged ambiguities

- "link" could mean a Windows `.lnk` shortcut, a copy, or a symlink — resolved: **Skill Link** means filesystem symbolic link.
- "symlink failure" could fall back to copy or `.lnk` — resolved: failed **Skill Links** are reported and never silently downgraded.
- "downloaded" could mean active in the filesystem — resolved: a **Managed Skill** download only stores a snapshot and does not create Skill Links.
- "project target" could mean an absolute path override — resolved: a **Project CLI Target** comes from relative CLI target definitions such as `.agents/skills` or `.codex/skills`.
- ".agent/skills" and ".agents/skills" have both appeared as CLI Skill Directory names — resolved: the canonical **Agents Common Directory** is `.agents/skills`.
- "group disable" could imply deleting project skills — resolved: disabling a **Skill Group** only changes project-scoped enablement and reconcile outcomes.
- "installed locally" could mean a live remote dependency — resolved: installation creates a local snapshot and keeps a separate **Remote Skill Reference** for future updates.

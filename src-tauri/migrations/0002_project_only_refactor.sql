PRAGMA foreign_keys = OFF;

CREATE TABLE projects (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (path)
);

CREATE TABLE project_skills (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, skill_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE project_groups (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, group_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES skill_groups(id) ON DELETE CASCADE
);

CREATE TABLE project_cli_targets (
  id TEXT PRIMARY KEY NOT NULL,
  project_id TEXT NOT NULL,
  cli_target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (project_id, cli_target_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (cli_target_id) REFERENCES cli_targets(id) ON DELETE CASCADE
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value)
VALUES ('auto_reconcile', 'true')
ON CONFLICT(key) DO NOTHING;

INSERT INTO settings (key, value)
VALUES
  ('launch_at_startup', 'false'),
  ('launch_as_admin', 'true'),
  ('silent_start', 'false')
ON CONFLICT(key) DO NOTHING;

CREATE TABLE cli_targets_project_only (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  is_common INTEGER NOT NULL DEFAULT 0 CHECK (is_common IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (relative_path)
);

INSERT OR IGNORE INTO projects (
  id,
  name,
  path,
  created_at,
  updated_at
)
SELECT
  id,
  name,
  path,
  created_at,
  updated_at
FROM project_roots
;

INSERT OR IGNORE INTO project_groups (
  id,
  project_id,
  group_id,
  enabled
)
SELECT
  'project-group-' || sgpr.project_root_id || '-' || sgpr.group_id,
  sgpr.project_root_id,
  sgpr.group_id,
  1
FROM skill_group_project_roots sgpr
JOIN projects p ON p.id = sgpr.project_root_id
JOIN skill_groups sg ON sg.id = sgpr.group_id
;

INSERT OR IGNORE INTO project_skills (
  id,
  project_id,
  skill_id,
  enabled
)
SELECT DISTINCT
  'project-skill-' || sgpr.project_root_id || '-' || sgs.skill_id,
  sgpr.project_root_id,
  sgs.skill_id,
  1
FROM skill_group_project_roots sgpr
JOIN skill_group_skills sgs ON sgs.group_id = sgpr.group_id
JOIN skills s ON s.id = sgs.skill_id
JOIN projects p ON p.id = sgpr.project_root_id
WHERE s.link_mode = 'project'
;

INSERT OR IGNORE INTO cli_targets_project_only (
  id,
  display_name,
  relative_path,
  is_common,
  created_at,
  updated_at
)
SELECT
  CASE
    WHEN id = 'agents' THEN 'agents-skills'
    ELSE id
  END,
  CASE
    WHEN id = 'agents' THEN 'Agents Skills'
    ELSE display_name
  END,
  TRIM(COALESCE(home_directory_name, '') || '/' || COALESCE(skills_subpath, ''), '/'),
  is_common,
  created_at,
  updated_at
FROM cli_targets
WHERE TRIM(COALESCE(home_directory_name, '') || '/' || COALESCE(skills_subpath, ''), '/') != ''
;

DROP TABLE cli_targets;
ALTER TABLE cli_targets_project_only RENAME TO cli_targets;

INSERT INTO cli_targets (id, display_name, relative_path, is_common)
VALUES
  ('agents-skills', 'Agents Skills', '.agents/skills', 1),
  ('claude-code-skills', 'Claude Code Skills', '.claude/skills', 1),
  ('codex-skills', 'Codex Skills', '.codex/skills', 1)
ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  relative_path = excluded.relative_path,
  is_common = excluded.is_common,
  updated_at = CURRENT_TIMESTAMP;

INSERT OR IGNORE INTO project_cli_targets (
  id,
  project_id,
  cli_target_id
)
SELECT DISTINCT
  'project-cli-target-' || sgpr.project_root_id || '-' || ct.id,
  sgpr.project_root_id,
  ct.id
FROM skill_group_project_roots sgpr
JOIN project_targets pt ON pt.group_id = sgpr.group_id
JOIN cli_targets ct ON ct.relative_path = pt.relative_path
JOIN projects p ON p.id = sgpr.project_root_id
;

CREATE TABLE skills_project_only (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_type TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  skill_path TEXT NOT NULL,
  managed_dir_name TEXT NOT NULL,
  installed_version TEXT,
  installed_hash TEXT,
  latest_version TEXT,
  latest_hash TEXT,
  update_available INTEGER NOT NULL DEFAULT 0 CHECK (update_available IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_update_check_at TEXT,
  UNIQUE (source_type, source_ref, skill_path)
);

INSERT INTO skills_project_only (
  id,
  name,
  description,
  source_type,
  source_ref,
  skill_path,
  managed_dir_name,
  installed_version,
  installed_hash,
  latest_version,
  latest_hash,
  update_available,
  created_at,
  updated_at,
  last_update_check_at
)
SELECT
  id,
  name,
  description,
  source_type,
  source_ref,
  skill_path,
  managed_dir_name,
  installed_version,
  installed_hash,
  latest_version,
  latest_hash,
  update_available,
  created_at,
  updated_at,
  last_update_check_at
FROM skills;

DROP TABLE skills;
ALTER TABLE skills_project_only RENAME TO skills;

DROP TABLE IF EXISTS skill_selected_targets;
DROP TABLE IF EXISTS custom_directories;
DROP TABLE IF EXISTS skill_group_project_roots;
DROP TABLE IF EXISTS project_roots;
DROP TABLE IF EXISTS project_targets;
DROP TABLE IF EXISTS skill_links;

CREATE INDEX IF NOT EXISTS idx_project_skills_project_id ON project_skills(project_id);
CREATE INDEX IF NOT EXISTS idx_project_skills_skill_id ON project_skills(skill_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_project_id ON project_groups(project_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_group_id ON project_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_project_cli_targets_project_id ON project_cli_targets(project_id);

PRAGMA foreign_keys = ON;

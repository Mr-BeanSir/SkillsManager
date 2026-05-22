PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS skills (
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
  link_mode TEXT NOT NULL CHECK (link_mode IN ('global', 'custom', 'project')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_update_check_at TEXT,
  UNIQUE (source_type, source_ref, skill_path)
);

CREATE TABLE IF NOT EXISTS skill_links (
  id TEXT PRIMARY KEY NOT NULL,
  skill_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('builtin', 'custom_directory', 'project_target')),
  target_id TEXT NOT NULL,
  target_path TEXT NOT NULL,
  link_path TEXT NOT NULL,
  managed_target_path TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('linked', 'missing', 'conflict', 'failed')),
  error_message TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checked_at TEXT,
  UNIQUE (skill_id, target_type, target_id, link_path),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skill_selected_targets (
  id TEXT PRIMARY KEY NOT NULL,
  skill_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('builtin', 'custom_directory')),
  target_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (skill_id, target_type, target_id),
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_directories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (path)
);

CREATE TABLE IF NOT EXISTS cli_targets (
  id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  home_directory_name TEXT NOT NULL,
  skills_subpath TEXT NOT NULL,
  is_common INTEGER NOT NULL DEFAULT 0 CHECK (is_common IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (home_directory_name)
);

CREATE TABLE IF NOT EXISTS skill_groups (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS project_roots (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (path)
);

CREATE TABLE IF NOT EXISTS skill_group_skills (
  group_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, skill_id),
  FOREIGN KEY (group_id) REFERENCES skill_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (skill_id) REFERENCES skills(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skill_group_project_roots (
  group_id TEXT NOT NULL,
  project_root_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, project_root_id),
  FOREIGN KEY (group_id) REFERENCES skill_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (project_root_id) REFERENCES project_roots(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS project_targets (
  id TEXT PRIMARY KEY NOT NULL,
  group_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('builtin', 'custom_project_path')),
  target_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (group_id, target_type, target_id, relative_path),
  FOREIGN KEY (group_id) REFERENCES skill_groups(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_skill_links_skill_id ON skill_links(skill_id);
CREATE INDEX IF NOT EXISTS idx_skill_links_target ON skill_links(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_skill_selected_targets_skill_id ON skill_selected_targets(skill_id);

INSERT INTO cli_targets (
  id,
  display_name,
  home_directory_name,
  skills_subpath,
  is_common
) VALUES (
  'agents',
  'Agents',
  '.agents',
  'skills',
  1
) ON CONFLICT(id) DO UPDATE SET
  display_name = excluded.display_name,
  home_directory_name = excluded.home_directory_name,
  skills_subpath = excluded.skills_subpath,
  is_common = excluded.is_common,
  updated_at = CURRENT_TIMESTAMP;

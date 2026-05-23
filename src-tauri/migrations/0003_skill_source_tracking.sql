ALTER TABLE project_skills ADD COLUMN source_origin TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE project_skills ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1));

CREATE INDEX IF NOT EXISTS idx_project_skills_hidden ON project_skills(project_id, hidden);

-- Ensure project-level deletes can cascade safely in Postgres.

ALTER TABLE designs
  DROP CONSTRAINT IF EXISTS designs_project_id_fkey,
  ADD CONSTRAINT designs_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_members
  DROP CONSTRAINT IF EXISTS project_members_project_id_fkey,
  ADD CONSTRAINT project_members_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE project_ruleset_policies
  DROP CONSTRAINT IF EXISTS project_ruleset_policies_project_id_fkey,
  ADD CONSTRAINT project_ruleset_policies_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE design_revisions
  DROP CONSTRAINT IF EXISTS design_revisions_design_id_fkey,
  ADD CONSTRAINT design_revisions_design_id_fkey
    FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE;

ALTER TABLE validation_runs
  DROP CONSTRAINT IF EXISTS validation_runs_revision_id_fkey,
  ADD CONSTRAINT validation_runs_revision_id_fkey
    FOREIGN KEY (revision_id) REFERENCES design_revisions(id) ON DELETE CASCADE;

ALTER TABLE exports
  DROP CONSTRAINT IF EXISTS exports_revision_id_fkey,
  ADD CONSTRAINT exports_revision_id_fkey
    FOREIGN KEY (revision_id) REFERENCES design_revisions(id) ON DELETE CASCADE;

ALTER TABLE quote_submissions
  DROP CONSTRAINT IF EXISTS quote_submissions_design_id_fkey,
  ADD CONSTRAINT quote_submissions_design_id_fkey
    FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE,
  DROP CONSTRAINT IF EXISTS quote_submissions_revision_id_fkey,
  ADD CONSTRAINT quote_submissions_revision_id_fkey
    FOREIGN KEY (revision_id) REFERENCES design_revisions(id) ON DELETE CASCADE;

ALTER TABLE audit_events
  DROP CONSTRAINT IF EXISTS audit_events_design_id_fkey,
  ADD CONSTRAINT audit_events_design_id_fkey
    FOREIGN KEY (design_id) REFERENCES designs(id) ON DELETE CASCADE;

ALTER TABLE project_library_overrides
  DROP CONSTRAINT IF EXISTS project_library_overrides_project_id_fkey,
  ADD CONSTRAINT project_library_overrides_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

ALTER TABLE artifact_manifests
  DROP CONSTRAINT IF EXISTS artifact_manifests_project_id_fkey,
  ADD CONSTRAINT artifact_manifests_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE;

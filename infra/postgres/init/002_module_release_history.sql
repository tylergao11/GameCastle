CREATE TABLE IF NOT EXISTS module_release_event (
  release_event_id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  module_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('promote', 'rollback')),
  previous_release_event_id TEXT REFERENCES module_release_event(release_event_id),
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (module_id, revision) REFERENCES module_revision(module_id, revision)
);

CREATE INDEX IF NOT EXISTS module_release_event_lookup_idx
  ON module_release_event(channel, module_id, created_at DESC, release_event_id DESC);

INSERT INTO schema_migration(version) VALUES ('002_module_release_history') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS module_candidate (
  candidate_id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('draft', 'verified', 'rejected')),
  source_debt_ids JSONB NOT NULL,
  candidate JSONB NOT NULL,
  candidate_sha256 CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_promotion_receipt (
  receipt_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES module_candidate(candidate_id),
  module_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved-local', 'approved-cloud', 'rejected')),
  receipt JSONB NOT NULL,
  receipt_sha256 CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS module_composition_plan (
  plan_id TEXT PRIMARY KEY,
  plan_sha256 CHAR(64) NOT NULL UNIQUE,
  fun_blueprint_selection JSONB,
  module_revision_refs JSONB NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned', 'executed', 'rolled-back')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migration(version) VALUES ('003_module_provenance_and_compositions') ON CONFLICT DO NOTHING;

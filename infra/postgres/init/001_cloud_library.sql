CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS schema_migration (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_family (
  family_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  style_id TEXT NOT NULL,
  semantic_tags JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS asset_revision (
  revision_id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES asset_family(family_id),
  sha256 CHAR(64) NOT NULL UNIQUE,
  object_key TEXT NOT NULL,
  metadata JSONB NOT NULL,
  provenance_receipt JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  withdrawn_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS module_revision (
  module_id TEXT NOT NULL,
  revision TEXT NOT NULL,
  manifest_sha256 CHAR(64) NOT NULL,
  manifest JSONB NOT NULL,
  origin_receipt JSONB NOT NULL,
  promotion_receipt JSONB NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (module_id, revision)
);

CREATE TABLE IF NOT EXISTS derivation_receipt (
  receipt_id TEXT PRIMARY KEY,
  output_revision_id TEXT NOT NULL REFERENCES asset_revision(revision_id),
  parent_revision_ids JSONB NOT NULL,
  workflow JSONB NOT NULL,
  model JSONB NOT NULL,
  input_sha256 JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_receipt (
  receipt_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS semantic_embedding (
  subject_id TEXT PRIMARY KEY,
  subject_kind TEXT NOT NULL,
  embedding vector,
  metadata JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schema_migration(version) VALUES ('001_cloud_library') ON CONFLICT DO NOTHING;

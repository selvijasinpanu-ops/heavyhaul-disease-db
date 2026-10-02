BEGIN;

CREATE TABLE IF NOT EXISTS public.schema_migration (
  migration_id integer NOT NULL,
  migration_name text NOT NULL,
  checksum_sha256 text NOT NULL,
  applied_at timestamptz DEFAULT now() NOT NULL,
  applied_by text DEFAULT current_user NOT NULL,
  execution_status text NOT NULL DEFAULT 'applied',
  execution_note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT schema_migration_pkey PRIMARY KEY (migration_id),
  CONSTRAINT schema_migration_name_key UNIQUE (migration_name),
  CONSTRAINT schema_migration_id_checksum_key UNIQUE (migration_id, checksum_sha256),
  CONSTRAINT schema_migration_status_check
    CHECK (execution_status IN ('applied','failed','skipped','superseded')),
  CONSTRAINT schema_migration_checksum_check
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS schema_migration_status_idx
  ON public.schema_migration(execution_status, applied_at DESC);

COMMIT;

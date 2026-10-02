BEGIN;

CREATE TABLE IF NOT EXISTS staging.media_anchor_candidate (
  anchor_candidate_id bigserial PRIMARY KEY,
  media_id bigint NOT NULL REFERENCES inspect.media_attachment(media_id) ON DELETE CASCADE,
  batch_id bigint REFERENCES staging.import_batch(batch_id) ON DELETE SET NULL,
  source_raw_id bigint REFERENCES staging.ulanmulun_b13_raw(raw_id) ON DELETE SET NULL,
  sheet_name text NOT NULL DEFAULT 'Sheet1',
  drawing_path text NOT NULL,
  anchor_sequence integer NOT NULL CHECK (anchor_sequence > 0),
  anchor_type text NOT NULL,
  anchor_row integer,
  anchor_column integer,
  to_row integer,
  to_column integer,
  relation_confidence text NOT NULL DEFAULT 'none',
  validation_status text NOT NULL DEFAULT 'needs_review'
    CHECK (validation_status IN ('pending','valid','invalid','needs_review')),
  validation_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (media_id, drawing_path, anchor_sequence)
);

CREATE INDEX IF NOT EXISTS media_anchor_candidate_batch_idx
  ON staging.media_anchor_candidate(batch_id);
CREATE INDEX IF NOT EXISTS media_anchor_candidate_raw_idx
  ON staging.media_anchor_candidate(source_raw_id);
CREATE INDEX IF NOT EXISTS media_anchor_candidate_media_idx
  ON staging.media_anchor_candidate(media_id);

COMMIT;

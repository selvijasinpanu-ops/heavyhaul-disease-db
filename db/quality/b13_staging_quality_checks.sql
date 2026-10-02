\pset pager off
\pset null '(null)'
\set ON_ERROR_STOP on

WITH batch AS (
  SELECT batch_id
  FROM staging.import_batch
  WHERE source_case_code = 'B-13'
    AND source_system = 'FIELD_SURVEY_XLSX'
  ORDER BY batch_id DESC
  LIMIT 1
),
expected_rows AS (
  SELECT generate_series(8, 431) AS row_no
),
raw AS (
  SELECT r.*
  FROM staging.ulanmulun_b13_raw r
  JOIN batch b ON b.batch_id = r.batch_id
),
media AS (
  SELECT m.*
  FROM inspect.media_attachment m
  JOIN batch b ON b.batch_id = m.batch_id
)
SELECT 'raw_row_count' AS check_name, count(*)::text AS check_value, (count(*) = 424) AS passed
FROM raw
UNION ALL
SELECT 'media_count', count(*)::text, (count(*) = 389)
FROM media
UNION ALL
SELECT 'missing_excel_rows', count(*)::text, (count(*) = 0)
FROM expected_rows e
LEFT JOIN raw r ON r.row_no = e.row_no
WHERE r.row_no IS NULL
UNION ALL
SELECT 'duplicate_source_rows', count(*)::text, (count(*) = 0)
FROM (
  SELECT sheet_name, row_no
  FROM raw
  GROUP BY sheet_name, row_no
  HAVING count(*) > 1
) dup
UNION ALL
SELECT 'missing_raw_payload', count(*)::text, (count(*) = 0)
FROM raw
WHERE raw_payload IS NULL OR raw_payload = '{}'::jsonb
UNION ALL
SELECT 'missing_raw_text', count(*)::text, (count(*) = 0)
FROM raw
WHERE coalesce(trim(raw_text), '') = ''
UNION ALL
SELECT 'unrecognized_location', count(*)::text, true
FROM raw
WHERE coalesce(trim(location_text), '') = ''
UNION ALL
SELECT 'multi_crack_candidate_revised', count(*)::text, true
FROM raw
WHERE raw_text ~ '[0-9]+[[:space:]]*[条道][^。；;[:space:]]*裂缝'
   OR raw_text ~ '共[[:space:]]*[2-9][[:space:]]*条'
   OR raw_text ~ '\m[LWD][2-9]\M'
   OR regexp_count(raw_text, '[0-9.]+[[:space:]]*(m|mm|米|毫米)[[:space:]]*[×xX*][[:space:]]*[0-9.]+[[:space:]]*(m|mm|米|毫米)', 1, 'i') >= 2
UNION ALL
SELECT 'contains_065m', count(*)::text, true
FROM raw
WHERE raw_text LIKE '%065m%'
UNION ALL
SELECT 'contains_038m2', count(*)::text, true
FROM raw
WHERE raw_text LIKE '%038m2%' OR raw_text LIKE '%038m²%'
UNION ALL
SELECT 'suspicious_6_8_10_mm_width', count(*)::text, true
FROM raw
WHERE raw_text ~* '\mW[12]?[[:space:]]*[=:：][[:space:]]*(6|8|10)[[:space:]]*(mm|毫米)\M'
   OR raw_text ~* '裂缝[^。；;[:space:]]{0,30}宽度[[:space:]]*[=:：]?[[:space:]]*(6|8|10)[[:space:]]*(mm|毫米)'
   OR raw_text ~* '[0-9.]+[[:space:]]*(m|米)[[:space:]]*[×xX*][[:space:]]*(6|8|10)[[:space:]]*(mm|毫米)'
UNION ALL
SELECT 'contains_unseen', count(*)::text, true
FROM raw
WHERE raw_text LIKE '%未见%'
UNION ALL
SELECT 'contains_repaired', count(*)::text, true
FROM raw
WHERE raw_text LIKE '%已修补%'
UNION ALL
SELECT 'contains_recracking_after_repair', count(*)::text, true
FROM raw
WHERE raw_text LIKE '%修补后开裂%' OR raw_text LIKE '%修补后再次开裂%' OR raw_text LIKE '%再次开裂%' OR raw_text LIKE '%复裂%'
UNION ALL
SELECT 'drawing_anchor_candidates', count(*)::text, (count(*) > 0)
FROM staging.media_anchor_candidate a JOIN batch b ON b.batch_id = a.batch_id
UNION ALL
SELECT 'media_with_multiple_anchors', count(*)::text, (count(*) > 0)
FROM (
  SELECT media_id FROM staging.media_anchor_candidate a JOIN batch b ON b.batch_id = a.batch_id
  GROUP BY media_id HAVING count(*) > 1
) multi_anchor
UNION ALL
SELECT 'no_photo_ref_but_anchor_media', count(*)::text, true
FROM raw r
WHERE coalesce(trim(photo_ref), '') = ''
  AND EXISTS (
    SELECT 1
    FROM staging.media_anchor_candidate a
    WHERE a.batch_id = r.batch_id AND a.anchor_row = r.row_no
  )
UNION ALL
SELECT 'photo_ref_without_anchor_media', count(*)::text, true
FROM raw r
WHERE coalesce(trim(photo_ref), '') <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM staging.media_anchor_candidate a
    WHERE a.batch_id = r.batch_id AND a.anchor_row = r.row_no
  )
UNION ALL
SELECT 'formal_business_rows', (
  (SELECT count(*) FROM inspect.disease_case) || ',' ||
  (SELECT count(*) FROM inspect.observation_value) || ',' ||
  (SELECT count(*) FROM analysis.evaluation_result) || ',' ||
  (SELECT count(*) FROM maintenance.work_order)
)::text, (
  (SELECT count(*) FROM inspect.disease_case) = 0 AND
  (SELECT count(*) FROM inspect.observation_value) = 0 AND
  (SELECT count(*) FROM analysis.evaluation_result) = 0 AND
  (SELECT count(*) FROM maintenance.work_order) = 0
);

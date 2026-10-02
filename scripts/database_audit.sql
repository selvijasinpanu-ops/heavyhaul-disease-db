\pset pager off
\pset null '(null)'
\set ON_ERROR_STOP on

\echo '## runtime'
SELECT current_database(), current_user, version();

\echo '## postgis'
SELECT postgis_full_version();

\echo '## project_config'
SELECT project_name, subject_name, db_version, projected_srid, railway_crs_note, file_storage_root
FROM base.project_config
WHERE id = true;

\echo '## schemas_and_tables'
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema IN ('base','dict','inspect','response','standard','analysis','staging')
ORDER BY table_schema, table_name;

\echo '## dictionary_acceptance'
SELECT *
FROM analysis.dictionary_acceptance;

\echo '## disease_type_by_domain'
SELECT disease_domain, count(*) AS disease_type_count
FROM dict.disease_type
GROUP BY disease_domain
ORDER BY disease_domain;

\echo '## indicator_count'
SELECT count(*) AS indicator_count
FROM dict.indicator;

\echo '## business_row_counts'
SELECT
    (SELECT count(*) FROM base.railway_line) AS line_count,
    (SELECT count(*) FROM base.route_segment) AS segment_count,
    (SELECT count(*) FROM base.curve_section) AS curve_count,
    (SELECT count(*) FROM base.bridge) AS bridge_count,
    (SELECT count(*) FROM base.bridge_span) AS bridge_span_count,
    (SELECT count(*) FROM base.component) AS component_count,
    (SELECT count(*) FROM inspect.inspection_event) AS event_count,
    (SELECT count(*) FROM inspect.disease_case) AS case_count,
    (SELECT count(*) FROM inspect.observation_value) AS observation_count,
    (SELECT count(*) FROM inspect.maintenance_event) AS maintenance_count,
    (SELECT count(*) FROM response.sensor_file) AS sensor_file_count;

\echo '## geometry_columns'
SELECT
    f_table_schema,
    f_table_name,
    f_geometry_column,
    coord_dimension,
    srid,
    type
FROM geometry_columns
WHERE f_table_schema IN ('base','inspect')
ORDER BY f_table_schema, f_table_name;

\echo '## tables_without_primary_key'
SELECT table_schema, table_name
FROM information_schema.tables t
WHERE table_schema IN ('base','dict','inspect','response','standard','analysis','staging')
  AND table_type = 'BASE TABLE'
  AND NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints c
      WHERE c.table_schema = t.table_schema
        AND c.table_name = t.table_name
        AND c.constraint_type = 'PRIMARY KEY'
  )
ORDER BY table_schema, table_name;

\echo '## id_columns_without_foreign_key'
WITH id_columns AS (
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema IN ('base','dict','inspect','response','standard','staging')
      AND column_name LIKE '%\_id' ESCAPE '\'
      AND column_name NOT IN ('id')
      AND column_name NOT IN (
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_schema = tc.constraint_schema
           AND kcu.constraint_name = tc.constraint_name
           AND kcu.table_schema = tc.table_schema
           AND kcu.table_name = tc.table_name
          WHERE tc.constraint_type = 'PRIMARY KEY'
      )
)
SELECT table_schema, table_name, column_name
FROM id_columns c
WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_schema = tc.constraint_schema
     AND kcu.constraint_name = tc.constraint_name
     AND kcu.table_schema = tc.table_schema
     AND kcu.table_name = tc.table_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND kcu.table_schema = c.table_schema
      AND kcu.table_name = c.table_name
      AND kcu.column_name = c.column_name
)
ORDER BY table_schema, table_name, column_name;

\echo '## geometry_tables_without_gist_index'
WITH geom_cols AS (
    SELECT f_table_schema AS schemaname, f_table_name AS tablename, f_geometry_column AS geom_column
    FROM geometry_columns
    WHERE f_table_schema IN ('base','inspect')
)
SELECT schemaname, tablename, geom_column
FROM geom_cols g
WHERE NOT EXISTS (
    SELECT 1
    FROM pg_indexes i
    WHERE i.schemaname = g.schemaname
      AND i.tablename = g.tablename
      AND i.indexdef ILIKE '%USING gist%'
      AND i.indexdef ILIKE '%' || g.geom_column || '%'
)
ORDER BY schemaname, tablename;

\echo '## duplicate_disease_type_code'
SELECT type_code, count(*) AS duplicate_count
FROM dict.disease_type
GROUP BY type_code
HAVING count(*) > 1;

\echo '## duplicate_indicator_code'
SELECT indicator_code, count(*) AS duplicate_count
FROM dict.indicator
GROUP BY indicator_code
HAVING count(*) > 1;

\echo '## indicators_missing_required_metadata'
SELECT indicator_code, standard_name, disease_type_code, unit, value_kind, required_level, trend_direction
FROM dict.indicator
WHERE standard_name IS NULL
   OR disease_type_code IS NULL
   OR unit IS NULL
   OR value_kind IS NULL
   OR required_level IS NULL
   OR trend_direction IS NULL
ORDER BY indicator_code;

\echo '## mandatory_disease_types_without_indicators'
SELECT dt.type_code, dt.standard_name, dt.disease_domain
FROM dict.disease_type dt
LEFT JOIN dict.indicator i ON i.disease_type_code = dt.type_code
WHERE dt.mandatory_flag = true
GROUP BY dt.type_code, dt.standard_name, dt.disease_domain
HAVING count(i.indicator_id) = 0
ORDER BY dt.type_code;

\echo '## orphan_observation_indicators'
SELECT ov.observation_id, ov.indicator_code
FROM inspect.observation_value ov
LEFT JOIN dict.indicator i ON i.indicator_code = ov.indicator_code
WHERE i.indicator_code IS NULL
ORDER BY ov.observation_id;

\echo '## inapplicable_observations_with_values'
SELECT observation_id, event_id, case_id, indicator_code, raw_value, text_value
FROM inspect.observation_value
WHERE applicable_flag = false
  AND (raw_value IS NOT NULL OR text_value IS NOT NULL)
ORDER BY observation_id;

\echo '## invalid_chainage_ranges'
SELECT 'base.route_segment' AS table_name, segment_code AS record_code, start_chainage_m, end_chainage_m
FROM base.route_segment
WHERE start_chainage_m IS NOT NULL AND end_chainage_m IS NOT NULL AND start_chainage_m >= end_chainage_m
UNION ALL
SELECT 'base.curve_section', curve_code, start_chainage_m, end_chainage_m
FROM base.curve_section
WHERE start_chainage_m IS NOT NULL AND end_chainage_m IS NOT NULL AND start_chainage_m >= end_chainage_m
UNION ALL
SELECT 'base.bridge', bridge_code, start_chainage_m, end_chainage_m
FROM base.bridge
WHERE start_chainage_m IS NOT NULL AND end_chainage_m IS NOT NULL AND start_chainage_m > end_chainage_m
UNION ALL
SELECT 'inspect.disease_case', case_code, start_chainage_m, end_chainage_m
FROM inspect.disease_case
WHERE start_chainage_m IS NOT NULL AND end_chainage_m IS NOT NULL AND start_chainage_m > end_chainage_m
ORDER BY table_name, record_code;

\echo '## geometry_srid_summary'
WITH defs AS (
    SELECT f_table_schema AS table_schema, f_table_name AS table_name, srid AS declared_srid
    FROM geometry_columns
    WHERE f_table_schema IN ('base','inspect')
),
actuals AS (
    SELECT 'base' AS table_schema, 'railway_line' AS table_name, ST_SRID(geom) AS actual_srid, count(*) AS feature_count FROM base.railway_line WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
    UNION ALL SELECT 'base','route_segment',ST_SRID(geom),count(*) FROM base.route_segment WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
    UNION ALL SELECT 'base','curve_section',ST_SRID(geom),count(*) FROM base.curve_section WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
    UNION ALL SELECT 'base','bridge',ST_SRID(geom),count(*) FROM base.bridge WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
    UNION ALL SELECT 'base','bridge_span',ST_SRID(geom),count(*) FROM base.bridge_span WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
    UNION ALL SELECT 'base','component',ST_SRID(geom),count(*) FROM base.component WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
    UNION ALL SELECT 'inspect','disease_case',ST_SRID(geom),count(*) FROM inspect.disease_case WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
    UNION ALL SELECT 'inspect','maintenance_event',ST_SRID(geom),count(*) FROM inspect.maintenance_event WHERE geom IS NOT NULL GROUP BY ST_SRID(geom)
)
SELECT d.table_schema, d.table_name, d.declared_srid, a.actual_srid, coalesce(a.feature_count, 0) AS feature_count
FROM defs d
LEFT JOIN actuals a
  ON a.table_schema = d.table_schema
 AND a.table_name = d.table_name
ORDER BY d.table_schema, d.table_name, a.actual_srid;

\echo '## thresholds_missing_traceability'
SELECT threshold_id, indicator_code, document_id, clause_no, threshold_type, verification_status
FROM standard.indicator_threshold
WHERE document_id IS NULL
   OR clause_no IS NULL
   OR verification_status IS NULL
ORDER BY threshold_id;

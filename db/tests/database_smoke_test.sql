\pset pager off
\pset null '(null)'
\set ON_ERROR_STOP on

SELECT current_database() AS database_name, current_user AS user_name;
SELECT postgis_lib_version() AS postgis_version;

SELECT *
FROM analysis.dictionary_acceptance;

SELECT table_schema, count(*) AS object_count
FROM information_schema.tables
WHERE table_schema IN ('base','dict','inspect','response','standard','analysis','staging')
GROUP BY table_schema
ORDER BY table_schema;

SELECT f_table_schema, f_table_name, f_geometry_column, coord_dimension, srid, type
FROM geometry_columns
WHERE f_table_schema IN ('base','inspect')
ORDER BY f_table_schema, f_table_name;

SELECT count(*) AS mandatory_disease_without_indicator_count
FROM dict.disease_type dt
LEFT JOIN dict.indicator i ON i.disease_type_code = dt.type_code
WHERE dt.mandatory_flag = true
GROUP BY dt.mandatory_flag
HAVING count(i.indicator_id) = 0;

SELECT
  (SELECT count(*) FROM dict.indicator) AS indicator_count,
  (SELECT count(*) FROM dict.disease_indicator) AS disease_indicator_count,
  (SELECT mandatory_without_primary_indicator_count FROM analysis.dictionary_acceptance) AS mandatory_without_primary_indicator_count;

SELECT schema_name, object_name, exists_flag
FROM (
  VALUES
    ('dict','disease_indicator', to_regclass('dict.disease_indicator') IS NOT NULL),
    ('standard','threshold_rule', to_regclass('standard.threshold_rule') IS NOT NULL),
    ('standard','threshold_band', to_regclass('standard.threshold_band') IS NOT NULL),
    ('standard','grade_mapping', to_regclass('standard.grade_mapping') IS NOT NULL),
    ('standard','coupling_rule', to_regclass('standard.coupling_rule') IS NOT NULL),
    ('staging','ulanmulun_b13_raw', to_regclass('staging.ulanmulun_b13_raw') IS NOT NULL),
    ('inspect','crack_detail', to_regclass('inspect.crack_detail') IS NOT NULL),
    ('inspect','media_attachment', to_regclass('inspect.media_attachment') IS NOT NULL),
    ('inspect','case_attachment', to_regclass('inspect.case_attachment') IS NOT NULL),
    ('analysis','evaluation_result', to_regclass('analysis.evaluation_result') IS NOT NULL),
    ('maintenance','work_order', to_regclass('maintenance.work_order') IS NOT NULL)
) AS checks(schema_name, object_name, exists_flag)
WHERE exists_flag = false;

SELECT count(*) AS unsafe_verified_research_rule_count
FROM standard.threshold_rule
WHERE decision_authority = 'RESEARCH_ONLY'
  AND (can_trigger_speed_restriction = true OR manual_review_required = false);

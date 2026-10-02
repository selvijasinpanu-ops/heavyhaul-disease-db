BEGIN;

CREATE SCHEMA IF NOT EXISTS maintenance;

ALTER TABLE standard.source_document
  ADD COLUMN IF NOT EXISTS source_level text,
  ADD COLUMN IF NOT EXISTS decision_authority text DEFAULT 'PENDING' NOT NULL,
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending' NOT NULL,
  ADD COLUMN IF NOT EXISTS can_trigger_speed_restriction boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS manual_review_required boolean DEFAULT true NOT NULL,
  ADD COLUMN IF NOT EXISTS effective_date date,
  ADD COLUMN IF NOT EXISTS retired_date date,
  ADD COLUMN IF NOT EXISTS storage_uri text;

ALTER TABLE standard.source_document
  DROP CONSTRAINT IF EXISTS source_document_source_level_check,
  DROP CONSTRAINT IF EXISTS source_document_decision_authority_check,
  DROP CONSTRAINT IF EXISTS source_document_verification_status_v2_check,
  ADD CONSTRAINT source_document_source_level_check
    CHECK (source_level IS NULL OR source_level IN ('A','B','C','D')),
  ADD CONSTRAINT source_document_decision_authority_check
    CHECK (decision_authority IN ('STANDARD','ENTERPRISE','RESEARCH_ONLY','PENDING')),
  ADD CONSTRAINT source_document_verification_status_v2_check
    CHECK (verification_status IN ('pending','verified','rejected','superseded'));

UPDATE dict.disease_type
SET standard_name = v.standard_name,
    description = v.description,
    sort_order = v.sort_order
FROM (VALUES
  ('T01','钢轨侧磨','侧磨、异常侧磨及相关轮轨接触磨耗。',101),
  ('T02','垂向磨耗及塑性变形','钢轨垂向磨耗、压溃、肥边及塑性变形。',102),
  ('T03','钢轨波磨','短波、长波及周期性波磨发展。',103),
  ('T04','滚动接触疲劳与钢轨伤损','鱼鳞裂纹、剥离、掉块、擦伤、核伤等钢轨伤损。',104),
  ('T05','轨道几何不平顺','轨距、轨向、高低、水平、三角坑等几何状态异常。',105),
  ('T06','超高状态','小半径曲线欠超高、过超高及超高顺坡异常。',106),
  ('T07','扣件系统病害','扣件松动、缺失、锈蚀、轨距块和垫板失效。',107),
  ('T08','轨枕病害','轨枕裂损、失效、空吊、位移及承轨槽异常。',108),
  ('T09','道床及轨排病害','道床翻浆、板结、缺砟、污染、轨排横移及排水异常。',109),
  ('B01','梁体裂缝','梁体纵向、横向、斜向、腹板和翼缘裂缝。',201),
  ('B02','材料劣化、锈胀、剥落及露筋','混凝土劣化、锈胀、掉块、剥落、露筋及钢构件腐蚀。',202),
  ('B03','梁体变形','梁体挠度、扭转、横向位移及异常变形。',203),
  ('B04','支座、支承垫石及限位装置病害','支座位移、不密贴、老化，垫石开裂及限位装置异常。',204),
  ('B05','墩台和基础病害','墩台裂缝、倾斜、沉降、冲刷及基础异常。',205),
  ('B06','桥面、钢结构及附属设施病害','桥面系、排水、栏杆、吊篮、检查设施、钢结构及附属设施病害。',206),
  ('C01','桥轨空间协调、线梁偏心及相对位移','线梁偏心、梁轨相对位移、轨排横移及桥上轨道空间协调异常。',301),
  ('C02','桥头过渡段差异沉降和几何突变','桥头错台、过渡段差异沉降、刚度突变和几何突变。',302)
) AS v(type_code, standard_name, description, sort_order)
WHERE dict.disease_type.type_code = v.type_code;

INSERT INTO dict.disease_alias (type_code, source_name, source_note)
VALUES
  ('T02','垂向磨耗','指南V1.1强制分类'),
  ('T02','塑性变形','指南V1.1强制分类'),
  ('T03','钢轨波磨','指南V1.1强制分类'),
  ('T09','轨排病害','指南V1.1强制分类'),
  ('B02','锈胀','指南V1.1强制分类'),
  ('B02','剥落','指南V1.1强制分类'),
  ('B02','露筋','指南V1.1强制分类'),
  ('B04','支承垫石病害','指南V1.1强制分类'),
  ('B04','限位装置病害','指南V1.1强制分类'),
  ('B06','桥面病害','指南V1.1强制分类'),
  ('B06','附属设施病害','指南V1.1强制分类'),
  ('C01','桥轨空间协调异常','指南V1.1强制分类'),
  ('C01','线梁偏心','指南V1.1强制分类'),
  ('C02','过渡段差异沉降','指南V1.1强制分类'),
  ('C02','几何突变','指南V1.1强制分类')
ON CONFLICT (type_code, source_name) DO UPDATE
SET source_note = EXCLUDED.source_note;

ALTER TABLE dict.indicator
  ADD COLUMN IF NOT EXISTS data_type text DEFAULT 'numeric' NOT NULL,
  ADD COLUMN IF NOT EXISTS measurement_method text,
  ADD COLUMN IF NOT EXISTS source_status text DEFAULT 'project_defined' NOT NULL,
  ADD COLUMN IF NOT EXISTS source_level text,
  ADD COLUMN IF NOT EXISTS decision_authority text DEFAULT 'RESEARCH_ONLY' NOT NULL,
  ADD COLUMN IF NOT EXISTS verification_status text DEFAULT 'pending' NOT NULL;

ALTER TABLE dict.indicator
  DROP CONSTRAINT IF EXISTS indicator_data_type_check,
  DROP CONSTRAINT IF EXISTS indicator_source_status_check,
  DROP CONSTRAINT IF EXISTS indicator_source_level_check,
  DROP CONSTRAINT IF EXISTS indicator_decision_authority_check,
  DROP CONSTRAINT IF EXISTS indicator_verification_status_v2_check,
  ADD CONSTRAINT indicator_data_type_check
    CHECK (data_type IN ('numeric','text','boolean','json')),
  ADD CONSTRAINT indicator_source_status_check
    CHECK (source_status IN ('standard_verified','enterprise_verified','literature_pending','project_defined')),
  ADD CONSTRAINT indicator_source_level_check
    CHECK (source_level IS NULL OR source_level IN ('A','B','C','D')),
  ADD CONSTRAINT indicator_decision_authority_check
    CHECK (decision_authority IN ('STANDARD','ENTERPRISE','RESEARCH_ONLY','PENDING')),
  ADD CONSTRAINT indicator_verification_status_v2_check
    CHECK (verification_status IN ('pending','verified','rejected','superseded'));

INSERT INTO dict.indicator
  (indicator_code, disease_type_code, standard_name, source_name, unit, decimal_scale, value_kind,
   required_level, trend_direction, definition, data_type, measurement_method, source_status,
   source_level, decision_authority, verification_status)
VALUES
  ('T01_SIDE_WEAR_MM','T01','钢轨侧磨量','指南V1.1指标框架','mm',2,'raw','required','higher','钢轨侧面磨耗测值。','numeric','现场量测或轨检/廓形检测','project_defined','D','RESEARCH_ONLY','pending'),
  ('T02_VERTICAL_WEAR_MM','T02','钢轨垂向磨耗量','指南V1.1指标框架','mm',2,'raw','required','higher','钢轨顶面垂向磨耗测值。','numeric','现场量测或廓形检测','project_defined','D','RESEARCH_ONLY','pending'),
  ('T02_PLASTIC_DEFORMATION_MM','T02','塑性变形量','指南V1.1指标框架','mm',2,'raw','conditional','higher','压溃、肥边等塑性变形量。','numeric','现场量测或图像核验','project_defined','D','RESEARCH_ONLY','pending'),
  ('T03_CORRUGATION_DEPTH_MM','T03','波磨波深','指南V1.1指标框架','mm',3,'raw','required','higher','钢轨波磨波深。','numeric','波磨检测或人工量测','project_defined','D','RESEARCH_ONLY','pending'),
  ('T03_CORRUGATION_WAVELENGTH_MM','T03','波磨波长','指南V1.1指标框架','mm',1,'raw','conditional','bidirectional','钢轨波磨主波长。','numeric','波磨检测','project_defined','D','RESEARCH_ONLY','pending'),
  ('T04_DAMAGE_LENGTH_M','T04','钢轨伤损长度','指南V1.1指标框架','m',3,'raw','required','higher','滚动接触疲劳、剥离、掉块或裂纹影响长度。','numeric','探伤、人工检查或图像核验','project_defined','D','RESEARCH_ONLY','pending'),
  ('T05_GAUGE_DEVIATION_MM','T05','轨距偏差','指南V1.1指标框架','mm',2,'raw','required','bidirectional','轨距相对设计值偏差。','numeric','轨检车或人工轨距尺','project_defined','D','RESEARCH_ONLY','pending'),
  ('T05_ALIGNMENT_DEVIATION_MM','T05','轨向偏差','指南V1.1指标框架','mm',2,'raw','conditional','bidirectional','轨道平面方向偏差。','numeric','轨检车或弦测','project_defined','D','RESEARCH_ONLY','pending'),
  ('T06_SUPERELEVATION_DEVIATION_MM','T06','超高偏差','指南V1.1指标框架','mm',2,'raw','required','bidirectional','实测超高与目标超高差值。','numeric','轨检车或水准测量','project_defined','D','RESEARCH_ONLY','pending'),
  ('T07_FASTENER_DEFECT_COUNT','T07','扣件缺陷数量','指南V1.1指标框架','处',0,'raw','required','higher','松动、缺失、失效扣件数量。','numeric','人工巡检或图像识别','project_defined','D','RESEARCH_ONLY','pending'),
  ('T08_SLEEPER_DAMAGE_COUNT','T08','轨枕病害数量','指南V1.1指标框架','根',0,'raw','required','higher','裂损、失效、空吊等轨枕数量。','numeric','人工巡检或图像识别','project_defined','D','RESEARCH_ONLY','pending'),
  ('T09_BALLAST_BED_DEFECT_AREA_M2','T09','道床及轨排病害面积','指南V1.1指标框架','m2',3,'raw','required','higher','翻浆、缺砟、污染或轨排相关病害影响面积。','numeric','人工量测或图像核验','project_defined','D','RESEARCH_ONLY','pending'),
  ('B01_CRACK_WIDTH_MM','B01','裂缝宽度','指南V1.1指标框架','mm',3,'raw','required','higher','梁体裂缝最大或代表宽度。','numeric','裂缝尺、显微镜或现场调查表','project_defined','D','RESEARCH_ONLY','pending'),
  ('B01_CRACK_LENGTH_M','B01','裂缝长度','指南V1.1指标框架','m',3,'raw','conditional','higher','梁体裂缝长度。','numeric','现场量测或调查表解析','project_defined','D','RESEARCH_ONLY','pending'),
  ('B01_CRACK_DEPTH_MM','B01','裂缝深度','指南V1.1指标框架','mm',2,'raw','conditional','higher','梁体裂缝深度。','numeric','裂缝深度仪或调查表解析','project_defined','D','RESEARCH_ONLY','pending'),
  ('B02_SPALLING_AREA_M2','B02','剥落掉块面积','指南V1.1指标框架','m2',3,'raw','required','higher','混凝土剥落、掉块或锈胀露筋影响面积。','numeric','现场量测或调查表解析','project_defined','D','RESEARCH_ONLY','pending'),
  ('B02_REBAR_EXPOSURE_AREA_M2','B02','露筋面积','指南V1.1指标框架','m2',3,'raw','conditional','higher','露筋或锈胀露筋影响面积。','numeric','现场量测或图像核验','project_defined','D','RESEARCH_ONLY','pending'),
  ('B03_DEFLECTION_MM','B03','梁体变形量','指南V1.1指标框架','mm',2,'raw','required','higher','挠度、扭转或横向位移的代表变形量。','numeric','水准、全站仪或位移监测','project_defined','D','RESEARCH_ONLY','pending'),
  ('B04_BEARING_DISPLACEMENT_MM','B04','支座位移','指南V1.1指标框架','mm',2,'raw','required','higher','支座纵向或横向位移量。','numeric','现场量测','project_defined','D','RESEARCH_ONLY','pending'),
  ('B04_BEARING_GAP_MM','B04','支座不密贴间隙','指南V1.1指标框架','mm',2,'raw','conditional','higher','支座、垫石或梁底不密贴间隙。','numeric','塞尺或现场量测','project_defined','D','RESEARCH_ONLY','pending'),
  ('B05_PIER_CRACK_WIDTH_MM','B05','墩台裂缝宽度','指南V1.1指标框架','mm',3,'raw','required','higher','墩台、墩帽或基础裂缝宽度。','numeric','裂缝尺或现场调查表','project_defined','D','RESEARCH_ONLY','pending'),
  ('B05_FOUNDATION_SETTLEMENT_MM','B05','墩台基础沉降量','指南V1.1指标框架','mm',2,'raw','conditional','higher','墩台或基础沉降、冲刷相关位移量。','numeric','水准或沉降监测','project_defined','D','RESEARCH_ONLY','pending'),
  ('B06_AUXILIARY_DEFECT_COUNT','B06','附属设施病害数量','指南V1.1指标框架','处',0,'raw','required','higher','桥面、栏杆、吊篮、检查梯、防护及排水设施病害数量。','numeric','人工巡检或图像核验','project_defined','D','RESEARCH_ONLY','pending'),
  ('C01_TRACK_BEAM_OFFSET_MM','C01','线梁偏心量','指南V1.1指标框架','mm',2,'raw','required','higher','线路中心与梁体中心偏离量。','numeric','线路与桥梁几何联测','project_defined','D','RESEARCH_ONLY','pending'),
  ('C01_RELATIVE_DISPLACEMENT_MM','C01','梁轨相对位移','指南V1.1指标框架','mm',2,'raw','conditional','higher','梁体与轨道结构之间的相对位移量。','numeric','位移监测或几何联测','project_defined','D','RESEARCH_ONLY','pending'),
  ('C02_TRANSITION_SETTLEMENT_MM','C02','过渡段差异沉降','指南V1.1指标框架','mm',2,'raw','required','higher','桥头过渡段沉降差。','numeric','水准或轨检数据','project_defined','D','RESEARCH_ONLY','pending'),
  ('C02_GEOMETRY_MUTATION_MM','C02','桥头几何突变量','指南V1.1指标框架','mm',2,'raw','conditional','higher','桥头位置高低、轨向或水平突变量。','numeric','轨检车或人工复测','project_defined','D','RESEARCH_ONLY','pending')
ON CONFLICT (indicator_code) DO UPDATE
SET disease_type_code = EXCLUDED.disease_type_code,
    standard_name = EXCLUDED.standard_name,
    source_name = EXCLUDED.source_name,
    unit = EXCLUDED.unit,
    decimal_scale = EXCLUDED.decimal_scale,
    value_kind = EXCLUDED.value_kind,
    required_level = EXCLUDED.required_level,
    trend_direction = EXCLUDED.trend_direction,
    definition = EXCLUDED.definition,
    data_type = EXCLUDED.data_type,
    measurement_method = EXCLUDED.measurement_method,
    source_status = EXCLUDED.source_status,
    source_level = EXCLUDED.source_level,
    decision_authority = EXCLUDED.decision_authority,
    verification_status = EXCLUDED.verification_status;

CREATE TABLE IF NOT EXISTS dict.disease_indicator (
  disease_indicator_id bigserial PRIMARY KEY,
  type_code text NOT NULL REFERENCES dict.disease_type(type_code) ON DELETE CASCADE,
  indicator_code text NOT NULL REFERENCES dict.indicator(indicator_code) ON DELETE CASCADE,
  relation_role text DEFAULT 'primary' NOT NULL CHECK (relation_role IN ('primary','secondary','screening','response')),
  required_level text DEFAULT 'required' NOT NULL CHECK (required_level IN ('required','conditional','optional')),
  measurement_method text,
  source_status text DEFAULT 'project_defined' NOT NULL CHECK (source_status IN ('standard_verified','enterprise_verified','literature_pending','project_defined')),
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (type_code, indicator_code)
);

INSERT INTO dict.disease_indicator (type_code, indicator_code, relation_role, required_level, measurement_method, source_status, note)
SELECT disease_type_code, indicator_code,
       CASE WHEN required_level = 'required' THEN 'primary' ELSE 'secondary' END,
       required_level, measurement_method, source_status, '指南V1.1主控/条件指标'
FROM dict.indicator
WHERE disease_type_code IS NOT NULL
ON CONFLICT (type_code, indicator_code) DO UPDATE
SET relation_role = EXCLUDED.relation_role,
    required_level = EXCLUDED.required_level,
    measurement_method = EXCLUDED.measurement_method,
    source_status = EXCLUDED.source_status,
    note = EXCLUDED.note;

CREATE INDEX IF NOT EXISTS disease_indicator_type_idx ON dict.disease_indicator(type_code);
CREATE INDEX IF NOT EXISTS disease_indicator_indicator_idx ON dict.disease_indicator(indicator_code);

CREATE TABLE IF NOT EXISTS standard.threshold_rule (
  rule_id bigserial PRIMARY KEY,
  rule_code text NOT NULL UNIQUE,
  indicator_code text NOT NULL REFERENCES dict.indicator(indicator_code) ON DELETE RESTRICT,
  disease_type_code text REFERENCES dict.disease_type(type_code) ON DELETE SET NULL,
  document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  clause_no text,
  rule_name text NOT NULL,
  comparison_direction text NOT NULL CHECK (comparison_direction IN ('higher_worse','lower_worse','range','boolean','combined')),
  scope_condition jsonb DEFAULT '{}'::jsonb NOT NULL,
  value_unit text,
  decision_authority text DEFAULT 'PENDING' NOT NULL CHECK (decision_authority IN ('STANDARD','ENTERPRISE','RESEARCH_ONLY','PENDING')),
  verification_status text DEFAULT 'pending' NOT NULL CHECK (verification_status IN ('pending','verified','rejected','superseded')),
  can_trigger_speed_restriction boolean DEFAULT false NOT NULL,
  manual_review_required boolean DEFAULT true NOT NULL,
  version_label text,
  effective_date date,
  retired_date date,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS standard.threshold_band (
  band_id bigserial PRIMARY KEY,
  rule_id bigint NOT NULL REFERENCES standard.threshold_rule(rule_id) ON DELETE CASCADE,
  band_code text NOT NULL,
  native_grade text,
  unified_level text CHECK (unified_level IS NULL OR unified_level IN ('I','II','III','IV','V')),
  lower_bound numeric,
  upper_bound numeric,
  include_lower boolean DEFAULT true NOT NULL,
  include_upper boolean DEFAULT false NOT NULL,
  band_label text,
  action_requirement text,
  recommended_deadline_days integer CHECK (recommended_deadline_days IS NULL OR recommended_deadline_days >= 0),
  manual_review_required boolean DEFAULT true NOT NULL,
  note text,
  UNIQUE (rule_id, band_code),
  CHECK (lower_bound IS NULL OR upper_bound IS NULL OR upper_bound >= lower_bound)
);

CREATE TABLE IF NOT EXISTS standard.grade_mapping (
  mapping_id bigserial PRIMARY KEY,
  mapping_code text NOT NULL UNIQUE,
  source_document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  native_grade text NOT NULL,
  unified_level text NOT NULL CHECK (unified_level IN ('I','II','III','IV','V')),
  mapping_basis text,
  verification_status text DEFAULT 'pending' NOT NULL CHECK (verification_status IN ('pending','verified','rejected','superseded')),
  note text,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS standard.coupling_rule (
  coupling_rule_id bigserial PRIMARY KEY,
  rule_code text NOT NULL UNIQUE,
  source_type_code text NOT NULL REFERENCES dict.disease_type(type_code) ON DELETE RESTRICT,
  target_type_code text NOT NULL REFERENCES dict.disease_type(type_code) ON DELETE RESTRICT,
  coupling_name text NOT NULL,
  condition_json jsonb DEFAULT '{}'::jsonb NOT NULL,
  upgrade_logic text,
  decision_authority text DEFAULT 'RESEARCH_ONLY' NOT NULL CHECK (decision_authority IN ('STANDARD','ENTERPRISE','RESEARCH_ONLY','PENDING')),
  verification_status text DEFAULT 'pending' NOT NULL CHECK (verification_status IN ('pending','verified','rejected','superseded')),
  can_trigger_speed_restriction boolean DEFAULT false NOT NULL,
  manual_review_required boolean DEFAULT true NOT NULL,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE staging.import_batch
  ADD COLUMN IF NOT EXISTS source_document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_system text,
  ADD COLUMN IF NOT EXISTS source_case_code text,
  ADD COLUMN IF NOT EXISTS importer_name text,
  ADD COLUMN IF NOT EXISTS validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS committed_at timestamptz,
  ADD COLUMN IF NOT EXISTS row_count integer,
  ADD COLUMN IF NOT EXISTS valid_row_count integer,
  ADD COLUMN IF NOT EXISTS invalid_row_count integer,
  ADD COLUMN IF NOT EXISTS pending_review_count integer;

ALTER TABLE staging.raw_observation
  ADD COLUMN IF NOT EXISTS source_document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_table_name text,
  ADD COLUMN IF NOT EXISTS sheet_name text,
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS parsed_values jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS row_checksum_sha256 text,
  ADD COLUMN IF NOT EXISTS quality_flag text DEFAULT 'B' NOT NULL,
  ADD COLUMN IF NOT EXISTS correction_status text DEFAULT 'uncorrected' NOT NULL,
  ADD COLUMN IF NOT EXISTS correction_note text;

ALTER TABLE staging.raw_observation
  DROP CONSTRAINT IF EXISTS raw_observation_quality_flag_check,
  DROP CONSTRAINT IF EXISTS raw_observation_correction_status_check,
  ADD CONSTRAINT raw_observation_quality_flag_check
    CHECK (quality_flag IN ('A','B','C','R')),
  ADD CONSTRAINT raw_observation_correction_status_check
    CHECK (correction_status IN ('uncorrected','suspect','corrected','rejected','not_applicable'));

CREATE TABLE IF NOT EXISTS staging.ulanmulun_b13_raw (
  raw_id bigserial PRIMARY KEY,
  batch_id bigint REFERENCES staging.import_batch(batch_id) ON DELETE SET NULL,
  source_document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  sheet_name text DEFAULT 'Sheet1' NOT NULL,
  row_no integer NOT NULL CHECK (row_no > 0),
  location_text text,
  disease_description text,
  photo_ref text,
  source_text text,
  native_grade text,
  proposed_action text,
  raw_payload jsonb DEFAULT '{}'::jsonb NOT NULL,
  raw_text text,
  parsed_values jsonb DEFAULT '{}'::jsonb NOT NULL,
  quality_flag text DEFAULT 'B' NOT NULL CHECK (quality_flag IN ('A','B','C','R')),
  validation_status text DEFAULT 'pending' NOT NULL CHECK (validation_status IN ('pending','valid','invalid','needs_review')),
  validation_message text,
  correction_status text DEFAULT 'uncorrected' NOT NULL CHECK (correction_status IN ('uncorrected','suspect','corrected','rejected','not_applicable')),
  correction_note text,
  source_hash_sha256 text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (batch_id, sheet_name, row_no)
);

ALTER TABLE inspect.disease_case
  ADD COLUMN IF NOT EXISTS source_raw_id bigint,
  ADD COLUMN IF NOT EXISTS source_document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_row_no integer,
  ADD COLUMN IF NOT EXISTS raw_location_text text,
  ADD COLUMN IF NOT EXISTS quality_flag text DEFAULT 'B' NOT NULL,
  ADD COLUMN IF NOT EXISTS correction_status text DEFAULT 'uncorrected' NOT NULL,
  ADD COLUMN IF NOT EXISTS correction_note text;

ALTER TABLE inspect.disease_case
  DROP CONSTRAINT IF EXISTS disease_case_quality_flag_check,
  DROP CONSTRAINT IF EXISTS disease_case_correction_status_check,
  ADD CONSTRAINT disease_case_quality_flag_check
    CHECK (quality_flag IN ('A','B','C','R')),
  ADD CONSTRAINT disease_case_correction_status_check
    CHECK (correction_status IN ('uncorrected','suspect','corrected','rejected','not_applicable'));

ALTER TABLE inspect.observation_value
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS parsed_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  ADD COLUMN IF NOT EXISTS quality_flag text DEFAULT 'B' NOT NULL,
  ADD COLUMN IF NOT EXISTS correction_status text DEFAULT 'uncorrected' NOT NULL,
  ADD COLUMN IF NOT EXISTS correction_note text,
  ADD COLUMN IF NOT EXISTS source_raw_id bigint,
  ADD COLUMN IF NOT EXISTS source_document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_row_no integer;

ALTER TABLE inspect.observation_value
  DROP CONSTRAINT IF EXISTS observation_value_quality_flag_check,
  DROP CONSTRAINT IF EXISTS observation_value_correction_status_check,
  ADD CONSTRAINT observation_value_quality_flag_check
    CHECK (quality_flag IN ('A','B','C','R')),
  ADD CONSTRAINT observation_value_correction_status_check
    CHECK (correction_status IN ('uncorrected','suspect','corrected','rejected','not_applicable'));

CREATE TABLE IF NOT EXISTS inspect.crack_detail (
  crack_detail_id bigserial PRIMARY KEY,
  case_id bigint NOT NULL REFERENCES inspect.disease_case(case_id) ON DELETE CASCADE,
  observation_id bigint REFERENCES inspect.observation_value(observation_id) ON DELETE SET NULL,
  source_raw_id bigint,
  source_row_no integer,
  crack_no integer NOT NULL DEFAULT 1 CHECK (crack_no > 0),
  component_position text,
  crack_direction text,
  length_m numeric(12,3),
  width_mm numeric(10,3),
  depth_mm numeric(10,2),
  area_m2 numeric(12,4),
  raw_text text,
  parsed_value jsonb DEFAULT '{}'::jsonb NOT NULL,
  quality_flag text DEFAULT 'B' NOT NULL CHECK (quality_flag IN ('A','B','C','R')),
  correction_status text DEFAULT 'uncorrected' NOT NULL CHECK (correction_status IN ('uncorrected','suspect','corrected','rejected','not_applicable')),
  correction_note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (case_id, source_row_no, crack_no)
);

CREATE TABLE IF NOT EXISTS inspect.media_attachment (
  media_id bigserial PRIMARY KEY,
  source_document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  batch_id bigint REFERENCES staging.import_batch(batch_id) ON DELETE SET NULL,
  source_raw_id bigint,
  file_uri text NOT NULL,
  relative_path text,
  file_name text NOT NULL,
  media_type text DEFAULT 'image' NOT NULL CHECK (media_type IN ('image','pdf','document','spreadsheet','other')),
  mime_type text,
  checksum_sha256 text,
  file_size_bytes bigint CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  captured_at timestamptz,
  photo_ref text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
  quality_flag text DEFAULT 'B' NOT NULL CHECK (quality_flag IN ('A','B','C','R')),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (file_uri)
);

CREATE TABLE IF NOT EXISTS inspect.case_attachment (
  case_attachment_id bigserial PRIMARY KEY,
  case_id bigint NOT NULL REFERENCES inspect.disease_case(case_id) ON DELETE CASCADE,
  media_id bigint NOT NULL REFERENCES inspect.media_attachment(media_id) ON DELETE CASCADE,
  relation_type text DEFAULT 'evidence' NOT NULL CHECK (relation_type IN ('evidence','before_repair','after_repair','source_page','other')),
  source_raw_id bigint,
  note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (case_id, media_id, relation_type)
);

CREATE TABLE IF NOT EXISTS analysis.evaluation_result (
  evaluation_id bigserial PRIMARY KEY,
  event_id bigint REFERENCES inspect.inspection_event(event_id) ON DELETE SET NULL,
  case_id bigint NOT NULL REFERENCES inspect.disease_case(case_id) ON DELETE CASCADE,
  observation_id bigint REFERENCES inspect.observation_value(observation_id) ON DELETE SET NULL,
  indicator_code text REFERENCES dict.indicator(indicator_code) ON DELETE SET NULL,
  rule_id bigint REFERENCES standard.threshold_rule(rule_id) ON DELETE SET NULL,
  standard_grade text,
  research_priority text CHECK (research_priority IS NULL OR research_priority IN ('P0','P1','P2','P3','INSUFFICIENT_SAMPLE','MANUAL_REVIEW')),
  unified_level text CHECK (unified_level IS NULL OR unified_level IN ('I','II','III','IV','V')),
  evaluation_status text DEFAULT 'pending' NOT NULL CHECK (evaluation_status IN ('pending','computed','needs_review','approved','rejected')),
  decision_authority text DEFAULT 'PENDING' NOT NULL CHECK (decision_authority IN ('STANDARD','ENTERPRISE','RESEARCH_ONLY','PENDING')),
  manual_review_required boolean DEFAULT true NOT NULL,
  can_trigger_speed_restriction boolean DEFAULT false NOT NULL,
  input_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
  explanation text,
  reviewed_by text,
  reviewed_at timestamptz,
  computed_at timestamptz DEFAULT now() NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance.work_order (
  work_order_id bigserial PRIMARY KEY,
  work_order_code text NOT NULL UNIQUE,
  case_id bigint REFERENCES inspect.disease_case(case_id) ON DELETE SET NULL,
  evaluation_id bigint REFERENCES analysis.evaluation_result(evaluation_id) ON DELETE SET NULL,
  segment_id bigint REFERENCES base.route_segment(segment_id) ON DELETE SET NULL,
  bridge_id bigint REFERENCES base.bridge(bridge_id) ON DELETE SET NULL,
  work_type text NOT NULL,
  priority text DEFAULT 'review' NOT NULL CHECK (priority IN ('routine','review','urgent','emergency')),
  status text DEFAULT 'draft' NOT NULL CHECK (status IN ('draft','submitted','approved','in_progress','completed','verified','closed','cancelled')),
  recommendation text,
  planned_start_date date,
  planned_end_date date,
  completed_date date,
  organization text,
  source_document_id bigint REFERENCES standard.source_document(document_id) ON DELETE SET NULL,
  review_note text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS threshold_rule_indicator_idx ON standard.threshold_rule(indicator_code);
CREATE INDEX IF NOT EXISTS threshold_rule_disease_idx ON standard.threshold_rule(disease_type_code);
CREATE INDEX IF NOT EXISTS threshold_band_rule_idx ON standard.threshold_band(rule_id);
CREATE INDEX IF NOT EXISTS coupling_rule_source_target_idx ON standard.coupling_rule(source_type_code, target_type_code);
CREATE INDEX IF NOT EXISTS raw_observation_batch_status_idx ON staging.raw_observation(batch_id, validation_status);
CREATE INDEX IF NOT EXISTS ulanmulun_b13_raw_status_idx ON staging.ulanmulun_b13_raw(validation_status, quality_flag);
CREATE INDEX IF NOT EXISTS crack_detail_case_idx ON inspect.crack_detail(case_id);
CREATE INDEX IF NOT EXISTS media_attachment_checksum_idx ON inspect.media_attachment(checksum_sha256);
CREATE INDEX IF NOT EXISTS case_attachment_case_idx ON inspect.case_attachment(case_id);
CREATE INDEX IF NOT EXISTS evaluation_result_case_idx ON analysis.evaluation_result(case_id, computed_at DESC);
CREATE INDEX IF NOT EXISTS work_order_case_status_idx ON maintenance.work_order(case_id, status);

CREATE OR REPLACE VIEW analysis.dictionary_acceptance AS
SELECT
  count(DISTINCT dt.type_code) FILTER (WHERE dt.mandatory_flag) AS mandatory_type_count,
  bool_and(dt.active_flag) FILTER (WHERE dt.mandatory_flag) AS all_mandatory_active,
  count(DISTINCT dt.type_code) FILTER (WHERE dt.type_code >= 'T01' AND dt.type_code <= 'T99') AS track_type_count,
  count(DISTINCT dt.type_code) FILTER (WHERE dt.type_code >= 'B01' AND dt.type_code <= 'B99') AS bridge_type_count,
  count(DISTINCT dt.type_code) FILTER (WHERE dt.type_code >= 'C01' AND dt.type_code <= 'C99') AS interface_type_count,
  count(DISTINCT i.indicator_code) AS indicator_count,
  count(DISTINCT di.disease_indicator_id) AS disease_indicator_count,
  count(*) FILTER (
    WHERE dt.mandatory_flag
      AND NOT EXISTS (
        SELECT 1
        FROM dict.disease_indicator di2
        JOIN dict.indicator i2 ON i2.indicator_code = di2.indicator_code
        WHERE di2.type_code = dt.type_code
          AND di2.relation_role = 'primary'
          AND i2.unit IS NOT NULL
          AND i2.measurement_method IS NOT NULL
      )
  ) AS mandatory_without_primary_indicator_count
FROM dict.disease_type dt
LEFT JOIN dict.disease_indicator di ON di.type_code = dt.type_code
LEFT JOIN dict.indicator i ON i.indicator_code = di.indicator_code;

COMMIT;

--
-- PostgreSQL database dump
--

\restrict aTRy3cg5HJRrbx3NiE54ZQ7W2F6fuNYTD1sR6wF1ZO8mCZNNLIVgN3xjDBAUSic

-- Dumped from database version 18.3
-- Dumped by pg_dump version 18.3

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Required extensions
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS postgis_topology;

--
-- Name: base; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA base;


--
-- Name: dict; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA dict;


--
-- Name: inspect; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA inspect;


--
-- Name: response; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA response;


--
-- Name: staging; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA staging;


--
-- Name: standard; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA standard;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: disease_type; Type: TABLE; Schema: dict; Owner: -
--

CREATE TABLE dict.disease_type (
    disease_type_id bigint NOT NULL,
    type_code text NOT NULL,
    parent_type_code text,
    standard_name text NOT NULL,
    disease_domain text NOT NULL,
    description text,
    mandatory_flag boolean DEFAULT true NOT NULL,
    active_flag boolean DEFAULT true NOT NULL,
    sort_order integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT disease_type_disease_domain_check CHECK ((disease_domain = ANY (ARRAY['track'::text, 'bridge'::text, 'interface'::text, 'response'::text])))
);


--
-- Name: disease_case; Type: TABLE; Schema: inspect; Owner: -
--

CREATE TABLE inspect.disease_case (
    case_id bigint NOT NULL,
    case_code text NOT NULL,
    disease_type_code text NOT NULL,
    segment_id bigint,
    curve_id bigint,
    bridge_id bigint,
    span_id bigint,
    component_id bigint,
    start_chainage_m numeric(14,3),
    end_chainage_m numeric(14,3),
    chainage_text text,
    geom public.geometry(GeometryZM),
    first_seen_event_id bigint,
    status text DEFAULT 'open'::text NOT NULL,
    severity_level text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT disease_case_check CHECK (((start_chainage_m IS NULL) OR (end_chainage_m IS NULL) OR (end_chainage_m >= start_chainage_m))),
    CONSTRAINT disease_case_severity_level_check CHECK ((severity_level = ANY (ARRAY['I'::text, 'II'::text, 'III'::text, 'IV'::text, 'V'::text]))),
    CONSTRAINT disease_case_status_check CHECK ((status = ANY (ARRAY['open'::text, 'monitored'::text, 'treated'::text, 'closed'::text])))
);


--
-- Name: inspection_event; Type: TABLE; Schema: inspect; Owner: -
--

CREATE TABLE inspect.inspection_event (
    event_id bigint NOT NULL,
    event_code text NOT NULL,
    segment_id bigint,
    event_date date NOT NULL,
    inspection_method text,
    organization text,
    weather text,
    source_file_uri text,
    source_checksum_sha256 text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: observation_value; Type: TABLE; Schema: inspect; Owner: -
--

CREATE TABLE inspect.observation_value (
    observation_id bigint NOT NULL,
    event_id bigint NOT NULL,
    case_id bigint NOT NULL,
    indicator_code text NOT NULL,
    observed_at timestamp with time zone,
    raw_value numeric,
    text_value text,
    unit text,
    native_grade text,
    unified_level text,
    applicable_flag boolean DEFAULT true NOT NULL,
    missing_reason text,
    source_quality_flag text DEFAULT 'B'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT observation_value_check CHECK ((applicable_flag OR (missing_reason IS NOT NULL))),
    CONSTRAINT observation_value_check1 CHECK (((raw_value IS NOT NULL) OR (text_value IS NOT NULL) OR (applicable_flag = false))),
    CONSTRAINT observation_value_source_quality_flag_check CHECK ((source_quality_flag = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'R'::text]))),
    CONSTRAINT observation_value_unified_level_check CHECK (((unified_level IS NULL) OR (unified_level = ANY (ARRAY['I'::text, 'II'::text, 'III'::text, 'IV'::text, 'V'::text]))))
);


--
-- Name: bridge; Type: TABLE; Schema: base; Owner: -
--

CREATE TABLE base.bridge (
    bridge_id bigint NOT NULL,
    segment_id bigint,
    bridge_code text NOT NULL,
    bridge_name text,
    bridge_type text,
    start_chainage_m numeric(14,3),
    end_chainage_m numeric(14,3),
    geom public.geometry(LineStringZM),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bridge_check CHECK (((start_chainage_m IS NULL) OR (end_chainage_m IS NULL) OR (end_chainage_m >= start_chainage_m)))
);


--
-- Name: bridge_bridge_id_seq; Type: SEQUENCE; Schema: base; Owner: -
--

CREATE SEQUENCE base.bridge_bridge_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bridge_bridge_id_seq; Type: SEQUENCE OWNED BY; Schema: base; Owner: -
--

ALTER SEQUENCE base.bridge_bridge_id_seq OWNED BY base.bridge.bridge_id;


--
-- Name: bridge_span; Type: TABLE; Schema: base; Owner: -
--

CREATE TABLE base.bridge_span (
    span_id bigint NOT NULL,
    bridge_id bigint NOT NULL,
    span_code text NOT NULL,
    span_no integer,
    start_chainage_m numeric(14,3),
    end_chainage_m numeric(14,3),
    geom public.geometry(LineStringZM),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bridge_span_check CHECK (((start_chainage_m IS NULL) OR (end_chainage_m IS NULL) OR (end_chainage_m >= start_chainage_m)))
);


--
-- Name: bridge_span_span_id_seq; Type: SEQUENCE; Schema: base; Owner: -
--

CREATE SEQUENCE base.bridge_span_span_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bridge_span_span_id_seq; Type: SEQUENCE OWNED BY; Schema: base; Owner: -
--

ALTER SEQUENCE base.bridge_span_span_id_seq OWNED BY base.bridge_span.span_id;


--
-- Name: component; Type: TABLE; Schema: base; Owner: -
--

CREATE TABLE base.component (
    component_id bigint NOT NULL,
    span_id bigint,
    segment_id bigint,
    component_code text NOT NULL,
    component_type text NOT NULL,
    component_name text,
    chainage_m numeric(14,3),
    geom public.geometry(GeometryZM),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: component_component_id_seq; Type: SEQUENCE; Schema: base; Owner: -
--

CREATE SEQUENCE base.component_component_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: component_component_id_seq; Type: SEQUENCE OWNED BY; Schema: base; Owner: -
--

ALTER SEQUENCE base.component_component_id_seq OWNED BY base.component.component_id;


--
-- Name: curve_section; Type: TABLE; Schema: base; Owner: -
--

CREATE TABLE base.curve_section (
    curve_id bigint NOT NULL,
    segment_id bigint,
    curve_code text NOT NULL,
    curve_name text,
    radius_m numeric(10,3),
    superelevation_mm numeric(8,3),
    transition_curve_length_m numeric(10,3),
    start_chainage_m numeric(14,3) NOT NULL,
    end_chainage_m numeric(14,3) NOT NULL,
    geom public.geometry(LineStringZM),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT curve_section_check CHECK ((end_chainage_m > start_chainage_m)),
    CONSTRAINT curve_section_radius_m_check CHECK (((radius_m IS NULL) OR (radius_m > (0)::numeric)))
);


--
-- Name: curve_section_curve_id_seq; Type: SEQUENCE; Schema: base; Owner: -
--

CREATE SEQUENCE base.curve_section_curve_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: curve_section_curve_id_seq; Type: SEQUENCE OWNED BY; Schema: base; Owner: -
--

ALTER SEQUENCE base.curve_section_curve_id_seq OWNED BY base.curve_section.curve_id;


--
-- Name: project_config; Type: TABLE; Schema: base; Owner: -
--

CREATE TABLE base.project_config (
    id boolean DEFAULT true NOT NULL,
    project_name text NOT NULL,
    subject_name text NOT NULL,
    db_version text DEFAULT '1.0'::text NOT NULL,
    railway_crs_note text,
    projected_srid integer,
    file_storage_root text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT project_config_id_check CHECK (id)
);


--
-- Name: railway_line; Type: TABLE; Schema: base; Owner: -
--

CREATE TABLE base.railway_line (
    line_id bigint NOT NULL,
    line_code text NOT NULL,
    line_name text NOT NULL,
    operator_name text,
    design_speed_kmh numeric(8,2),
    gauge_mm numeric(8,2),
    source_name text,
    geom public.geometry(MultiLineStringZM),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: railway_line_line_id_seq; Type: SEQUENCE; Schema: base; Owner: -
--

CREATE SEQUENCE base.railway_line_line_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: railway_line_line_id_seq; Type: SEQUENCE OWNED BY; Schema: base; Owner: -
--

ALTER SEQUENCE base.railway_line_line_id_seq OWNED BY base.railway_line.line_id;


--
-- Name: route_segment; Type: TABLE; Schema: base; Owner: -
--

CREATE TABLE base.route_segment (
    segment_id bigint NOT NULL,
    line_id bigint,
    segment_code text NOT NULL,
    segment_name text,
    start_chainage_m numeric(14,3) NOT NULL,
    end_chainage_m numeric(14,3) NOT NULL,
    start_chainage_text text,
    end_chainage_text text,
    direction text,
    geom public.geometry(LineStringZM),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT route_segment_check CHECK ((end_chainage_m > start_chainage_m))
);


--
-- Name: route_segment_segment_id_seq; Type: SEQUENCE; Schema: base; Owner: -
--

CREATE SEQUENCE base.route_segment_segment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: route_segment_segment_id_seq; Type: SEQUENCE OWNED BY; Schema: base; Owner: -
--

ALTER SEQUENCE base.route_segment_segment_id_seq OWNED BY base.route_segment.segment_id;


--
-- Name: disease_alias; Type: TABLE; Schema: dict; Owner: -
--

CREATE TABLE dict.disease_alias (
    alias_id bigint NOT NULL,
    type_code text NOT NULL,
    source_name text NOT NULL,
    source_note text
);


--
-- Name: disease_alias_alias_id_seq; Type: SEQUENCE; Schema: dict; Owner: -
--

CREATE SEQUENCE dict.disease_alias_alias_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disease_alias_alias_id_seq; Type: SEQUENCE OWNED BY; Schema: dict; Owner: -
--

ALTER SEQUENCE dict.disease_alias_alias_id_seq OWNED BY dict.disease_alias.alias_id;


--
-- Name: disease_type_disease_type_id_seq; Type: SEQUENCE; Schema: dict; Owner: -
--

CREATE SEQUENCE dict.disease_type_disease_type_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disease_type_disease_type_id_seq; Type: SEQUENCE OWNED BY; Schema: dict; Owner: -
--

ALTER SEQUENCE dict.disease_type_disease_type_id_seq OWNED BY dict.disease_type.disease_type_id;


--
-- Name: indicator; Type: TABLE; Schema: dict; Owner: -
--

CREATE TABLE dict.indicator (
    indicator_id bigint NOT NULL,
    indicator_code text NOT NULL,
    disease_type_code text,
    standard_name text NOT NULL,
    source_name text,
    unit text,
    decimal_scale integer DEFAULT 3 NOT NULL,
    value_kind text NOT NULL,
    required_level text NOT NULL,
    trend_direction text,
    definition text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT indicator_decimal_scale_check CHECK (((decimal_scale >= 0) AND (decimal_scale <= 8))),
    CONSTRAINT indicator_required_level_check CHECK ((required_level = ANY (ARRAY['required'::text, 'conditional'::text, 'optional'::text]))),
    CONSTRAINT indicator_trend_direction_check CHECK ((trend_direction = ANY (ARRAY['higher'::text, 'lower'::text, 'bidirectional'::text, 'categorical'::text]))),
    CONSTRAINT indicator_value_kind_check CHECK ((value_kind = ANY (ARRAY['raw'::text, 'derived'::text, 'evaluation'::text])))
);


--
-- Name: indicator_indicator_id_seq; Type: SEQUENCE; Schema: dict; Owner: -
--

CREATE SEQUENCE dict.indicator_indicator_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: indicator_indicator_id_seq; Type: SEQUENCE OWNED BY; Schema: dict; Owner: -
--

ALTER SEQUENCE dict.indicator_indicator_id_seq OWNED BY dict.indicator.indicator_id;


--
-- Name: disease_case_case_id_seq; Type: SEQUENCE; Schema: inspect; Owner: -
--

CREATE SEQUENCE inspect.disease_case_case_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disease_case_case_id_seq; Type: SEQUENCE OWNED BY; Schema: inspect; Owner: -
--

ALTER SEQUENCE inspect.disease_case_case_id_seq OWNED BY inspect.disease_case.case_id;


--
-- Name: disease_relation; Type: TABLE; Schema: inspect; Owner: -
--

CREATE TABLE inspect.disease_relation (
    relation_id bigint NOT NULL,
    source_case_id bigint NOT NULL,
    target_case_id bigint NOT NULL,
    relation_type text NOT NULL,
    evidence_level text DEFAULT 'hypothesis'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT disease_relation_check CHECK ((source_case_id <> target_case_id)),
    CONSTRAINT disease_relation_evidence_level_check CHECK ((evidence_level = ANY (ARRAY['observed'::text, 'hypothesis'::text, 'verified'::text, 'rejected'::text]))),
    CONSTRAINT disease_relation_relation_type_check CHECK ((relation_type = ANY (ARRAY['co_location'::text, 'synchronous_development'::text, 'causal_hypothesis'::text, 'structural_response'::text])))
);


--
-- Name: disease_relation_relation_id_seq; Type: SEQUENCE; Schema: inspect; Owner: -
--

CREATE SEQUENCE inspect.disease_relation_relation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: disease_relation_relation_id_seq; Type: SEQUENCE OWNED BY; Schema: inspect; Owner: -
--

ALTER SEQUENCE inspect.disease_relation_relation_id_seq OWNED BY inspect.disease_relation.relation_id;


--
-- Name: inspection_event_event_id_seq; Type: SEQUENCE; Schema: inspect; Owner: -
--

CREATE SEQUENCE inspect.inspection_event_event_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: inspection_event_event_id_seq; Type: SEQUENCE OWNED BY; Schema: inspect; Owner: -
--

ALTER SEQUENCE inspect.inspection_event_event_id_seq OWNED BY inspect.inspection_event.event_id;


--
-- Name: maintenance_event; Type: TABLE; Schema: inspect; Owner: -
--

CREATE TABLE inspect.maintenance_event (
    maintenance_id bigint NOT NULL,
    maintenance_code text NOT NULL,
    case_id bigint,
    segment_id bigint,
    maintenance_date date NOT NULL,
    maintenance_type text NOT NULL,
    organization text,
    start_chainage_m numeric(14,3),
    end_chainage_m numeric(14,3),
    geom public.geometry(GeometryZM),
    result_summary text,
    source_file_uri text,
    source_checksum_sha256 text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT maintenance_event_check CHECK (((start_chainage_m IS NULL) OR (end_chainage_m IS NULL) OR (end_chainage_m >= start_chainage_m)))
);


--
-- Name: maintenance_event_maintenance_id_seq; Type: SEQUENCE; Schema: inspect; Owner: -
--

CREATE SEQUENCE inspect.maintenance_event_maintenance_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: maintenance_event_maintenance_id_seq; Type: SEQUENCE OWNED BY; Schema: inspect; Owner: -
--

ALTER SEQUENCE inspect.maintenance_event_maintenance_id_seq OWNED BY inspect.maintenance_event.maintenance_id;


--
-- Name: observation_value_observation_id_seq; Type: SEQUENCE; Schema: inspect; Owner: -
--

CREATE SEQUENCE inspect.observation_value_observation_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: observation_value_observation_id_seq; Type: SEQUENCE OWNED BY; Schema: inspect; Owner: -
--

ALTER SEQUENCE inspect.observation_value_observation_id_seq OWNED BY inspect.observation_value.observation_id;


--
-- Name: sensor_file; Type: TABLE; Schema: response; Owner: -
--

CREATE TABLE response.sensor_file (
    sensor_file_id bigint NOT NULL,
    event_id bigint,
    file_uri text NOT NULL,
    checksum_sha256 text NOT NULL,
    file_format text,
    sample_rate_hz numeric(14,3),
    start_time timestamp with time zone,
    end_time timestamp with time zone,
    sensor_location text,
    channel_names text[],
    train_speed_kmh numeric(8,3),
    summary_json jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sensor_file_sensor_file_id_seq; Type: SEQUENCE; Schema: response; Owner: -
--

CREATE SEQUENCE response.sensor_file_sensor_file_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sensor_file_sensor_file_id_seq; Type: SEQUENCE OWNED BY; Schema: response; Owner: -
--

ALTER SEQUENCE response.sensor_file_sensor_file_id_seq OWNED BY response.sensor_file.sensor_file_id;


--
-- Name: import_batch; Type: TABLE; Schema: staging; Owner: -
--

CREATE TABLE staging.import_batch (
    batch_id bigint NOT NULL,
    batch_code text NOT NULL,
    source_file_uri text NOT NULL,
    checksum_sha256 text,
    import_status text DEFAULT 'loaded'::text NOT NULL,
    quality_flag text DEFAULT 'B'::text NOT NULL,
    issue_summary text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT import_batch_import_status_check CHECK ((import_status = ANY (ARRAY['loaded'::text, 'validated'::text, 'rejected'::text, 'committed'::text]))),
    CONSTRAINT import_batch_quality_flag_check CHECK ((quality_flag = ANY (ARRAY['A'::text, 'B'::text, 'C'::text, 'R'::text])))
);


--
-- Name: import_batch_batch_id_seq; Type: SEQUENCE; Schema: staging; Owner: -
--

CREATE SEQUENCE staging.import_batch_batch_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: import_batch_batch_id_seq; Type: SEQUENCE OWNED BY; Schema: staging; Owner: -
--

ALTER SEQUENCE staging.import_batch_batch_id_seq OWNED BY staging.import_batch.batch_id;


--
-- Name: raw_observation; Type: TABLE; Schema: staging; Owner: -
--

CREATE TABLE staging.raw_observation (
    raw_id bigint NOT NULL,
    batch_id bigint NOT NULL,
    row_no integer NOT NULL,
    payload jsonb NOT NULL,
    validation_status text DEFAULT 'pending'::text NOT NULL,
    validation_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT raw_observation_validation_status_check CHECK ((validation_status = ANY (ARRAY['pending'::text, 'valid'::text, 'invalid'::text])))
);


--
-- Name: raw_observation_raw_id_seq; Type: SEQUENCE; Schema: staging; Owner: -
--

CREATE SEQUENCE staging.raw_observation_raw_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: raw_observation_raw_id_seq; Type: SEQUENCE OWNED BY; Schema: staging; Owner: -
--

ALTER SEQUENCE staging.raw_observation_raw_id_seq OWNED BY staging.raw_observation.raw_id;


--
-- Name: indicator_threshold; Type: TABLE; Schema: standard; Owner: -
--

CREATE TABLE standard.indicator_threshold (
    threshold_id bigint NOT NULL,
    indicator_code text NOT NULL,
    document_id bigint,
    clause_no text,
    threshold_type text NOT NULL,
    native_grade text,
    unified_level text,
    condition_expr text,
    threshold_value numeric,
    threshold_unit text,
    applicable_scope text,
    verification_status text DEFAULT 'pending'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT indicator_threshold_threshold_type_check CHECK ((threshold_type = ANY (ARRAY['standard'::text, 'operation'::text, 'literature'::text, 'model'::text]))),
    CONSTRAINT indicator_threshold_unified_level_check CHECK (((unified_level IS NULL) OR (unified_level = ANY (ARRAY['I'::text, 'II'::text, 'III'::text, 'IV'::text, 'V'::text])))),
    CONSTRAINT indicator_threshold_verification_status_check CHECK ((verification_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])))
);


--
-- Name: indicator_threshold_threshold_id_seq; Type: SEQUENCE; Schema: standard; Owner: -
--

CREATE SEQUENCE standard.indicator_threshold_threshold_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: indicator_threshold_threshold_id_seq; Type: SEQUENCE OWNED BY; Schema: standard; Owner: -
--

ALTER SEQUENCE standard.indicator_threshold_threshold_id_seq OWNED BY standard.indicator_threshold.threshold_id;


--
-- Name: source_document; Type: TABLE; Schema: standard; Owner: -
--

CREATE TABLE standard.source_document (
    document_id bigint NOT NULL,
    document_code text NOT NULL,
    document_title text NOT NULL,
    document_type text NOT NULL,
    version_label text,
    issue_year integer,
    source_uri text,
    checksum_sha256 text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT source_document_document_type_check CHECK ((document_type = ANY (ARRAY['standard'::text, 'rule'::text, 'paper'::text, 'internal'::text, 'other'::text])))
);


--
-- Name: source_document_document_id_seq; Type: SEQUENCE; Schema: standard; Owner: -
--

CREATE SEQUENCE standard.source_document_document_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: source_document_document_id_seq; Type: SEQUENCE OWNED BY; Schema: standard; Owner: -
--

ALTER SEQUENCE standard.source_document_document_id_seq OWNED BY standard.source_document.document_id;


--
-- Name: bridge bridge_id; Type: DEFAULT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.bridge ALTER COLUMN bridge_id SET DEFAULT nextval('base.bridge_bridge_id_seq'::regclass);


--
-- Name: bridge_span span_id; Type: DEFAULT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.bridge_span ALTER COLUMN span_id SET DEFAULT nextval('base.bridge_span_span_id_seq'::regclass);


--
-- Name: component component_id; Type: DEFAULT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.component ALTER COLUMN component_id SET DEFAULT nextval('base.component_component_id_seq'::regclass);


--
-- Name: curve_section curve_id; Type: DEFAULT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.curve_section ALTER COLUMN curve_id SET DEFAULT nextval('base.curve_section_curve_id_seq'::regclass);


--
-- Name: railway_line line_id; Type: DEFAULT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.railway_line ALTER COLUMN line_id SET DEFAULT nextval('base.railway_line_line_id_seq'::regclass);


--
-- Name: route_segment segment_id; Type: DEFAULT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.route_segment ALTER COLUMN segment_id SET DEFAULT nextval('base.route_segment_segment_id_seq'::regclass);


--
-- Name: disease_alias alias_id; Type: DEFAULT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.disease_alias ALTER COLUMN alias_id SET DEFAULT nextval('dict.disease_alias_alias_id_seq'::regclass);


--
-- Name: disease_type disease_type_id; Type: DEFAULT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.disease_type ALTER COLUMN disease_type_id SET DEFAULT nextval('dict.disease_type_disease_type_id_seq'::regclass);


--
-- Name: indicator indicator_id; Type: DEFAULT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.indicator ALTER COLUMN indicator_id SET DEFAULT nextval('dict.indicator_indicator_id_seq'::regclass);


--
-- Name: disease_case case_id; Type: DEFAULT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case ALTER COLUMN case_id SET DEFAULT nextval('inspect.disease_case_case_id_seq'::regclass);


--
-- Name: disease_relation relation_id; Type: DEFAULT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_relation ALTER COLUMN relation_id SET DEFAULT nextval('inspect.disease_relation_relation_id_seq'::regclass);


--
-- Name: inspection_event event_id; Type: DEFAULT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.inspection_event ALTER COLUMN event_id SET DEFAULT nextval('inspect.inspection_event_event_id_seq'::regclass);


--
-- Name: maintenance_event maintenance_id; Type: DEFAULT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.maintenance_event ALTER COLUMN maintenance_id SET DEFAULT nextval('inspect.maintenance_event_maintenance_id_seq'::regclass);


--
-- Name: observation_value observation_id; Type: DEFAULT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.observation_value ALTER COLUMN observation_id SET DEFAULT nextval('inspect.observation_value_observation_id_seq'::regclass);


--
-- Name: sensor_file sensor_file_id; Type: DEFAULT; Schema: response; Owner: -
--

ALTER TABLE ONLY response.sensor_file ALTER COLUMN sensor_file_id SET DEFAULT nextval('response.sensor_file_sensor_file_id_seq'::regclass);


--
-- Name: import_batch batch_id; Type: DEFAULT; Schema: staging; Owner: -
--

ALTER TABLE ONLY staging.import_batch ALTER COLUMN batch_id SET DEFAULT nextval('staging.import_batch_batch_id_seq'::regclass);


--
-- Name: raw_observation raw_id; Type: DEFAULT; Schema: staging; Owner: -
--

ALTER TABLE ONLY staging.raw_observation ALTER COLUMN raw_id SET DEFAULT nextval('staging.raw_observation_raw_id_seq'::regclass);


--
-- Name: indicator_threshold threshold_id; Type: DEFAULT; Schema: standard; Owner: -
--

ALTER TABLE ONLY standard.indicator_threshold ALTER COLUMN threshold_id SET DEFAULT nextval('standard.indicator_threshold_threshold_id_seq'::regclass);


--
-- Name: source_document document_id; Type: DEFAULT; Schema: standard; Owner: -
--

ALTER TABLE ONLY standard.source_document ALTER COLUMN document_id SET DEFAULT nextval('standard.source_document_document_id_seq'::regclass);


--
-- Name: bridge bridge_bridge_code_key; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.bridge
    ADD CONSTRAINT bridge_bridge_code_key UNIQUE (bridge_code);


--
-- Name: bridge bridge_pkey; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.bridge
    ADD CONSTRAINT bridge_pkey PRIMARY KEY (bridge_id);


--
-- Name: bridge_span bridge_span_pkey; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.bridge_span
    ADD CONSTRAINT bridge_span_pkey PRIMARY KEY (span_id);


--
-- Name: bridge_span bridge_span_span_code_key; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.bridge_span
    ADD CONSTRAINT bridge_span_span_code_key UNIQUE (span_code);


--
-- Name: component component_component_code_key; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.component
    ADD CONSTRAINT component_component_code_key UNIQUE (component_code);


--
-- Name: component component_pkey; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.component
    ADD CONSTRAINT component_pkey PRIMARY KEY (component_id);


--
-- Name: curve_section curve_section_curve_code_key; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.curve_section
    ADD CONSTRAINT curve_section_curve_code_key UNIQUE (curve_code);


--
-- Name: curve_section curve_section_pkey; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.curve_section
    ADD CONSTRAINT curve_section_pkey PRIMARY KEY (curve_id);


--
-- Name: project_config project_config_pkey; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.project_config
    ADD CONSTRAINT project_config_pkey PRIMARY KEY (id);


--
-- Name: railway_line railway_line_line_code_key; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.railway_line
    ADD CONSTRAINT railway_line_line_code_key UNIQUE (line_code);


--
-- Name: railway_line railway_line_pkey; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.railway_line
    ADD CONSTRAINT railway_line_pkey PRIMARY KEY (line_id);


--
-- Name: route_segment route_segment_pkey; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.route_segment
    ADD CONSTRAINT route_segment_pkey PRIMARY KEY (segment_id);


--
-- Name: route_segment route_segment_segment_code_key; Type: CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.route_segment
    ADD CONSTRAINT route_segment_segment_code_key UNIQUE (segment_code);


--
-- Name: disease_alias disease_alias_pkey; Type: CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.disease_alias
    ADD CONSTRAINT disease_alias_pkey PRIMARY KEY (alias_id);


--
-- Name: disease_alias disease_alias_type_code_source_name_key; Type: CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.disease_alias
    ADD CONSTRAINT disease_alias_type_code_source_name_key UNIQUE (type_code, source_name);


--
-- Name: disease_type disease_type_pkey; Type: CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.disease_type
    ADD CONSTRAINT disease_type_pkey PRIMARY KEY (disease_type_id);


--
-- Name: disease_type disease_type_type_code_key; Type: CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.disease_type
    ADD CONSTRAINT disease_type_type_code_key UNIQUE (type_code);


--
-- Name: indicator indicator_indicator_code_key; Type: CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.indicator
    ADD CONSTRAINT indicator_indicator_code_key UNIQUE (indicator_code);


--
-- Name: indicator indicator_pkey; Type: CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.indicator
    ADD CONSTRAINT indicator_pkey PRIMARY KEY (indicator_id);


--
-- Name: disease_case disease_case_case_code_key; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_case_code_key UNIQUE (case_code);


--
-- Name: disease_case disease_case_pkey; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_pkey PRIMARY KEY (case_id);


--
-- Name: disease_relation disease_relation_pkey; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_relation
    ADD CONSTRAINT disease_relation_pkey PRIMARY KEY (relation_id);


--
-- Name: disease_relation disease_relation_source_case_id_target_case_id_relation_typ_key; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_relation
    ADD CONSTRAINT disease_relation_source_case_id_target_case_id_relation_typ_key UNIQUE (source_case_id, target_case_id, relation_type);


--
-- Name: inspection_event inspection_event_event_code_key; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.inspection_event
    ADD CONSTRAINT inspection_event_event_code_key UNIQUE (event_code);


--
-- Name: inspection_event inspection_event_pkey; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.inspection_event
    ADD CONSTRAINT inspection_event_pkey PRIMARY KEY (event_id);


--
-- Name: maintenance_event maintenance_event_maintenance_code_key; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.maintenance_event
    ADD CONSTRAINT maintenance_event_maintenance_code_key UNIQUE (maintenance_code);


--
-- Name: maintenance_event maintenance_event_pkey; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.maintenance_event
    ADD CONSTRAINT maintenance_event_pkey PRIMARY KEY (maintenance_id);


--
-- Name: observation_value observation_value_event_id_case_id_indicator_code_key; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.observation_value
    ADD CONSTRAINT observation_value_event_id_case_id_indicator_code_key UNIQUE (event_id, case_id, indicator_code);


--
-- Name: observation_value observation_value_pkey; Type: CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.observation_value
    ADD CONSTRAINT observation_value_pkey PRIMARY KEY (observation_id);


--
-- Name: sensor_file sensor_file_checksum_sha256_key; Type: CONSTRAINT; Schema: response; Owner: -
--

ALTER TABLE ONLY response.sensor_file
    ADD CONSTRAINT sensor_file_checksum_sha256_key UNIQUE (checksum_sha256);


--
-- Name: sensor_file sensor_file_pkey; Type: CONSTRAINT; Schema: response; Owner: -
--

ALTER TABLE ONLY response.sensor_file
    ADD CONSTRAINT sensor_file_pkey PRIMARY KEY (sensor_file_id);


--
-- Name: import_batch import_batch_batch_code_key; Type: CONSTRAINT; Schema: staging; Owner: -
--

ALTER TABLE ONLY staging.import_batch
    ADD CONSTRAINT import_batch_batch_code_key UNIQUE (batch_code);


--
-- Name: import_batch import_batch_pkey; Type: CONSTRAINT; Schema: staging; Owner: -
--

ALTER TABLE ONLY staging.import_batch
    ADD CONSTRAINT import_batch_pkey PRIMARY KEY (batch_id);


--
-- Name: raw_observation raw_observation_batch_id_row_no_key; Type: CONSTRAINT; Schema: staging; Owner: -
--

ALTER TABLE ONLY staging.raw_observation
    ADD CONSTRAINT raw_observation_batch_id_row_no_key UNIQUE (batch_id, row_no);


--
-- Name: raw_observation raw_observation_pkey; Type: CONSTRAINT; Schema: staging; Owner: -
--

ALTER TABLE ONLY staging.raw_observation
    ADD CONSTRAINT raw_observation_pkey PRIMARY KEY (raw_id);


--
-- Name: indicator_threshold indicator_threshold_pkey; Type: CONSTRAINT; Schema: standard; Owner: -
--

ALTER TABLE ONLY standard.indicator_threshold
    ADD CONSTRAINT indicator_threshold_pkey PRIMARY KEY (threshold_id);


--
-- Name: source_document source_document_document_code_key; Type: CONSTRAINT; Schema: standard; Owner: -
--

ALTER TABLE ONLY standard.source_document
    ADD CONSTRAINT source_document_document_code_key UNIQUE (document_code);


--
-- Name: source_document source_document_pkey; Type: CONSTRAINT; Schema: standard; Owner: -
--

ALTER TABLE ONLY standard.source_document
    ADD CONSTRAINT source_document_pkey PRIMARY KEY (document_id);


--
-- Name: bridge_geom_gix; Type: INDEX; Schema: base; Owner: -
--

CREATE INDEX bridge_geom_gix ON base.bridge USING gist (geom);


--
-- Name: bridge_span_geom_gix; Type: INDEX; Schema: base; Owner: -
--

CREATE INDEX bridge_span_geom_gix ON base.bridge_span USING gist (geom);


--
-- Name: component_geom_gix; Type: INDEX; Schema: base; Owner: -
--

CREATE INDEX component_geom_gix ON base.component USING gist (geom);


--
-- Name: curve_section_chainage_idx; Type: INDEX; Schema: base; Owner: -
--

CREATE INDEX curve_section_chainage_idx ON base.curve_section USING btree (start_chainage_m, end_chainage_m);


--
-- Name: curve_section_geom_gix; Type: INDEX; Schema: base; Owner: -
--

CREATE INDEX curve_section_geom_gix ON base.curve_section USING gist (geom);


--
-- Name: railway_line_geom_gix; Type: INDEX; Schema: base; Owner: -
--

CREATE INDEX railway_line_geom_gix ON base.railway_line USING gist (geom);


--
-- Name: route_segment_chainage_idx; Type: INDEX; Schema: base; Owner: -
--

CREATE INDEX route_segment_chainage_idx ON base.route_segment USING btree (start_chainage_m, end_chainage_m);


--
-- Name: route_segment_geom_gix; Type: INDEX; Schema: base; Owner: -
--

CREATE INDEX route_segment_geom_gix ON base.route_segment USING gist (geom);


--
-- Name: disease_case_chainage_idx; Type: INDEX; Schema: inspect; Owner: -
--

CREATE INDEX disease_case_chainage_idx ON inspect.disease_case USING btree (start_chainage_m, end_chainage_m);


--
-- Name: disease_case_geom_gix; Type: INDEX; Schema: inspect; Owner: -
--

CREATE INDEX disease_case_geom_gix ON inspect.disease_case USING gist (geom);


--
-- Name: disease_case_type_idx; Type: INDEX; Schema: inspect; Owner: -
--

CREATE INDEX disease_case_type_idx ON inspect.disease_case USING btree (disease_type_code);


--
-- Name: inspection_event_date_idx; Type: INDEX; Schema: inspect; Owner: -
--

CREATE INDEX inspection_event_date_idx ON inspect.inspection_event USING btree (event_date);


--
-- Name: maintenance_event_geom_gix; Type: INDEX; Schema: inspect; Owner: -
--

CREATE INDEX maintenance_event_geom_gix ON inspect.maintenance_event USING gist (geom);


--
-- Name: observation_indicator_idx; Type: INDEX; Schema: inspect; Owner: -
--

CREATE INDEX observation_indicator_idx ON inspect.observation_value USING btree (indicator_code);


--
-- Name: threshold_indicator_idx; Type: INDEX; Schema: standard; Owner: -
--

CREATE INDEX threshold_indicator_idx ON standard.indicator_threshold USING btree (indicator_code);


--
-- Name: bridge bridge_segment_id_fkey; Type: FK CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.bridge
    ADD CONSTRAINT bridge_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES base.route_segment(segment_id) ON DELETE RESTRICT;


--
-- Name: bridge_span bridge_span_bridge_id_fkey; Type: FK CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.bridge_span
    ADD CONSTRAINT bridge_span_bridge_id_fkey FOREIGN KEY (bridge_id) REFERENCES base.bridge(bridge_id) ON DELETE CASCADE;


--
-- Name: component component_segment_id_fkey; Type: FK CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.component
    ADD CONSTRAINT component_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES base.route_segment(segment_id) ON DELETE SET NULL;


--
-- Name: component component_span_id_fkey; Type: FK CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.component
    ADD CONSTRAINT component_span_id_fkey FOREIGN KEY (span_id) REFERENCES base.bridge_span(span_id) ON DELETE SET NULL;


--
-- Name: curve_section curve_section_segment_id_fkey; Type: FK CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.curve_section
    ADD CONSTRAINT curve_section_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES base.route_segment(segment_id) ON DELETE RESTRICT;


--
-- Name: route_segment route_segment_line_id_fkey; Type: FK CONSTRAINT; Schema: base; Owner: -
--

ALTER TABLE ONLY base.route_segment
    ADD CONSTRAINT route_segment_line_id_fkey FOREIGN KEY (line_id) REFERENCES base.railway_line(line_id) ON DELETE RESTRICT;


--
-- Name: disease_alias disease_alias_type_code_fkey; Type: FK CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.disease_alias
    ADD CONSTRAINT disease_alias_type_code_fkey FOREIGN KEY (type_code) REFERENCES dict.disease_type(type_code) ON DELETE CASCADE;


--
-- Name: disease_type disease_type_parent_type_code_fkey; Type: FK CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.disease_type
    ADD CONSTRAINT disease_type_parent_type_code_fkey FOREIGN KEY (parent_type_code) REFERENCES dict.disease_type(type_code) ON DELETE RESTRICT;


--
-- Name: indicator indicator_disease_type_code_fkey; Type: FK CONSTRAINT; Schema: dict; Owner: -
--

ALTER TABLE ONLY dict.indicator
    ADD CONSTRAINT indicator_disease_type_code_fkey FOREIGN KEY (disease_type_code) REFERENCES dict.disease_type(type_code) ON DELETE SET NULL;


--
-- Name: disease_case disease_case_bridge_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_bridge_id_fkey FOREIGN KEY (bridge_id) REFERENCES base.bridge(bridge_id) ON DELETE SET NULL;


--
-- Name: disease_case disease_case_component_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_component_id_fkey FOREIGN KEY (component_id) REFERENCES base.component(component_id) ON DELETE SET NULL;


--
-- Name: disease_case disease_case_curve_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_curve_id_fkey FOREIGN KEY (curve_id) REFERENCES base.curve_section(curve_id) ON DELETE SET NULL;


--
-- Name: disease_case disease_case_disease_type_code_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_disease_type_code_fkey FOREIGN KEY (disease_type_code) REFERENCES dict.disease_type(type_code) ON DELETE RESTRICT;


--
-- Name: disease_case disease_case_first_seen_event_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_first_seen_event_id_fkey FOREIGN KEY (first_seen_event_id) REFERENCES inspect.inspection_event(event_id) ON DELETE SET NULL;


--
-- Name: disease_case disease_case_segment_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES base.route_segment(segment_id) ON DELETE SET NULL;


--
-- Name: disease_case disease_case_span_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_case
    ADD CONSTRAINT disease_case_span_id_fkey FOREIGN KEY (span_id) REFERENCES base.bridge_span(span_id) ON DELETE SET NULL;


--
-- Name: disease_relation disease_relation_source_case_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_relation
    ADD CONSTRAINT disease_relation_source_case_id_fkey FOREIGN KEY (source_case_id) REFERENCES inspect.disease_case(case_id) ON DELETE CASCADE;


--
-- Name: disease_relation disease_relation_target_case_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.disease_relation
    ADD CONSTRAINT disease_relation_target_case_id_fkey FOREIGN KEY (target_case_id) REFERENCES inspect.disease_case(case_id) ON DELETE CASCADE;


--
-- Name: inspection_event inspection_event_segment_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.inspection_event
    ADD CONSTRAINT inspection_event_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES base.route_segment(segment_id) ON DELETE SET NULL;


--
-- Name: maintenance_event maintenance_event_case_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.maintenance_event
    ADD CONSTRAINT maintenance_event_case_id_fkey FOREIGN KEY (case_id) REFERENCES inspect.disease_case(case_id) ON DELETE SET NULL;


--
-- Name: maintenance_event maintenance_event_segment_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.maintenance_event
    ADD CONSTRAINT maintenance_event_segment_id_fkey FOREIGN KEY (segment_id) REFERENCES base.route_segment(segment_id) ON DELETE SET NULL;


--
-- Name: observation_value observation_value_case_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.observation_value
    ADD CONSTRAINT observation_value_case_id_fkey FOREIGN KEY (case_id) REFERENCES inspect.disease_case(case_id) ON DELETE CASCADE;


--
-- Name: observation_value observation_value_event_id_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.observation_value
    ADD CONSTRAINT observation_value_event_id_fkey FOREIGN KEY (event_id) REFERENCES inspect.inspection_event(event_id) ON DELETE CASCADE;


--
-- Name: observation_value observation_value_indicator_code_fkey; Type: FK CONSTRAINT; Schema: inspect; Owner: -
--

ALTER TABLE ONLY inspect.observation_value
    ADD CONSTRAINT observation_value_indicator_code_fkey FOREIGN KEY (indicator_code) REFERENCES dict.indicator(indicator_code) ON DELETE RESTRICT;


--
-- Name: sensor_file sensor_file_event_id_fkey; Type: FK CONSTRAINT; Schema: response; Owner: -
--

ALTER TABLE ONLY response.sensor_file
    ADD CONSTRAINT sensor_file_event_id_fkey FOREIGN KEY (event_id) REFERENCES inspect.inspection_event(event_id) ON DELETE SET NULL;


--
-- Name: raw_observation raw_observation_batch_id_fkey; Type: FK CONSTRAINT; Schema: staging; Owner: -
--

ALTER TABLE ONLY staging.raw_observation
    ADD CONSTRAINT raw_observation_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES staging.import_batch(batch_id) ON DELETE CASCADE;


--
-- Name: indicator_threshold indicator_threshold_document_id_fkey; Type: FK CONSTRAINT; Schema: standard; Owner: -
--

ALTER TABLE ONLY standard.indicator_threshold
    ADD CONSTRAINT indicator_threshold_document_id_fkey FOREIGN KEY (document_id) REFERENCES standard.source_document(document_id) ON DELETE SET NULL;


--
-- Name: indicator_threshold indicator_threshold_indicator_code_fkey; Type: FK CONSTRAINT; Schema: standard; Owner: -
--

ALTER TABLE ONLY standard.indicator_threshold
    ADD CONSTRAINT indicator_threshold_indicator_code_fkey FOREIGN KEY (indicator_code) REFERENCES dict.indicator(indicator_code) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict aTRy3cg5HJRrbx3NiE54ZQ7W2F6fuNYTD1sR6wF1ZO8mCZNNLIVgN3xjDBAUSic

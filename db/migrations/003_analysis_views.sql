--
-- PostgreSQL database dump
--

\restrict KpQnWRW4adv0s975GwnTWoWG2C3lLXGl5TQjeiD4ZKjmfNbwZHr1feDH4dgHxo8

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
-- Name: analysis; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA analysis;


--
-- Name: dictionary_acceptance; Type: VIEW; Schema: analysis; Owner: -
--

CREATE VIEW analysis.dictionary_acceptance AS
 SELECT count(*) FILTER (WHERE mandatory_flag) AS mandatory_type_count,
    bool_and(active_flag) FILTER (WHERE mandatory_flag) AS all_mandatory_active,
    count(*) FILTER (WHERE ((type_code >= 'T01'::text) AND (type_code <= 'T99'::text))) AS track_type_count,
    count(*) FILTER (WHERE ((type_code >= 'B01'::text) AND (type_code <= 'B99'::text))) AS bridge_type_count,
    count(*) FILTER (WHERE ((type_code >= 'C01'::text) AND (type_code <= 'C99'::text))) AS interface_type_count
   FROM dict.disease_type;


--
-- Name: disease_case_latest; Type: VIEW; Schema: analysis; Owner: -
--

CREATE VIEW analysis.disease_case_latest AS
 SELECT dc.case_id,
    dc.case_code,
    dc.disease_type_code,
    dt.standard_name AS disease_type_name,
    dc.status,
    dc.severity_level,
    dc.start_chainage_m,
    dc.end_chainage_m,
    max(ie.event_date) AS latest_event_date,
    count(ov.observation_id) AS observation_count
   FROM (((inspect.disease_case dc
     JOIN dict.disease_type dt ON ((dt.type_code = dc.disease_type_code)))
     LEFT JOIN inspect.observation_value ov ON ((ov.case_id = dc.case_id)))
     LEFT JOIN inspect.inspection_event ie ON ((ie.event_id = ov.event_id)))
  GROUP BY dc.case_id, dc.case_code, dc.disease_type_code, dt.standard_name, dc.status, dc.severity_level, dc.start_chainage_m, dc.end_chainage_m;


--
-- PostgreSQL database dump complete
--

\unrestrict KpQnWRW4adv0s975GwnTWoWG2C3lLXGl5TQjeiD4ZKjmfNbwZHr1feDH4dgHxo8


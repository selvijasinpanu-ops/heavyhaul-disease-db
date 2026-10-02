--
-- PostgreSQL database dump
--

\restrict xfsfIY3ZL4JM2GI1slS9zGlHix5fZo6xvhQNyQm5aWKpsu10unR0qCEqfbj53Mx

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
-- Data for Name: disease_type; Type: TABLE DATA; Schema: dict; Owner: -
--

INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (1, 'T01', NULL, '钢轨侧磨与异常磨耗', 'track', 'Includes rail side wear, vertical wear, abnormal wear and eccentric wear.', true, true, 101, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (2, 'T02', NULL, '波磨与周期性不平顺', 'track', 'Includes short-pitch corrugation, wave wear, crushing, wavelength and wave depth development.', true, true, 102, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (3, 'T03', NULL, '钢轨顶面磨耗', 'track', 'Includes top surface wear and local top wear development.', true, true, 103, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (4, 'T04', NULL, '滚动接触疲劳', 'track', 'Includes head checks, cracks, peeling, spalling and crushing.', true, true, 104, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (5, 'T05', NULL, '轨道几何不平顺', 'track', 'Includes gauge, alignment, profile, level and twist irregularity.', true, true, 105, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (6, 'T06', NULL, '曲线超高异常', 'track', 'Includes insufficient and excessive superelevation on small-radius curves.', true, true, 106, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (7, 'T07', NULL, '扣件病害', 'track', 'Includes fastener looseness, bolt issues, pad disease and failure.', true, true, 107, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (8, 'T08', NULL, '轨枕病害', 'track', 'Includes sleeper crack, damage and voiding.', true, true, 108, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (9, 'T09', NULL, '道床与路基病害', 'track', 'Includes mud pumping, settlement, fouling, shoulder issues and drainage problems.', true, true, 109, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (10, 'B01', NULL, '梁体裂缝', 'bridge', 'Includes longitudinal, transverse, oblique and web cracks.', true, true, 201, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (11, 'B02', NULL, '混凝土劣化', 'bridge', 'Includes carbonation, alkali-aggregate reaction, exposed reinforcement and corrosion.', true, true, 202, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (12, 'B03', NULL, '梁体变形', 'bridge', 'Includes deflection, cracking, torsion and lateral displacement.', true, true, 203, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (13, 'B04', NULL, '支座病害', 'bridge', 'Includes aging, cracking, offset, disengagement and abnormal deformation.', true, true, 204, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (14, 'B05', NULL, '墩台病害', 'bridge', 'Includes cracks, inclination, settlement and scour.', true, true, 205, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (15, 'B06', NULL, '桥梁附属结构病害', 'bridge', 'Includes expansion joints, drainage, inspection facilities, coating and corrosion.', true, true, 206, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (16, 'C01', NULL, '线桥空间协同病害', 'interface', 'Includes track eccentricity and beam-track relative displacement.', true, true, 301, '2026-08-11 11:31:13.896682+08');
INSERT INTO dict.disease_type (disease_type_id, type_code, parent_type_code, standard_name, disease_domain, description, mandatory_flag, active_flag, sort_order, created_at) VALUES (17, 'C02', NULL, '桥端过渡病害', 'interface', 'Includes bridge-end step, stiffness transition and subgrade-abutment transition protrusion.', true, true, 302, '2026-08-11 11:31:13.896682+08');


--
-- Data for Name: disease_alias; Type: TABLE DATA; Schema: dict; Owner: -
--

INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (1, 'T01', '钢轨侧磨', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (2, 'T01', '异常磨耗', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (3, 'T01', '垂磨', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (4, 'T01', '偏磨', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (5, 'T02', '波磨', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (6, 'T02', '周期性不平顺', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (7, 'T02', '压溃', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (8, 'T02', '波深', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (9, 'T03', '钢轨顶面磨耗', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (10, 'T03', '踏面磨耗', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (11, 'T04', '滚动接触疲劳', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (12, 'T04', '裂纹', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (13, 'T04', '剥离', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (14, 'T04', '掉块', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (15, 'T05', '轨距', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (16, 'T05', '轨向', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (17, 'T05', '高低', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (18, 'T05', '水平', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (19, 'T05', '扭曲', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (20, 'T06', '欠超高', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (21, 'T06', '过超高', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (22, 'T06', '曲线加宽异常', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (23, 'T07', '扣件', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (24, 'T07', '螺栓', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (25, 'T07', '垫板', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (26, 'T08', '轨枕裂缝', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (27, 'T08', '轨枕破损', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (28, 'T08', '空吊', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (29, 'T09', '翻浆', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (30, 'T09', '沉降', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (31, 'T09', '道床脏污', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (32, 'T09', '排水不良', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (33, 'B01', '梁体裂缝', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (34, 'B02', '混凝土劣化', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (35, 'B03', '梁体变形', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (36, 'B04', '支座病害', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (37, 'B05', '墩台病害', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (38, 'B06', '桥梁附属结构病害', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (39, 'C01', '线桥偏心', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (40, 'C01', '梁轨相对位移', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (41, 'C02', '桥端错台', NULL);
INSERT INTO dict.disease_alias (alias_id, type_code, source_name, source_note) VALUES (42, 'C02', '刚度突变', NULL);


--
-- Data for Name: indicator; Type: TABLE DATA; Schema: dict; Owner: -
--



--
-- Data for Name: source_document; Type: TABLE DATA; Schema: standard; Owner: -
--

INSERT INTO standard.source_document (document_id, document_code, document_title, document_type, version_label, issue_year, source_uri, checksum_sha256, note, created_at) VALUES (1, 'TB-10625-2017', 'Code for Design of Heavy Haul Railway', 'standard', '2017', 2017, NULL, NULL, 'Referenced by project conversation; exact clause thresholds pending verification.', '2026-08-11 11:31:13.901215+08');
INSERT INTO standard.source_document (document_id, document_code, document_title, document_type, version_label, issue_year, source_uri, checksum_sha256, note, created_at) VALUES (2, 'TBT-3355-2023', 'Railway rolling stock - Dynamic inspection of wheel/rail contact state', 'standard', '2023', 2023, NULL, NULL, 'Referenced by project conversation; exact clause thresholds pending verification.', '2026-08-11 11:31:13.901215+08');
INSERT INTO standard.source_document (document_id, document_code, document_title, document_type, version_label, issue_year, source_uri, checksum_sha256, note, created_at) VALUES (3, 'GBT-5599-2019', 'Specification for dynamic performance assessment and testing verification of railway vehicles', 'standard', '2019', 2019, NULL, NULL, 'Referenced by project conversation; exact clause thresholds pending verification.', '2026-08-11 11:31:13.901215+08');
INSERT INTO standard.source_document (document_id, document_code, document_title, document_type, version_label, issue_year, source_uri, checksum_sha256, note, created_at) VALUES (4, 'RAILWAY-LINE-MAINTENANCE-RULES', 'Railway line maintenance rules and inspection references', 'rule', NULL, NULL, NULL, NULL, 'Operational rule set pending local authoritative files.', '2026-08-11 11:31:13.901215+08');
INSERT INTO standard.source_document (document_id, document_code, document_title, document_type, version_label, issue_year, source_uri, checksum_sha256, note, created_at) VALUES (5, 'TBT-2820-SERIES', 'Railway bridge concrete deterioration assessment references', 'standard', NULL, NULL, NULL, NULL, 'Series reference pending exact part numbers and clauses.', '2026-08-11 11:31:13.901215+08');


--
-- Data for Name: indicator_threshold; Type: TABLE DATA; Schema: standard; Owner: -
--



--
-- Name: disease_alias_alias_id_seq; Type: SEQUENCE SET; Schema: dict; Owner: -
--

SELECT pg_catalog.setval('dict.disease_alias_alias_id_seq', 84, true);


--
-- Name: disease_type_disease_type_id_seq; Type: SEQUENCE SET; Schema: dict; Owner: -
--

SELECT pg_catalog.setval('dict.disease_type_disease_type_id_seq', 34, true);


--
-- Name: indicator_indicator_id_seq; Type: SEQUENCE SET; Schema: dict; Owner: -
--

SELECT pg_catalog.setval('dict.indicator_indicator_id_seq', 1, false);


--
-- Name: indicator_threshold_threshold_id_seq; Type: SEQUENCE SET; Schema: standard; Owner: -
--

SELECT pg_catalog.setval('standard.indicator_threshold_threshold_id_seq', 1, false);


--
-- Name: source_document_document_id_seq; Type: SEQUENCE SET; Schema: standard; Owner: -
--

SELECT pg_catalog.setval('standard.source_document_document_id_seq', 10, true);


--
-- PostgreSQL database dump complete
--

\unrestrict xfsfIY3ZL4JM2GI1slS9zGlHix5fZo6xvhQNyQm5aWKpsu10unR0qCEqfbj53Mx


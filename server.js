const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const rootDir = __dirname;

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 8,
  idleTimeoutMillis: 30000
});

const app = express();
const port = Number(process.env.PORT || 3100);

if (!process.env.PGPASSWORD) {
  console.error("数据库启动检查失败: 缺少 PGPASSWORD 环境变量");
  process.exit(1);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(rootDir, "public")));
app.use("/vendor/lucide", express.static(path.join(rootDir, "node_modules", "lucide", "dist", "umd")));

function textOrNull(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function numberOrNull(value) {
  const text = textOrNull(value);
  if (text === null) return null;
  const parsed = Number(text);
  if (!Number.isFinite(parsed)) {
    const err = new Error(`Invalid number: ${value}`);
    err.status = 400;
    throw err;
  }
  return parsed;
}

function dateRequired(value, label) {
  const text = textOrNull(value);
  if (!text) {
    const err = new Error(`${label} is required`);
    err.status = 400;
    throw err;
  }
  return text;
}

function requiredText(value, label) {
  const text = textOrNull(value);
  if (!text) {
    const err = new Error(`${label} is required`);
    err.status = 400;
    throw err;
  }
  return text;
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function insertAndReturn(sql, params) {
  const result = await pool.query(sql, params);
  return result.rows[0];
}

function geometryExpression(params, body, options = {}) {
  const geomText = textOrNull(body.geom_text);
  if (!geomText) return "NULL";

  const format = (textOrNull(body.geom_format) || "geojson").toLowerCase();
  const srid = numberOrNull(body.geom_srid) ?? numberOrNull(body.srid) ?? 0;
  const zDefault = numberOrNull(body.geom_z_default) ?? 0;
  const mDefault =
    numberOrNull(body.geom_m_default) ??
    numberOrNull(body.start_chainage_m) ??
    numberOrNull(body.chainage_m) ??
    0;

  params.push(geomText);
  const geomIndex = params.length;
  params.push(zDefault);
  const zIndex = params.length;
  params.push(mDefault);
  const mIndex = params.length;
  params.push(srid);
  const sridIndex = params.length;

  let base;
  if (format === "wkt") {
    base = `ST_GeomFromText($${geomIndex})`;
  } else if (format === "ewkt") {
    base = `ST_GeomFromEWKT($${geomIndex})`;
  } else {
    base = `ST_GeomFromGeoJSON($${geomIndex})`;
  }

  const forced = `ST_SetSRID(ST_Force4D(${base}, $${zIndex}, $${mIndex}), $${sridIndex})`;
  return options.multi ? `ST_Multi(${forced})` : forced;
}

const spatialLayers = {
  railway_line: {
    table: "base.railway_line",
    id: "line_id",
    code: "line_code",
    name: "line_name",
    geom: "geom",
    title: "线路",
    multi: true
  },
  route_segment: {
    table: "base.route_segment",
    id: "segment_id",
    code: "segment_code",
    name: "segment_name",
    geom: "geom",
    title: "区段"
  },
  curve_section: {
    table: "base.curve_section",
    id: "curve_id",
    code: "curve_code",
    name: "curve_name",
    geom: "geom",
    title: "曲线"
  },
  bridge: {
    table: "base.bridge",
    id: "bridge_id",
    code: "bridge_code",
    name: "bridge_name",
    geom: "geom",
    title: "桥梁"
  },
  bridge_span: {
    table: "base.bridge_span",
    id: "span_id",
    code: "span_code",
    name: "span_code",
    geom: "geom",
    title: "桥跨"
  },
  component: {
    table: "base.component",
    id: "component_id",
    code: "component_code",
    name: "component_name",
    geom: "geom",
    title: "构件"
  },
  disease_case: {
    table: "inspect.disease_case",
    id: "case_id",
    code: "case_code",
    name: "case_code",
    geom: "geom",
    title: "病害"
  },
  maintenance_event: {
    table: "inspect.maintenance_event",
    id: "maintenance_id",
    code: "maintenance_code",
    name: "maintenance_type",
    geom: "geom",
    title: "维修"
  }
};

app.get("/api/health", async (_req, res, next) => {
  try {
    const [db] = await query("SELECT current_database() AS database, current_user AS user, postgis_lib_version() AS postgis");
    const [acceptance] = await query("SELECT * FROM analysis.dictionary_acceptance");
    const tables = await query(`
      SELECT table_schema, count(*)::int AS table_count
      FROM information_schema.tables
      WHERE table_schema IN ('base','dict','inspect','response','standard','analysis','staging')
      GROUP BY table_schema
      ORDER BY table_schema
    `);
    res.json({ db, acceptance, tables });
  } catch (error) {
    next(error);
  }
});

app.get("/api/options", async (_req, res, next) => {
  try {
    const [diseaseTypes, indicators, lines, segments, curves, bridges, spans, components, events, cases] = await Promise.all([
      query("SELECT type_code, standard_name, disease_domain FROM dict.disease_type WHERE active_flag ORDER BY sort_order"),
      query("SELECT indicator_code, standard_name, unit, disease_type_code FROM dict.indicator ORDER BY indicator_code"),
      query("SELECT line_id, line_code, line_name FROM base.railway_line ORDER BY line_code"),
      query("SELECT segment_id, segment_code, segment_name, start_chainage_m, end_chainage_m FROM base.route_segment ORDER BY segment_code"),
      query("SELECT curve_id, curve_code, curve_name, radius_m FROM base.curve_section ORDER BY curve_code"),
      query("SELECT bridge_id, bridge_code, bridge_name FROM base.bridge ORDER BY bridge_code"),
      query("SELECT span_id, span_code, span_no FROM base.bridge_span ORDER BY span_code"),
      query("SELECT component_id, component_code, component_type, component_name FROM base.component ORDER BY component_code"),
      query("SELECT event_id, event_code, event_date FROM inspect.inspection_event ORDER BY event_date DESC, event_id DESC LIMIT 200"),
      query("SELECT case_id, case_code, disease_type_code, status FROM inspect.disease_case ORDER BY case_id DESC LIMIT 200")
    ]);
    res.json({ diseaseTypes, indicators, lines, segments, curves, bridges, spans, components, events, cases });
  } catch (error) {
    next(error);
  }
});

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const summary = await query(`
      SELECT
        (SELECT count(*)::int FROM base.railway_line) AS line_count,
        (SELECT count(*)::int FROM base.route_segment) AS segment_count,
        (SELECT count(*)::int FROM inspect.inspection_event) AS event_count,
        (SELECT count(*)::int FROM inspect.disease_case) AS case_count,
        (SELECT count(*)::int FROM inspect.observation_value) AS observation_count
    `);
    const byDomain = await query(`
      SELECT dt.disease_domain, count(dc.case_id)::int AS case_count
      FROM dict.disease_type dt
      LEFT JOIN inspect.disease_case dc ON dc.disease_type_code = dt.type_code
      GROUP BY dt.disease_domain
      ORDER BY dt.disease_domain
    `);
    const recentCases = await query(`
      SELECT case_id, case_code, disease_type_code, disease_type_name, status, severity_level,
             start_chainage_m, end_chainage_m, latest_event_date, observation_count
      FROM analysis.disease_case_latest
      ORDER BY coalesce(latest_event_date, date '1900-01-01') DESC, case_id DESC
      LIMIT 50
    `);
    res.json({ summary: summary[0], byDomain, recentCases });
  } catch (error) {
    next(error);
  }
});

app.post("/api/railway-lines", async (req, res, next) => {
  try {
    const params = [
      requiredText(req.body.line_code, "line_code"),
      requiredText(req.body.line_name, "line_name"),
      textOrNull(req.body.operator_name),
      numberOrNull(req.body.design_speed_kmh),
      numberOrNull(req.body.gauge_mm),
      textOrNull(req.body.source_name)
    ];
    const geom = geometryExpression(params, req.body, { multi: true });
    const row = await insertAndReturn(`
      INSERT INTO base.railway_line (line_code, line_name, operator_name, design_speed_kmh, gauge_mm, source_name, geom)
      VALUES ($1,$2,$3,$4,$5,$6,${geom})
      RETURNING *
    `, params);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

app.post("/api/route-segments", async (req, res, next) => {
  try {
    const params = [
      numberOrNull(req.body.line_id),
      requiredText(req.body.segment_code, "segment_code"),
      textOrNull(req.body.segment_name),
      numberOrNull(req.body.start_chainage_m),
      numberOrNull(req.body.end_chainage_m),
      textOrNull(req.body.start_chainage_text),
      textOrNull(req.body.end_chainage_text),
      textOrNull(req.body.direction)
    ];
    const geom = geometryExpression(params, req.body);
    const row = await insertAndReturn(`
      INSERT INTO base.route_segment
        (line_id, segment_code, segment_name, start_chainage_m, end_chainage_m, start_chainage_text, end_chainage_text, direction, geom)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${geom})
      RETURNING *
    `, params);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

app.post("/api/curve-sections", async (req, res, next) => {
  try {
    const params = [
      numberOrNull(req.body.segment_id),
      requiredText(req.body.curve_code, "curve_code"),
      textOrNull(req.body.curve_name),
      numberOrNull(req.body.radius_m),
      numberOrNull(req.body.superelevation_mm),
      numberOrNull(req.body.transition_curve_length_m),
      numberOrNull(req.body.start_chainage_m),
      numberOrNull(req.body.end_chainage_m)
    ];
    const geom = geometryExpression(params, req.body);
    const row = await insertAndReturn(`
      INSERT INTO base.curve_section
        (segment_id, curve_code, curve_name, radius_m, superelevation_mm, transition_curve_length_m, start_chainage_m, end_chainage_m, geom)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${geom})
      RETURNING *
    `, params);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

app.post("/api/bridges", async (req, res, next) => {
  try {
    const params = [
      numberOrNull(req.body.segment_id),
      requiredText(req.body.bridge_code, "bridge_code"),
      textOrNull(req.body.bridge_name),
      textOrNull(req.body.bridge_type),
      numberOrNull(req.body.start_chainage_m),
      numberOrNull(req.body.end_chainage_m)
    ];
    const geom = geometryExpression(params, req.body);
    const row = await insertAndReturn(`
      INSERT INTO base.bridge
        (segment_id, bridge_code, bridge_name, bridge_type, start_chainage_m, end_chainage_m, geom)
      VALUES ($1,$2,$3,$4,$5,$6,${geom})
      RETURNING *
    `, params);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

app.post("/api/inspection-events", async (req, res, next) => {
  try {
    const row = await insertAndReturn(`
      INSERT INTO inspect.inspection_event
        (event_code, segment_id, event_date, inspection_method, organization, weather, source_file_uri, source_checksum_sha256, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, [
      requiredText(req.body.event_code, "event_code"),
      numberOrNull(req.body.segment_id),
      dateRequired(req.body.event_date, "event_date"),
      textOrNull(req.body.inspection_method),
      textOrNull(req.body.organization),
      textOrNull(req.body.weather),
      textOrNull(req.body.source_file_uri),
      textOrNull(req.body.source_checksum_sha256),
      textOrNull(req.body.note)
    ]);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

app.post("/api/disease-cases", async (req, res, next) => {
  try {
    const params = [
      requiredText(req.body.case_code, "case_code"),
      requiredText(req.body.disease_type_code, "disease_type_code"),
      numberOrNull(req.body.segment_id),
      numberOrNull(req.body.curve_id),
      numberOrNull(req.body.bridge_id),
      numberOrNull(req.body.span_id),
      numberOrNull(req.body.component_id),
      numberOrNull(req.body.start_chainage_m),
      numberOrNull(req.body.end_chainage_m),
      textOrNull(req.body.chainage_text),
      textOrNull(req.body.status),
      textOrNull(req.body.severity_level),
      textOrNull(req.body.note)
    ];
    const geom = geometryExpression(params, req.body);
    const row = await insertAndReturn(`
      INSERT INTO inspect.disease_case
        (case_code, disease_type_code, segment_id, curve_id, bridge_id, span_id, component_id,
         start_chainage_m, end_chainage_m, chainage_text, status, severity_level, note, geom)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,coalesce($11,'open'),$12,$13,${geom})
      RETURNING *
    `, params);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

app.post("/api/observation-values", async (req, res, next) => {
  try {
    const applicable = req.body.applicable_flag === false || req.body.applicable_flag === "false" ? false : true;
    const row = await insertAndReturn(`
      INSERT INTO inspect.observation_value
        (event_id, case_id, indicator_code, observed_at, raw_value, text_value, unit,
         native_grade, unified_level, applicable_flag, missing_reason, source_quality_flag, note)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,coalesce($12,'B'),$13)
      RETURNING *
    `, [
      numberOrNull(req.body.event_id),
      numberOrNull(req.body.case_id),
      requiredText(req.body.indicator_code, "indicator_code"),
      textOrNull(req.body.observed_at),
      numberOrNull(req.body.raw_value),
      textOrNull(req.body.text_value),
      textOrNull(req.body.unit),
      textOrNull(req.body.native_grade),
      textOrNull(req.body.unified_level),
      applicable,
      textOrNull(req.body.missing_reason),
      textOrNull(req.body.source_quality_flag),
      textOrNull(req.body.note)
    ]);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

app.post("/api/indicators", async (req, res, next) => {
  try {
    const row = await insertAndReturn(`
      INSERT INTO dict.indicator
        (indicator_code, disease_type_code, standard_name, source_name, unit, decimal_scale, value_kind, required_level, trend_direction, definition)
      VALUES ($1,$2,$3,$4,$5,coalesce($6,3),$7,$8,$9,$10)
      RETURNING *
    `, [
      requiredText(req.body.indicator_code, "indicator_code"),
      textOrNull(req.body.disease_type_code),
      requiredText(req.body.standard_name, "standard_name"),
      textOrNull(req.body.source_name),
      textOrNull(req.body.unit),
      numberOrNull(req.body.decimal_scale),
      requiredText(req.body.value_kind || "raw", "value_kind"),
      requiredText(req.body.required_level || "optional", "required_level"),
      textOrNull(req.body.trend_direction),
      textOrNull(req.body.definition)
    ]);
    res.status(201).json(row);
  } catch (error) {
    next(error);
  }
});

app.get("/api/gis/config", async (_req, res, next) => {
  try {
    const [config] = await query(`
      SELECT project_name, subject_name, db_version, railway_crs_note,
             projected_srid, file_storage_root, updated_at
      FROM base.project_config
      WHERE id = true
    `);
    const columns = await query(`
      SELECT f_table_schema, f_table_name, f_geometry_column, coord_dimension, srid, type
      FROM geometry_columns
      ORDER BY f_table_schema, f_table_name
    `);
    res.json({ config, columns });
  } catch (error) {
    next(error);
  }
});

app.post("/api/gis/config", async (req, res, next) => {
  try {
    const row = await insertAndReturn(`
      UPDATE base.project_config
      SET projected_srid = $1,
          railway_crs_note = $2,
          file_storage_root = $3,
          updated_at = now()
      WHERE id = true
      RETURNING project_name, subject_name, db_version, railway_crs_note,
                projected_srid, file_storage_root, updated_at
    `, [
      numberOrNull(req.body.projected_srid),
      textOrNull(req.body.railway_crs_note),
      textOrNull(req.body.file_storage_root)
    ]);
    res.json(row);
  } catch (error) {
    next(error);
  }
});

app.get("/api/gis/layers", async (_req, res, next) => {
  try {
    const layers = {};
    for (const [key, layer] of Object.entries(spatialLayers)) {
      const rows = await query(`
        SELECT
          ${layer.id} AS id,
          ${layer.code} AS code,
          ${layer.name} AS name,
          ST_SRID(${layer.geom}) AS srid,
          ST_GeometryType(${layer.geom}) AS geometry_type,
          ST_AsGeoJSON(ST_Force2D(${layer.geom}))::json AS geometry
        FROM ${layer.table}
        WHERE ${layer.geom} IS NOT NULL
        ORDER BY ${layer.id} DESC
        LIMIT 500
      `);
      layers[key] = {
        title: layer.title,
        features: rows.map((row) => ({
          type: "Feature",
          geometry: row.geometry,
          properties: {
            id: row.id,
            code: row.code,
            name: row.name,
            srid: row.srid,
            geometry_type: row.geometry_type
          }
        }))
      };
    }
    res.json({ layers });
  } catch (error) {
    next(error);
  }
});

app.post("/api/gis/geometries", async (req, res, next) => {
  try {
    const layer = spatialLayers[textOrNull(req.body.layer)];
    if (!layer) {
      const err = new Error("Invalid GIS layer");
      err.status = 400;
      throw err;
    }

    const recordId = numberOrNull(req.body.record_id);
    if (recordId === null) {
      const err = new Error("record_id is required");
      err.status = 400;
      throw err;
    }

    const params = [];
    const geom = geometryExpression(params, req.body, { multi: layer.multi });
    if (geom === "NULL") {
      const err = new Error("geom_text is required");
      err.status = 400;
      throw err;
    }
    params.push(recordId);
    const idIndex = params.length;

    const row = await insertAndReturn(`
      UPDATE ${layer.table}
      SET ${layer.geom} = ${geom}
      WHERE ${layer.id} = $${idIndex}
      RETURNING ${layer.id} AS id,
                ${layer.code} AS code,
                ST_SRID(${layer.geom}) AS srid,
                ST_AsEWKT(${layer.geom}) AS ewkt
    `, params);

    if (!row) {
      const err = new Error("Record not found");
      err.status = 404;
      throw err;
    }
    res.json(row);
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    error: error.message,
    detail: error.detail || null,
    code: error.code || null
  });
});

async function startServer() {
  try {
    const result = await pool.query(`
      SELECT
        current_database() AS database,
        current_user AS "user",
        postgis_lib_version() AS postgis
    `);
    const db = result.rows[0];

    app.listen(port, "127.0.0.1", () => {
      console.log("数据库连接成功");
      console.log(`数据库: ${db.database}`);
      console.log(`用户: ${db.user}`);
      console.log(`PostGIS: ${db.postgis}`);
      console.log(`网页已启动: http://localhost:${port}`);
    });
  } catch (error) {
    console.error("数据库启动检查失败:", error.message);
    process.exit(1);
  }
}

startServer();

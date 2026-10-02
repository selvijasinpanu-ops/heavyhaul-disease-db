const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const dotenv = require("dotenv");
const { Pool } = require("pg");

if (process.env.B13_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

const projectRoot = path.join(__dirname, "..");
const migrationsDir = process.env.MIGRATIONS_DIR ? path.resolve(process.env.MIGRATIONS_DIR) : path.join(projectRoot, "db", "migrations");
const sync = process.argv.includes("--sync");

const migrations = [
  { id: 1, file: "001_baseline_schema.sql", check: check001 },
  { id: 2, file: "002_dictionary_seed.sql", check: check002 },
  { id: 3, file: "003_analysis_views.sql", check: check003 },
  { id: 4, file: "004_case_import_and_evaluation_framework.sql", check: check004 },
  { id: 5, file: "005_migration_registry.sql", check: check005 },
  { id: 6, file: "006_b13_staging_quality_corrections.sql", check: check006 }
];

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 2
});

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

async function scalar(sql, params = []) {
  const result = await pool.query(sql, params);
  const row = result.rows[0] || {};
  return Object.values(row)[0];
}

async function objectExists(name) {
  return Boolean(await scalar("SELECT to_regclass($1) IS NOT NULL", [name]));
}

async function check001() {
  const needed = [
    "base.railway_line",
    "base.route_segment",
    "base.curve_section",
    "base.bridge",
    "dict.disease_type",
    "dict.indicator",
    "inspect.disease_case",
    "inspect.observation_value",
    "standard.source_document",
    "staging.import_batch",
    "staging.raw_observation"
  ];
  const exists = await Promise.all(needed.map(objectExists));
  const postgis = await scalar("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis')");
  return {
    applied: exists.every(Boolean) && Boolean(postgis),
    note: `baseline_objects=${exists.filter(Boolean).length}/${needed.length}; postgis=${postgis}`
  };
}

async function check002() {
  const row = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM dict.disease_type WHERE mandatory_flag) AS disease_types,
      (SELECT count(*)::int FROM standard.source_document) AS source_documents
  `)).rows[0];
  return {
    applied: row.disease_types >= 17 && row.source_documents >= 5,
    note: `disease_types=${row.disease_types}; source_documents=${row.source_documents}`
  };
}

async function check003() {
  const acceptance = await objectExists("analysis.dictionary_acceptance");
  const latest = await objectExists("analysis.disease_case_latest");
  return {
    applied: acceptance && latest,
    note: `dictionary_acceptance=${acceptance}; disease_case_latest=${latest}`
  };
}

async function check004() {
  const needed = [
    "dict.disease_indicator",
    "standard.threshold_rule",
    "standard.threshold_band",
    "standard.grade_mapping",
    "standard.coupling_rule",
    "staging.ulanmulun_b13_raw",
    "inspect.crack_detail",
    "inspect.media_attachment",
    "inspect.case_attachment",
    "analysis.evaluation_result",
    "maintenance.work_order"
  ];
  const exists = await Promise.all(needed.map(objectExists));
  const row = (await pool.query(`
    SELECT
      (SELECT count(*)::int FROM dict.indicator) AS indicators,
      (SELECT count(*)::int FROM dict.disease_indicator) AS disease_indicators,
      (SELECT mandatory_without_primary_indicator_count::int FROM analysis.dictionary_acceptance) AS without_primary
  `)).rows[0];
  return {
    applied: exists.every(Boolean) && row.indicators >= 27 && row.disease_indicators >= 27 && row.without_primary === 0,
    note: `framework_objects=${exists.filter(Boolean).length}/${needed.length}; indicators=${row.indicators}; disease_indicators=${row.disease_indicators}; without_primary=${row.without_primary}`
  };
}

async function check005() {
  const table = await objectExists("public.schema_migration");
  return {
    applied: table,
    note: `schema_migration=${table}`
  };
}

async function check006() {
  const table = await objectExists("staging.media_anchor_candidate");
  return { applied: table, note: `media_anchor_candidate=${table}` };
}

async function registryRows() {
  if (!(await objectExists("public.schema_migration"))) return new Map();
  const result = await pool.query("SELECT migration_id, migration_name, checksum_sha256, execution_status, applied_at FROM public.schema_migration ORDER BY migration_id");
  const duplicateIds = result.rows.filter((row, index) => result.rows.findIndex((candidate) => candidate.migration_id === row.migration_id) !== index);
  if (duplicateIds.length) throw new Error("Migration registry contains duplicate migration_id values");
  return new Map(result.rows.map((row) => [row.migration_id, row]));
}

async function syncRegistry(statuses) {
  for (const status of statuses) {
    if (!status.database_applied || status.registry_status !== "not_registered") continue;
    const existingByName = await pool.query("SELECT migration_id FROM public.schema_migration WHERE migration_name = $1", [status.migration_name]);
    if (existingByName.rows.length && existingByName.rows[0].migration_id !== status.migration_id) {
      throw new Error(`Migration name ${status.migration_name} is already registered with id ${existingByName.rows[0].migration_id}`);
    }
    await pool.query(`
      INSERT INTO public.schema_migration
        (migration_id, migration_name, checksum_sha256, applied_by, execution_status, execution_note)
      VALUES ($1, $2, $3, current_user, 'applied', $4)
      ON CONFLICT (migration_id) DO NOTHING
    `, [status.migration_id, status.migration_name, status.file_checksum_sha256, status.database_note]);
  }
}

async function main() {
  const registryBefore = await registryRows();
  const statuses = [];

  for (const migration of migrations) {
    const filePath = path.join(migrationsDir, migration.file);
    const fileExists = fs.existsSync(filePath);
    const fileChecksum = fileExists ? sha256(filePath) : null;
    const dbCheck = await migration.check();
    const registered = registryBefore.get(migration.id) || null;
    statuses.push({
      migration_id: migration.id,
      migration_name: migration.file,
      file_exists: fileExists,
      file_checksum_sha256: fileChecksum,
      database_applied: dbCheck.applied,
      database_note: dbCheck.note,
      registry_status: registered ? registered.execution_status : "not_registered",
      registry_checksum_sha256: registered ? registered.checksum_sha256 : null,
      checksum_matches_registry: registered ? registered.checksum_sha256 === fileChecksum : false
    });
  }

  const integrityErrors = [];
  const seenNames = new Map();
  for (const status of statuses) {
    const registered = registryBefore.get(status.migration_id);
    if (registered && registered.checksum_sha256 !== status.file_checksum_sha256) {
      integrityErrors.push(`migration_id ${status.migration_id} checksum mismatch`);
    }
    if (registered && registered.migration_name !== status.migration_name) {
      integrityErrors.push(`migration_id ${status.migration_id} migration_name mismatch`);
    }
    const prior = seenNames.get(status.migration_name);
    if (prior && prior !== status.migration_id) {
      integrityErrors.push(`migration_name ${status.migration_name} has multiple ids`);
    }
    seenNames.set(status.migration_name, status.migration_id);
  }
  if (integrityErrors.length) {
    throw new Error(`Migration registry integrity failure: ${integrityErrors.join("; ")}`);
  }

  if (sync) {
    await syncRegistry(statuses);
  }

  const registryAfter = await registryRows();
  const output = statuses.map((status) => {
    const row = registryAfter.get(status.migration_id) || null;
    return {
      ...status,
      registry_status_after: row ? row.execution_status : "not_registered",
      registry_checksum_after: row ? row.checksum_sha256 : null,
      checksum_matches_registry_after: row ? row.checksum_sha256 === status.file_checksum_sha256 : false
    };
  });

  const postSyncErrors = output.filter((status) =>
    status.database_applied && (!status.registry_checksum_after || !status.checksum_matches_registry_after)
  );
  if (postSyncErrors.length) {
    throw new Error(`Migration registry incomplete or checksum mismatch: ${postSyncErrors.map((s) => s.migration_id).join(",")}`);
  }

  console.log(JSON.stringify({
    sync,
    checked_at: new Date().toISOString(),
    migrations: output
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`Migration check failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

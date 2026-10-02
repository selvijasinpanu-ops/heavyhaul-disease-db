// Initialize a new project database only. Existing project schemas are refused.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");
const { Client } = require("pg");

const root = path.join(__dirname, "..");
if (process.env.B13_SKIP_DOTENV !== "1") dotenv.config({ path: path.join(root, ".env") });
const migrations = fs.readdirSync(path.join(root, "db", "migrations"))
  .filter((name) => /^\d{3}_.+\.sql$/.test(name)).sort();

function stripDumpGuards(sql) {
  return sql.split(/\r?\n/).filter((line) => !/^\\(?:un)?restrict\s/.test(line)).join("\n");
}

async function initialize() {
  if (!process.env.PGPASSWORD) throw new Error("Set PGPASSWORD in .env or the environment before initialization.");
  const client = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || "heavyhaul",
    user: process.env.PGUSER || "heavyhaul_admin",
    password: process.env.PGPASSWORD,
    connectionTimeoutMillis: 10000
  });
  try {
    await client.connect();
    const version = await client.query("SHOW server_version_num");
    if (Number(version.rows[0].server_version_num) < 180000) {
      throw new Error("This release targets PostgreSQL 18 or newer.");
    }
    const existing = await client.query(`
      SELECT schema_name FROM information_schema.schemata
      WHERE schema_name IN ('base','dict','inspect','response','standard','staging','analysis','maintenance')
    `);
    const registry = await client.query("SELECT to_regclass('public.schema_migration') AS existing");
    if (existing.rows.length || registry.rows[0].existing) {
      throw new Error("Initialization refused: project schemas or migration registry already exist. Use a new empty database; no existing data was changed.");
    }
    for (const name of migrations) {
      const sql = stripDumpGuards(fs.readFileSync(path.join(root, "db", "migrations", name), "utf8"));
      await client.query(sql);
      console.log(`Applied ${name}`);
    }
  } finally {
    await client.end();
  }
  const result = spawnSync(process.execPath, [path.join(__dirname, "check_migrations.js"), "--sync"], {
    cwd: root, env: process.env, stdio: "inherit"
  });
  if (result.error || result.status !== 0) throw new Error("Migration registry verification failed.");
}

if (require.main === module) {
  initialize().catch((error) => {
    console.error(`Database initialization failed: ${error.message}`);
    process.exitCode = 1;
  });
}
module.exports = { stripDumpGuards };

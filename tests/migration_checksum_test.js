const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { Pool } = require("pg");

const root = path.join(__dirname, "..");
const node = process.execPath;
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "heavyhaul_migrations_"));
const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 1
});

async function registeredChecksums() {
  const result = await pool.query("SELECT migration_id, migration_name, checksum_sha256 FROM public.schema_migration ORDER BY migration_id");
  return result.rows;
}

async function main() {
  fs.cpSync(path.join(root, "db", "migrations"), temp, { recursive: true });
  const target = path.join(temp, "006_b13_staging_quality_corrections.sql");
  fs.appendFileSync(target, "\n-- tamper test\n", "utf8");

  const before = await registeredChecksums();
  const result = spawnSync(node, ["scripts/check_migrations.js", "--sync"], {
    cwd: root,
    env: { ...process.env, B13_SKIP_DOTENV: "1", MIGRATIONS_DIR: temp },
    encoding: "utf8"
  });
  const after = await registeredChecksums();

  assert.notStrictEqual(result.status, 0, "Tampered migration must fail checksum verification");
  assert((result.stderr + result.stdout).toLowerCase().includes("checksum"));
  assert.deepStrictEqual(after, before, "Tamper failure must not change any registered migration checksum or name");
  console.log(JSON.stringify({ test: "migration_checksum_test", status: "passed", registered_rows: after.length }));
}

main()
  .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; })
  .finally(async () => {
    await pool.end();
    fs.rmSync(temp, { recursive: true, force: true });
  });

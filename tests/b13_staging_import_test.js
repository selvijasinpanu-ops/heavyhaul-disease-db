const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const dotenv = require("dotenv");
const { Pool } = require("pg");

const projectRoot = path.join(__dirname, "..");
if (process.env.B13_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.join(projectRoot, ".env") });
}

const node = process.execPath;
const artifactDir = process.env.B13_ARTIFACT_DIR ? path.resolve(process.env.B13_ARTIFACT_DIR) : path.join(projectRoot, "staging_output");
const jsonlPath = path.join(artifactDir, "b13_raw_rows.jsonl");
const mediaPath = path.join(artifactDir, "b13_media_manifest.csv");
const anchorPath = path.join(artifactDir, "b13_media_anchor_candidates.csv");

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 1
});

function run(args, env = process.env) {
  return spawnSync(node, args, {
    cwd: projectRoot,
    env,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20
  });
}

async function counts() {
  const result = await pool.query(`
    SELECT
      (SELECT count(*)::int FROM staging.import_batch WHERE source_case_code = 'B-13' AND source_system = 'FIELD_SURVEY_XLSX') AS b13_batches,
      (SELECT count(*)::int FROM staging.ulanmulun_b13_raw raw JOIN staging.import_batch b ON b.batch_id = raw.batch_id WHERE b.source_case_code = 'B-13' AND b.source_system = 'FIELD_SURVEY_XLSX') AS raw_rows,
      (SELECT count(*)::int FROM inspect.media_attachment m JOIN staging.import_batch b ON b.batch_id = m.batch_id WHERE b.source_case_code = 'B-13' AND b.source_system = 'FIELD_SURVEY_XLSX') AS media_rows,
      (SELECT count(*)::int FROM inspect.disease_case) AS disease_cases,
      (SELECT count(*)::int FROM inspect.observation_value) AS observations,
      (SELECT count(*)::int FROM analysis.evaluation_result) AS evaluations,
      (SELECT count(*)::int FROM maintenance.work_order) AS work_orders
  `);
  return result.rows[0];
}

async function main() {
  let before = await counts();
  const first = run(["scripts\\import_b13_staging.js", jsonlPath, mediaPath, anchorPath]);
  assert.strictEqual(first.status, 0, first.stderr || first.stdout);
  const afterFirst = await counts();
  assert.strictEqual(afterFirst.raw_rows, 424);
  assert.strictEqual(afterFirst.media_rows, 389);

  const second = run(["scripts\\import_b13_staging.js", jsonlPath, mediaPath, anchorPath]);
  assert.strictEqual(second.status, 0, second.stderr || second.stdout);
  const afterSecond = await counts();
  assert.deepStrictEqual(afterSecond, afterFirst, "Repeated import should not increase row counts");

  const badJsonl = path.join(os.tmpdir(), `b13_bad_${Date.now()}.jsonl`);
  fs.writeFileSync(badJsonl, "{bad json}\n", "utf8");
  const bad = run(["scripts\\import_b13_staging.js", badJsonl, mediaPath]);
  assert.notStrictEqual(bad.status, 0, "Damaged JSONL should fail");
  const afterBad = await counts();
  assert.deepStrictEqual(afterBad, afterSecond, "Damaged JSONL should not change database counts");
  fs.rmSync(badJsonl, { force: true });

  const failingEnv = { ...process.env, PGPORT: "1", PGPASSWORD: "" };
  const dbFail = run(["scripts\\import_b13_staging.js", jsonlPath, mediaPath, anchorPath], failingEnv);
  assert.notStrictEqual(dbFail.status, 0, "Database connection failure should fail clearly");
  const afterDbFail = await counts();
  assert.deepStrictEqual(afterDbFail, afterSecond, "Database failure should not change formal or staging counts");

  assert.strictEqual(afterSecond.disease_cases, before.disease_cases, "Formal disease_case count changed");
  assert.strictEqual(afterSecond.observations, before.observations, "Formal observation_value count changed");
  assert.strictEqual(afterSecond.evaluations, before.evaluations, "Formal evaluation_result count changed");
  assert.strictEqual(afterSecond.work_orders, before.work_orders, "Formal work_order count changed");

  const combinedOutput = [first.stdout, first.stderr, second.stdout, second.stderr, bad.stdout, bad.stderr, dbFail.stdout, dbFail.stderr].join("\n");
  assert(!combinedOutput.includes("PGPASSWORD"), ".env variable name leaked to logs");
  assert(!combinedOutput.toLowerCase().includes("local-db-password"), "old password file leaked to logs");

  console.log(JSON.stringify({
    test: "b13_staging_import_test",
    status: "passed",
    counts: afterSecond
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

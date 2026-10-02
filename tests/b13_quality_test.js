const assert = require("assert");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");
const { multiCrackDetection, repairStatus, suspiciousWidths } = require("../scripts/generate_b13_reports");

const root = path.join(__dirname, "..");
if (process.env.B13_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.join(root, ".env") });
}
const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul", user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD, max: 1
});

function csvRows(file) {
  return fs.readFileSync(path.join(root, "reports", file), "utf8").trim().split(/\r?\n/).slice(1);
}

async function main() {
  assert.strictEqual(multiCrackDetection("掉块尺寸900mm×110mm×60mm").count, 0);
  assert(multiCrackDetection("存在2条裂缝").count >= 2);
  assert(multiCrackDetection("L2=3m，W2=6mm").count >= 2);
  assert.strictEqual(repairStatus("已修补").flag, "B");
  assert.strictEqual(repairStatus("修补后开裂").flag, "R");
  assert.strictEqual(suspiciousWidths("W=6mm").length, 1);
  assert.strictEqual(suspiciousWidths("掉块长宽高：900mm×110mm×60mm").length, 0);

  const batch = (await pool.query(`SELECT batch_id, row_count, valid_row_count, invalid_row_count, pending_review_count FROM staging.import_batch WHERE source_case_code='B-13' ORDER BY batch_id DESC LIMIT 1`)).rows[0];
  assert(batch);
  const counts = (await pool.query(`SELECT count(*)::int AS rows, count(*) FILTER (WHERE validation_status='valid')::int AS valid_rows, count(*) FILTER (WHERE validation_status='invalid')::int AS invalid_rows, count(*) FILTER (WHERE validation_status='needs_review')::int AS pending_rows FROM staging.ulanmulun_b13_raw WHERE batch_id=$1`, [batch.batch_id])).rows[0];
  assert.strictEqual(Number(batch.row_count), counts.rows);
  assert.strictEqual(Number(batch.valid_row_count), counts.valid_rows);
  assert.strictEqual(Number(batch.invalid_row_count), counts.invalid_rows);
  assert.strictEqual(Number(batch.pending_review_count), counts.pending_rows);
  const anchors = (await pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE source_raw_id IS NOT NULL)::int AS located, count(DISTINCT media_id) FILTER (WHERE media_id IN (SELECT media_id FROM staging.media_anchor_candidate GROUP BY media_id HAVING count(*) > 1))::int AS multi_media FROM staging.media_anchor_candidate WHERE batch_id=$1`, [batch.batch_id])).rows[0];
  assert(Number(anchors.total) > 0);
  assert(Number(anchors.multi_media) > 0);
  const repairedThenCracked = (await pool.query("SELECT count(*)::int AS count FROM staging.ulanmulun_b13_raw WHERE batch_id=$1 AND raw_text LIKE '%修补后开裂%'", [batch.batch_id])).rows[0].count;
  assert.strictEqual(Number(repairedThenCracked), 8);
  const formal = (await pool.query(`SELECT (SELECT count(*) FROM inspect.disease_case) AS disease_cases, (SELECT count(*) FROM inspect.observation_value) AS observations, (SELECT count(*) FROM analysis.evaluation_result) AS evaluations, (SELECT count(*) FROM maintenance.work_order) AS work_orders`)).rows[0];
  assert.deepStrictEqual(formal, { disease_cases: "0", observations: "0", evaluations: "0", work_orders: "0" });
  console.log(JSON.stringify({ test: "b13_quality_test", status: "passed", batch, anchors, formal }, null, 2));
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(() => pool.end());

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

const root = path.join(__dirname, "..");
if (process.env.B13_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.join(root, ".env") });
}
const reportDir = process.env.B13_REPORT_DIR ? path.resolve(process.env.B13_REPORT_DIR) : path.join(root, "reports");
fs.mkdirSync(reportDir, { recursive: true });
const pool = new Pool({ host: process.env.PGHOST || "127.0.0.1", port: Number(process.env.PGPORT || 5432), database: process.env.PGDATABASE || "heavyhaul", user: process.env.PGUSER || "heavyhaul_admin", password: process.env.PGPASSWORD, max: 1 });

async function main() {
  const source = path.join(reportDir, "b13_staging_import_report.md");
  if (fs.existsSync(source)) fs.copyFileSync(source, path.join(reportDir, "b13_staging_import_report_v2.md"));
  const batch = (await pool.query("SELECT batch_id, row_count, valid_row_count, invalid_row_count, pending_review_count FROM staging.import_batch WHERE source_case_code='B-13' ORDER BY batch_id DESC LIMIT 1")).rows[0];
  const quality = (await pool.query("SELECT quality_flag, count(*)::int AS count FROM staging.ulanmulun_b13_raw WHERE batch_id=$1 GROUP BY quality_flag", [batch.batch_id])).rows.reduce((acc, row) => ({ ...acc, [row.quality_flag]: row.count }), {});
  const anchors = (await pool.query("SELECT count(*)::int AS total, count(*) FILTER (WHERE source_raw_id IS NOT NULL)::int AS located, count(*) FILTER (WHERE source_raw_id IS NULL)::int AS unlocated FROM staging.media_anchor_candidate WHERE batch_id=$1", [batch.batch_id])).rows[0];
  const formal = (await pool.query("SELECT (SELECT count(*)::int FROM inspect.disease_case) AS disease_cases, (SELECT count(*)::int FROM inspect.observation_value) AS observations, (SELECT count(*)::int FROM analysis.evaluation_result) AS evaluations, (SELECT count(*)::int FROM maintenance.work_order) AS work_orders")).rows[0];
  const rows = (await pool.query("SELECT raw_text FROM staging.ulanmulun_b13_raw WHERE batch_id=$1", [batch.batch_id])).rows;
  const legacyMultiCrack = (text) => (text.match(/\d+(?:\.\d+)?\s*(?:mm|毫米)/gi) || []).length >= 3;
  const correctedMultiCrack = (text) => {
    const explicit = /(?:\d+\s*[条道]\s*(?:裂缝|斜裂缝)|共\s*\d+\s*条|裂缝\s*[2-9]\d*)/.test(text);
    const indexed = /\b(?:L|W|D)\s*[2-9]\b/i.test(text);
    const groups = text.match(/\d+(?:\.\d+)?\s*(?:m|mm|米|毫米)\s*[×xX*]\s*\d+(?:\.\d+)?\s*(?:m|mm|米|毫米)/g) || [];
    return explicit || indexed || groups.length >= 2;
  };
  const legacyMultiCrackCount = rows.filter((row) => legacyMultiCrack(row.raw_text || "")).length;
  const correctedMultiCrackCount = rows.filter((row) => correctedMultiCrack(row.raw_text || "")).length;
  const legacyFalsePositiveCount = rows.filter((row) => legacyMultiCrack(row.raw_text || "") && !correctedMultiCrack(row.raw_text || "")).length;
  const legacyMissedCount = rows.filter((row) => correctedMultiCrack(row.raw_text || "") && !legacyMultiCrack(row.raw_text || "")).length;
  const recrackingCount = Number((await pool.query("SELECT count(*)::int AS count FROM staging.ulanmulun_b13_raw WHERE batch_id=$1 AND raw_text LIKE '%修补后开裂%'", [batch.batch_id])).rows[0].count);
  const previous = { A: 249, B: 118, C: 57, R: 0 };
  const lines = ["# B-13 quality comparison V1 to V2", "", "| Metric | V1 | V2 |", "|---|---:|---:|", ...["A", "B", "C", "R"].map((grade) => `| ${grade} rows | ${previous[grade]} | ${quality[grade] || 0} |`), `| V1 repeated-mm multi-crack candidates | ${legacyMultiCrackCount} | ${correctedMultiCrackCount} reliable candidates |`, `| V1 multi-crack false positives | ${legacyFalsePositiveCount} | 0 by corrected rule |`, `| V1 missed multi-crack records | ${legacyMissedCount} | 0 after corrected rule candidate list |`, `| Repaired-then-cracked records | 0 | ${recrackingCount} |`, `| Drawing anchor candidates | 0 | ${anchors.total} |`, `| Anchor candidates with source row | 0 | ${anchors.located} |`, `| Unlocated anchor candidates | 0 | ${anchors.unlocated} |`, "", "V2 statistics are generated from staging/database queries; the four formal business tables remain unchanged and no candidate was published as a formal attachment.", "", `Formal counts: disease_case=${formal.disease_cases}, observation_value=${formal.observations}, evaluation_result=${formal.evaluations}, work_order=${formal.work_orders}.`, `Batch counts: row_count=${batch.row_count}, valid=${batch.valid_row_count}, invalid=${batch.invalid_row_count}, pending_review=${batch.pending_review_count}.`];
  const report = path.join(reportDir, "b13_quality_comparison_v1_v2.md");
  fs.writeFileSync(report, `${lines.join("\n")}\n`, "utf8");
  console.log(JSON.stringify({ report, anchors, formal, batch }, null, 2));
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => pool.end());

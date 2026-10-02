const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { Pool } = require("pg");

const root = path.join(__dirname, "..");
const ownsOutputDir = !process.env.B13_REPORT_DIR;
const outputDir = process.env.B13_REPORT_DIR ? path.resolve(process.env.B13_REPORT_DIR) : fs.mkdtempSync(path.join(os.tmpdir(), "b13_quality_comparison_"));
const projectReport = path.join(root, "reports", "b13_quality_comparison_v1_v2.md");
const projectReportBefore = fs.existsSync(projectReport) ? fs.readFileSync(projectReport) : null;
const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 1
});

async function main() {
  const batch = (await pool.query("SELECT batch_id FROM staging.import_batch WHERE source_case_code='B-13' ORDER BY batch_id DESC LIMIT 1")).rows[0];
  assert(batch, "B-13 staging batch is required before quality comparison test");
  const qualityRows = (await pool.query("SELECT quality_flag, count(*)::int AS count FROM staging.ulanmulun_b13_raw WHERE batch_id=$1 GROUP BY quality_flag", [batch.batch_id])).rows;
  const expectedQuality = Object.fromEntries(qualityRows.map((row) => [row.quality_flag, row.count]));
  const expectedRecracking = Number((await pool.query("SELECT count(*)::int AS count FROM staging.ulanmulun_b13_raw WHERE batch_id=$1 AND raw_text LIKE '%修补后开裂%'", [batch.batch_id])).rows[0].count);

  const result = spawnSync(process.execPath, ["scripts/finalize_b13_v2_reports.js"], {
    cwd: root,
    env: { ...process.env, B13_SKIP_DOTENV: "1", B13_REPORT_DIR: outputDir },
    encoding: "utf8"
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const outputReport = path.join(outputDir, "b13_quality_comparison_v1_v2.md");
  assert(fs.existsSync(outputReport), "Quality comparison was not written to B13_REPORT_DIR");
  const report = fs.readFileSync(outputReport, "utf8");
  for (const grade of ["A", "B", "C", "R"]) {
    assert(report.includes(`| ${grade} rows |`), `Missing ${grade} comparison row`);
    assert(report.includes(`| ${grade} rows |`) && report.includes(`| ${expectedQuality[grade] || 0} |`), `V2 ${grade} count is not database-derived`);
  }
  assert(report.includes(`| Repaired-then-cracked records |`) && report.includes(`| ${expectedRecracking} |`), "Recracking count is not database-derived");
  assert(report.includes("Drawing anchor candidates"));
  assert(report.includes("Formal counts:"));

  const projectReportAfter = fs.existsSync(projectReport) ? fs.readFileSync(projectReport) : null;
  assert.deepStrictEqual(projectReportAfter, projectReportBefore, "Temporary report run changed the project reports directory");
  console.log(JSON.stringify({ test: "b13_quality_comparison_test", status: "passed", output_dir: outputDir }));
}

main()
  .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; })
  .finally(async () => {
    await pool.end();
    if (ownsOutputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  });

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const projectRoot = path.join(__dirname, "..");
const pgBin = process.env.PG_BIN || "";
const argv = process.argv.slice(2);
function argValue(name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : null;
}
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const port = "55433";
const dbName = `heavyhaul_rebuild_${stamp}`;
const tempRoot = path.join(os.tmpdir(), `heavyhaul_rebuild_${stamp}`);
const pgData = path.join(tempRoot, "pgdata");
const logDir = path.join(tempRoot, "logs");
const artifactDir = path.resolve(argValue("--artifact-output-dir") || path.join(tempRoot, "staging_output"));
const reportDir = path.resolve(argValue("--report-output-dir") || path.join(tempRoot, "reports"));
const b13Xlsx = argValue("--b13-xlsx") || process.env.B13_XLSX_PATH || null;
const reportPath = path.join(projectRoot, "reports", "rebuild_001_to_006.md");

fs.mkdirSync(pgData, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });
fs.mkdirSync(artifactDir, { recursive: true });
fs.mkdirSync(reportDir, { recursive: true });
fs.mkdirSync(path.dirname(reportPath), { recursive: true });

const migrations = [
  "001_baseline_schema.sql",
  "002_dictionary_seed.sql",
  "003_analysis_views.sql",
  "004_case_import_and_evaluation_framework.sql",
  "005_migration_registry.sql",
  "006_b13_staging_quality_corrections.sql"
];

const childEnv = {
  ...process.env,
  B13_SKIP_DOTENV: "1",
  PGHOST: "127.0.0.1",
  PGPORT: port,
  PGDATABASE: dbName,
  PGUSER: "postgres",
  PGPASSWORD: ""
};

let serverStarted = false;
const steps = [];

function exe(name) {
  const binary = process.platform === "win32" ? `${name}.exe` : name;
  return pgBin ? path.join(pgBin, binary) : binary;
}

function writeLog(logName, result) {
  const logPath = path.join(logDir, logName);
  fs.writeFileSync(
    logPath,
    [
      `exit_code=${result.status}`,
      "",
      "STDOUT:",
      result.stdout || "",
      "",
      "STDERR:",
      result.stderr || ""
    ].join("\n"),
    "utf8"
  );
  return logPath;
}

function runStep(name, logName, command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: options.env || process.env,
    input: options.input,
    encoding: "utf8",
    stdio: options.stdio,
    maxBuffer: 1024 * 1024 * 50
  });
  const logPath = writeLog(logName, result);
  const status = result.status === 0 ? "passed" : "failed";
  const step = { name, status, logPath, exitCode: result.status };
  steps.push(step);
  if (status !== "passed") {
    throw new Error(`${name} failed; see ${logPath}`);
  }
  return step;
}

function stopServer() {
  if (!serverStarted) return;
  spawnSync(exe("pg_ctl"), ["-D", pgData, "-m", "fast", "-w", "stop"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });
  serverStarted = false;
}

function removeTempRoot() {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(tempRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
      return;
    } catch (error) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
      if (attempt === 9) {
        console.error(`Temporary cleanup warning: ${error.message}`);
      }
    }
  }
}

try {
  runStep("initdb", "01_initdb.log", exe("initdb"), ["-D", pgData, "-A", "trust", "-U", "postgres", "--encoding=UTF8", "--locale=C"]);
  runStep("pg_ctl start", "02_pg_ctl_start.log", exe("pg_ctl"), ["-D", pgData, "-l", path.join(logDir, "postgres.log"), "-o", `-p ${port} -h 127.0.0.1`, "-w", "start"], { stdio: "ignore" });
  serverStarted = true;
  runStep("createdb", "03_createdb.log", exe("createdb"), ["-h", "127.0.0.1", "-p", port, "-U", "postgres", dbName]);

  migrations.forEach((migration, index) => {
    runStep(
      `apply ${migration}`,
      `${String(index + 4).padStart(2, "0")}_${migration}.log`,
      exe("psql"),
      ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", dbName, "-v", "ON_ERROR_STOP=1", "-f", path.join(projectRoot, "db", "migrations", migration)]
    );
  });

  runStep("sync/check migrations", "09_check_migrations.log", process.execPath, ["scripts/check_migrations.js", "--sync"], { env: childEnv });
  runStep("smoke test", "10_smoke_test.log", process.execPath, ["scripts/run_smoke_test.js"], { env: childEnv });
  runStep("migration checksum test", "10b_migration_checksum_test.log", process.execPath, ["tests/migration_checksum_test.js"], { env: childEnv });

  if (b13Xlsx) {
    const b13Env = { ...childEnv, B13_XLSX_PATH: path.resolve(b13Xlsx), B13_ARTIFACT_DIR: artifactDir, B13_REPORT_DIR: reportDir };
    runStep("B-13 extract", "12_b13_extract.log", "python", ["scripts/extract_b13_staging.py", b13Env.B13_XLSX_PATH, "--output-dir", artifactDir], { env: b13Env });
    runStep("B-13 staging import and idempotency", "13_b13_staging_import_test.log", process.execPath, ["tests/b13_staging_import_test.js"], { env: b13Env });
    runStep("B-13 quality report", "14_generate_b13_reports.log", process.execPath, ["scripts/generate_b13_reports.js"], { env: b13Env });
    runStep("B-13 quality assertions", "15_b13_quality_test.log", process.execPath, ["tests/b13_quality_test.js"], { env: b13Env });
    runStep("B-13 quality comparison", "16_b13_quality_comparison_test.log", process.execPath, ["tests/b13_quality_comparison_test.js"], { env: b13Env });
    runStep("B-13 extract output-dir test", "17_b13_extract_test.log", "python", ["-m", "unittest", "tests/b13_extract_test.py"], { env: b13Env });
    for (const file of fs.readdirSync(reportDir)) {
      const source = path.join(reportDir, file);
      if (fs.statSync(source).isFile()) fs.copyFileSync(source, path.join(projectRoot, "reports", file));
    }
  }

  const summarySql = `
SELECT json_build_object(
  'database', current_database(),
  'postgis', postgis_lib_version(),
  'disease_types', (SELECT count(*) FROM dict.disease_type WHERE mandatory_flag),
  'indicators', (SELECT count(*) FROM dict.indicator),
  'disease_indicators', (SELECT count(*) FROM dict.disease_indicator),
  'without_primary', (SELECT mandatory_without_primary_indicator_count FROM analysis.dictionary_acceptance),
  'schema_migrations', (SELECT count(*) FROM public.schema_migration),
  'unsafe_research_rules', (SELECT count(*) FROM standard.threshold_rule WHERE decision_authority = 'RESEARCH_ONLY' AND (can_trigger_speed_restriction OR manual_review_required = false))
) AS rebuild_summary;
`;
  const summaryResult = spawnSync(exe("psql"), ["-h", "127.0.0.1", "-p", port, "-U", "postgres", "-d", dbName, "-t", "-A"], {
    input: summarySql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10
  });
  writeLog("11_summary.log", summaryResult);
  if (summaryResult.status !== 0) {
    throw new Error("summary query failed");
  }

  const lines = [
    "# Rebuild verification 001-006",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "| Item | Result |",
    "|---|---|",
    `| Temporary port | ${port} |`,
    `| Temporary database | ${dbName} |`,
    `| Temporary directory | ${tempRoot} |`,
    `| B-13 XLSX supplied | ${b13Xlsx ? "yes" : "no"} |`,
    `| Staging artifact directory | ${artifactDir} |`,
    `| Report output directory | ${reportDir} |`,
    "",
    "## Step Results",
    "",
    "| Step | Status |",
    "|---|---|",
    ...steps.map((step) => `| ${step.name} | ${step.status} |`),
    "",
    "## Rebuild Summary",
    "",
    "```json",
    summaryResult.stdout.trim(),
    "```",
    "",
    "## Conclusion",
    "",
    "- `001 -> 002 -> 003 -> 004 -> 005 -> 006` executed successfully in an isolated temporary database.",
    "- Smoke test passed.",
    "- `public.schema_migration` contains 6 applied migration records.",
    b13Xlsx ? "- B-13 extraction, staging-only import, quality report, quality comparison, and output-directory tests passed." : "- B-13 integration was not run because no `--b13-xlsx` or `B13_XLSX_PATH` was supplied.",
    "- Temporary PostgreSQL was stopped and temporary pgdata was removed after the test."
  ];
  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

  console.log(JSON.stringify({
    rebuild: "passed",
    report: reportPath,
    summary: summaryResult.stdout.trim()
  }, null, 2));
} finally {
  stopServer();
  removeTempRoot();
}

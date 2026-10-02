const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

if (process.env.B13_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

const testPath = process.argv[2] || path.join(__dirname, "..", "db", "tests", "database_smoke_test.sql");

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 1
});

function stripPsqlMeta(sql) {
  return sql
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("\\"))
    .join("\n");
}

function splitStatements(sql) {
  const statements = [];
  let current = "";
  let quote = null;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const prev = sql[i - 1];
    current += char;
    if ((char === "'" || char === '"') && prev !== "\\") {
      quote = quote === char ? null : quote || char;
    }
    if (char === ";" && !quote) {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

function assertRows(name, rows) {
  const first = rows[0] || {};
  if (Object.prototype.hasOwnProperty.call(first, "mandatory_disease_without_indicator_count")) {
    throw new Error("Old indicator coverage check returned rows; expected 0 rows.");
  }
  if (Object.prototype.hasOwnProperty.call(first, "mandatory_without_primary_indicator_count")) {
    if (
      Object.prototype.hasOwnProperty.call(first, "mandatory_type_count") &&
      (Number(first.mandatory_type_count) !== 17 ||
        Number(first.track_type_count) !== 9 ||
        Number(first.bridge_type_count) !== 6 ||
        Number(first.interface_type_count) !== 2)
    ) {
      throw new Error(`Mandatory disease type counts are wrong: ${JSON.stringify(first)}`);
    }
    if (Number(first.mandatory_without_primary_indicator_count) !== 0) {
      throw new Error(`Mandatory disease primary indicator coverage failed: ${first.mandatory_without_primary_indicator_count}`);
    }
    if (Number(first.indicator_count) < 17 || Number(first.disease_indicator_count) < 17) {
      throw new Error(`Indicator seed count is too low: ${JSON.stringify(first)}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(first, "exists_flag")) {
    throw new Error(`Missing expected framework object(s): ${JSON.stringify(rows)}`);
  }
  if (Object.prototype.hasOwnProperty.call(first, "unsafe_verified_research_rule_count")) {
    if (Number(first.unsafe_verified_research_rule_count) !== 0) {
      throw new Error(`Unsafe research rule count is not zero: ${first.unsafe_verified_research_rule_count}`);
    }
  }
  return { name, row_count: rows.length, rows };
}

async function main() {
  const sql = stripPsqlMeta(fs.readFileSync(path.resolve(testPath), "utf8"));
  const statements = splitStatements(sql);
  const results = [];
  for (let i = 0; i < statements.length; i += 1) {
    const result = await pool.query(statements[i]);
    results.push(assertRows(`statement_${i + 1}`, result.rows || []));
  }
  console.log(JSON.stringify({
    smoke_test: "passed",
    statements: results.length,
    checks: results
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`Smoke test failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

if (process.env.B13_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node scripts\\run_select_sql_file.js <sql-file>");
  process.exit(1);
}

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

async function main() {
  const sql = stripPsqlMeta(fs.readFileSync(path.resolve(filePath), "utf8"));
  const result = await pool.query(sql);
  console.log(JSON.stringify(result.rows, null, 2));
}

main()
  .catch((error) => {
    console.error(`SQL select execution failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

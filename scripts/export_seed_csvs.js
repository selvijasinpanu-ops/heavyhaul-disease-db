const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 1
});

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function exportCsv(fileName, sql, columns) {
  const result = await pool.query(sql);
  const lines = [
    columns.map(csvCell).join(","),
    ...result.rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ];
  const outPath = path.join(__dirname, "..", "db", "seeds", fileName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  return { file: outPath, rows: result.rowCount };
}

async function main() {
  const outputs = [];
  outputs.push(await exportCsv("indicators.csv", `
    SELECT indicator_code, disease_type_code, standard_name, unit, decimal_scale,
           value_kind, required_level, trend_direction, data_type,
           measurement_method, source_status, source_level, decision_authority,
           verification_status, definition
    FROM dict.indicator
    ORDER BY indicator_code
  `, [
    "indicator_code",
    "disease_type_code",
    "standard_name",
    "unit",
    "decimal_scale",
    "value_kind",
    "required_level",
    "trend_direction",
    "data_type",
    "measurement_method",
    "source_status",
    "source_level",
    "decision_authority",
    "verification_status",
    "definition"
  ]));

  outputs.push(await exportCsv("disease_indicators.csv", `
    SELECT type_code, indicator_code, relation_role, required_level,
           measurement_method, source_status, note
    FROM dict.disease_indicator
    ORDER BY type_code, indicator_code
  `, [
    "type_code",
    "indicator_code",
    "relation_role",
    "required_level",
    "measurement_method",
    "source_status",
    "note"
  ]));

  console.log(JSON.stringify({ exported: outputs }, null, 2));
}

main()
  .catch((error) => {
    console.error(`Seed export failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

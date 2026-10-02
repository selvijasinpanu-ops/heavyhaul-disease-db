const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const projectRoot = path.join(__dirname, "..");
const reportPath = path.join(projectRoot, "reports", "20260811_pre_b13_import_audit.md");
const rowCountsPath = path.join(projectRoot, "db", "audit", "20260811_pre_b13_row_counts.csv");

const schemas = ["base", "dict", "inspect", "response", "standard", "analysis", "staging", "maintenance", "public"];

const expectedObjects = [
  ["base", "railway_line"],
  ["base", "route_segment"],
  ["base", "curve_section"],
  ["base", "bridge"],
  ["base", "bridge_span"],
  ["base", "component"],
  ["dict", "disease_type"],
  ["dict", "indicator"],
  ["dict", "disease_indicator"],
  ["standard", "threshold_rule"],
  ["standard", "threshold_band"],
  ["standard", "grade_mapping"],
  ["standard", "coupling_rule"],
  ["staging", "import_batch"],
  ["staging", "raw_observation"],
  ["staging", "ulanmulun_b13_raw"],
  ["inspect", "disease_case"],
  ["inspect", "observation_value"],
  ["inspect", "crack_detail"],
  ["inspect", "media_attachment"],
  ["inspect", "case_attachment"],
  ["analysis", "dictionary_acceptance"],
  ["analysis", "disease_case_latest"],
  ["analysis", "evaluation_result"],
  ["maintenance", "work_order"]
];

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 2
});

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function qName(schema, table) {
  return `"${schema.replaceAll('"', '""')}"."${table.replaceAll('"', '""')}"`;
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function main() {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.mkdirSync(path.dirname(rowCountsPath), { recursive: true });

  const health = (await query(`
    SELECT version() AS postgres_version,
           current_database() AS database_name,
           current_user AS user_name,
           postgis_lib_version() AS postgis_version
  `))[0];

  const schemaRows = await query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name = ANY($1::text[])
    ORDER BY schema_name
  `, [schemas]);

  const objectChecks = await query(`
    SELECT expected.schema_name, expected.object_name,
           to_regclass(expected.schema_name || '.' || expected.object_name) IS NOT NULL AS exists_flag
    FROM (VALUES ${expectedObjects.map((_, i) => `($${i * 2 + 1}::text,$${i * 2 + 2}::text)`).join(",")})
      AS expected(schema_name, object_name)
    ORDER BY expected.schema_name, expected.object_name
  `, expectedObjects.flat());

  const columns = await query(`
    SELECT table_schema, table_name, count(*)::int AS column_count
    FROM information_schema.columns
    WHERE table_schema = ANY($1::text[])
    GROUP BY table_schema, table_name
    ORDER BY table_schema, table_name
  `, [schemas]);

  const tables = await query(`
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = ANY($1::text[])
    ORDER BY table_schema, table_name
  `, [schemas]);

  const rowCounts = [];
  for (const table of tables.filter((row) => row.table_type === "BASE TABLE" && row.table_schema !== "public")) {
    const count = (await query(`SELECT count(*)::int AS row_count FROM ${qName(table.table_schema, table.table_name)}`))[0].row_count;
    rowCounts.push({ table_schema: table.table_schema, table_name: table.table_name, row_count: count });
  }

  const dictionary = (await query(`
    SELECT
      (SELECT count(*)::int FROM dict.disease_type WHERE mandatory_flag) AS disease_type_count,
      (SELECT count(*)::int FROM dict.indicator) AS indicator_count,
      (SELECT count(*)::int FROM dict.disease_indicator) AS disease_indicator_count,
      (SELECT mandatory_without_primary_indicator_count::int FROM analysis.dictionary_acceptance) AS mandatory_without_primary_indicator_count
  `))[0];

  const formalCounts = (await query(`
    SELECT
      (SELECT count(*)::int FROM inspect.disease_case) AS disease_case_count,
      (SELECT count(*)::int FROM inspect.observation_value) AS observation_value_count,
      (SELECT count(*)::int FROM analysis.evaluation_result) AS evaluation_result_count,
      (SELECT count(*)::int FROM maintenance.work_order) AS work_order_count
  `))[0];

  const rowCountCsv = [
    ["table_schema", "table_name", "row_count"].map(csvCell).join(","),
    ...rowCounts.map((row) => [row.table_schema, row.table_name, row.row_count].map(csvCell).join(","))
  ].join("\n") + "\n";
  fs.writeFileSync(rowCountsPath, rowCountCsv, "utf8");

  const lines = [
    "# B-13导入前数据库复核",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "## 连接与版本",
    "",
    "| 项目 | 结果 |",
    "|---|---|",
    `| 数据库 | \`${health.database_name}\` |`,
    `| 用户 | \`${health.user_name}\` |`,
    `| PostgreSQL | \`${health.postgres_version.split(",")[0]}\` |`,
    `| PostGIS | \`${health.postgis_version}\` |`,
    "",
    "## Schema",
    "",
    schemaRows.map((row) => `- \`${row.schema_name}\``).join("\n"),
    "",
    "## 关键对象存在性",
    "",
    "| Schema | 对象 | 状态 |",
    "|---|---|---|",
    ...objectChecks.map((row) => `| \`${row.schema_name}\` | \`${row.object_name}\` | ${row.exists_flag ? "存在" : "缺失"} |`),
    "",
    "## 字典验收",
    "",
    "| 项目 | 数量 |",
    "|---|---:|",
    `| 17类病害 | ${dictionary.disease_type_count} |`,
    `| 指标 | ${dictionary.indicator_count} |`,
    `| 病害-指标关联 | ${dictionary.disease_indicator_count} |`,
    `| 无主控指标病害 | ${dictionary.mandatory_without_primary_indicator_count} |`,
    "",
    "## 正式业务表导入前行数",
    "",
    "| 表 | 行数 |",
    "|---|---:|",
    `| inspect.disease_case | ${formalCounts.disease_case_count} |`,
    `| inspect.observation_value | ${formalCounts.observation_value_count} |`,
    `| analysis.evaluation_result | ${formalCounts.evaluation_result_count} |`,
    `| maintenance.work_order | ${formalCounts.work_order_count} |`,
    "",
    "## 字段数量摘要",
    "",
    "| 表 | 字段数 |",
    "|---|---:|",
    ...columns.map((row) => `| \`${row.table_schema}.${row.table_name}\` | ${row.column_count} |`),
    "",
    `行数快照：\`${path.relative(projectRoot, rowCountsPath)}\``
  ];

  fs.writeFileSync(reportPath, lines.join("\n") + "\n", "utf8");

  console.log(JSON.stringify({
    audit: "completed",
    database: health.database_name,
    user: health.user_name,
    postgis: health.postgis_version,
    object_missing_count: objectChecks.filter((row) => !row.exists_flag).length,
    dictionary,
    formal_counts: formalCounts,
    report: reportPath,
    row_counts: rowCountsPath
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`Pre-B13 audit failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

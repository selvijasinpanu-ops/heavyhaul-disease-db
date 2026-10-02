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
  max: 2
});

const schemas = [
  "base",
  "dict",
  "inspect",
  "response",
  "standard",
  "analysis",
  "staging",
  "maintenance"
];

function qName(schema, table) {
  return `"${schema.replaceAll('"', '""')}"."${table.replaceAll('"', '""')}"`;
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const health = (await query(`
    SELECT current_database() AS database_name,
           current_user AS user_name,
           postgis_lib_version() AS postgis_version
  `))[0];

  const extensions = await query(`
    SELECT extname AS extension_name, extversion AS extension_version
    FROM pg_extension
    ORDER BY extname
  `);

  const tables = await query(`
    SELECT table_schema, table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = ANY($1::text[])
    ORDER BY table_schema, table_name
  `, [schemas]);

  const columns = await query(`
    SELECT table_schema, table_name, ordinal_position, column_name,
           data_type, udt_name, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = ANY($1::text[])
    ORDER BY table_schema, table_name, ordinal_position
  `, [schemas]);

  const constraints = await query(`
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           con.conname AS constraint_name,
           con.contype AS constraint_type,
           pg_get_constraintdef(con.oid) AS definition
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY($1::text[])
    ORDER BY n.nspname, c.relname, con.conname
  `, [schemas]);

  const indexes = await query(`
    SELECT schemaname AS schema_name,
           tablename AS table_name,
           indexname AS index_name,
           indexdef AS definition
    FROM pg_indexes
    WHERE schemaname = ANY($1::text[])
    ORDER BY schemaname, tablename, indexname
  `, [schemas]);

  const views = await query(`
    SELECT table_schema, table_name, view_definition
    FROM information_schema.views
    WHERE table_schema = ANY($1::text[])
    ORDER BY table_schema, table_name
  `, [schemas]);

  const rowCounts = [];
  for (const table of tables.filter((t) => t.table_type === "BASE TABLE")) {
    const count = (await query(`SELECT count(*)::int AS row_count FROM ${qName(table.table_schema, table.table_name)}`))[0].row_count;
    rowCounts.push({
      table_schema: table.table_schema,
      table_name: table.table_name,
      row_count: count
    });
  }

  const existenceChecks = await query(`
    WITH expected(schema_name, object_name) AS (
      VALUES
        ('dict','disease_indicator'),
        ('standard','threshold_rule'),
        ('standard','threshold_band'),
        ('standard','grade_mapping'),
        ('standard','coupling_rule'),
        ('staging','ulanmulun_b13_raw'),
        ('inspect','crack_detail'),
        ('inspect','media_attachment'),
        ('inspect','case_attachment'),
        ('analysis','evaluation_result'),
        ('maintenance','work_order')
    )
    SELECT expected.schema_name, expected.object_name,
           to_regclass(expected.schema_name || '.' || expected.object_name) IS NOT NULL AS exists_flag
    FROM expected
    ORDER BY expected.schema_name, expected.object_name
  `);

  const dictionary = await query(`
    SELECT
      (SELECT count(*)::int FROM dict.disease_type WHERE mandatory_flag) AS mandatory_disease_type_count,
      (SELECT count(*)::int FROM dict.disease_alias) AS disease_alias_count,
      (SELECT count(*)::int FROM dict.indicator) AS indicator_count,
      (SELECT count(*)::int
       FROM dict.disease_type dt
       LEFT JOIN dict.indicator i ON i.disease_type_code = dt.type_code
       WHERE dt.mandatory_flag
         AND i.indicator_id IS NULL) AS mandatory_without_direct_indicator_count
  `);

  const output = {
    generated_at: generatedAt,
    health,
    extensions,
    tables,
    columns,
    constraints,
    indexes,
    views,
    row_counts: rowCounts,
    existence_checks: existenceChecks,
    dictionary: dictionary[0]
  };

  const auditDir = path.join(__dirname, "..", "db", "audit");
  fs.mkdirSync(auditDir, { recursive: true });
  const jsonPath = path.join(auditDir, "20260811_database_inventory.json");
  fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2), "utf8");

  const csvRows = ["table_schema,table_name,row_count"].concat(
    rowCounts.map((row) => `${row.table_schema},${row.table_name},${row.row_count}`)
  );
  fs.writeFileSync(path.join(auditDir, "20260811_row_counts.csv"), csvRows.join("\n") + "\n", "utf8");

  console.log(JSON.stringify({
    generated_at: generatedAt,
    health,
    table_count: tables.length,
    column_count: columns.length,
    row_counts: rowCounts,
    existence_checks: existenceChecks,
    dictionary: dictionary[0],
    output: jsonPath
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(`Database inventory failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });

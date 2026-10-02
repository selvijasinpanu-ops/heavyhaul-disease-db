const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

if (process.env.B13_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

const EXPECTED_ROWS = 424;
const EXPECTED_MEDIA = 389;
const IMPORTER_VERSION = "b13_staging_import_v1";

const [jsonlPath, mediaCsvPath, anchorCsvPath] = process.argv.slice(2);
if (!jsonlPath || !mediaCsvPath) {
  console.error("Usage: node scripts\\import_b13_staging.js staging_output\\b13_raw_rows.jsonl staging_output\\b13_media_manifest.csv");
  process.exit(1);
}

const pool = new Pool({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "heavyhaul",
  user: process.env.PGUSER || "heavyhaul_admin",
  password: process.env.PGPASSWORD,
  max: 2
});

function parseJsonl(filePath) {
  const lines = fs.readFileSync(path.resolve(filePath), "utf8").split(/\r?\n/).filter(Boolean);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at line ${index + 1}: ${error.message}`);
    }
  });
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && quoted && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function parseCsv(filePath) {
  const content = fs.readFileSync(path.resolve(filePath), "utf8").replace(/^\uFEFF/, "");
  const records = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    const next = content[i + 1];
    if (char === '"' && quoted && next === '"') { current += '""'; i += 1; continue; }
    if (char === '"') quoted = !quoted;
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      if (current) records.push(current);
      current = "";
    } else current += char;
  }
  if (current) records.push(current);
  if (!records.length) return [];
  const headers = parseCsvLine(records[0]);
  return records.slice(1).map((record) => {
    const cells = parseCsvLine(record);
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]));
  });
}

function validateInputs(rawRows, mediaRows) {
  if (rawRows.length !== EXPECTED_ROWS) {
    throw new Error(`Expected ${EXPECTED_ROWS} raw rows, got ${rawRows.length}`);
  }
  if (mediaRows.length !== EXPECTED_MEDIA) {
    throw new Error(`Expected ${EXPECTED_MEDIA} media rows, got ${mediaRows.length}`);
  }
  const rowNos = rawRows.map((row) => Number(row.source_row_no)).sort((a, b) => a - b);
  if (rowNos[0] !== 8 || rowNos[rowNos.length - 1] !== 431) {
    throw new Error(`Expected Excel source rows 8-431, got ${rowNos[0]}-${rowNos[rowNos.length - 1]}`);
  }
  for (let expected = 8; expected <= 431; expected += 1) {
    if (rowNos[expected - 8] !== expected) {
      throw new Error(`Missing or duplicated source row near ${expected}`);
    }
  }
  for (const row of rawRows) {
    if (!row.source_file_sha256 || !row.raw_payload || !row.raw_text) {
      throw new Error(`Row ${row.source_row_no} is missing source hash, payload, or raw_text`);
    }
  }
  for (const row of mediaRows) {
    if (!row.checksum_sha256 || !row.internal_path) {
      throw new Error(`Media row ${row.media_sequence} is missing checksum or internal path`);
    }
  }
}

async function query(client, sql, params = []) {
  const result = await client.query(sql, params);
  return result.rows;
}

async function main() {
  const rawRows = parseJsonl(jsonlPath);
  const mediaRows = parseCsv(mediaCsvPath);
  const anchorRows = anchorCsvPath && fs.existsSync(path.resolve(anchorCsvPath)) ? parseCsv(anchorCsvPath) : [];
  validateInputs(rawRows, mediaRows);

  const sourceSha = rawRows[0].source_file_sha256;
  const sourceFileName = rawRows[0].source_file_name;
  const sourceFilePath = rawRows[0].source_file_path;
  const sourceDocumentCode = `B13_SURVEY_${sourceSha.slice(0, 16).toUpperCase()}`;
  const batchCode = `B13_FIELD_SURVEY_${sourceSha.slice(0, 16).toUpperCase()}`;

  const client = await pool.connect();
  let beforeFormal;
  let afterFormal;
  try {
    await client.query("BEGIN");
    beforeFormal = (await query(client, `
      SELECT
        (SELECT count(*)::int FROM inspect.disease_case) AS disease_case_count,
        (SELECT count(*)::int FROM inspect.observation_value) AS observation_value_count,
        (SELECT count(*)::int FROM analysis.evaluation_result) AS evaluation_result_count,
        (SELECT count(*)::int FROM maintenance.work_order) AS work_order_count
    `))[0];

    const sourceDocument = (await query(client, `
      INSERT INTO standard.source_document
        (document_code, document_title, document_type, source_uri, checksum_sha256,
         note, source_level, decision_authority, verification_status,
         can_trigger_speed_restriction, manual_review_required, storage_uri)
      VALUES ($1,$2,'other',$3,$4,$5,'D','PENDING','pending',false,true,$3)
      ON CONFLICT (document_code) DO UPDATE
      SET source_uri = EXCLUDED.source_uri,
          checksum_sha256 = EXCLUDED.checksum_sha256,
          note = EXCLUDED.note,
          storage_uri = EXCLUDED.storage_uri
      RETURNING document_id
    `, [
      sourceDocumentCode,
      "乌兰木伦1#特大桥（B-13）现场核对调查表",
      sourceFilePath,
      sourceSha,
      `Imported to staging only by ${IMPORTER_VERSION}; no formal disease cases were published.`
    ]))[0];

    const batch = (await query(client, `
      INSERT INTO staging.import_batch
        (batch_code, source_file_uri, checksum_sha256, import_status, quality_flag,
         issue_summary, source_document_id, source_system, source_case_code,
         importer_name, validated_at, row_count, valid_row_count, invalid_row_count,
         pending_review_count)
      VALUES ($1,$2,$3,'validated','B',$4,$5,'FIELD_SURVEY_XLSX','B-13',$6,now(),$7,$7,0,$8)
      ON CONFLICT (batch_code) DO UPDATE
      SET source_file_uri = EXCLUDED.source_file_uri,
          checksum_sha256 = EXCLUDED.checksum_sha256,
          import_status = EXCLUDED.import_status,
          quality_flag = EXCLUDED.quality_flag,
          issue_summary = EXCLUDED.issue_summary,
          source_document_id = EXCLUDED.source_document_id,
          source_system = EXCLUDED.source_system,
          source_case_code = EXCLUDED.source_case_code,
          importer_name = EXCLUDED.importer_name,
          validated_at = staging.import_batch.validated_at,
          row_count = staging.import_batch.row_count,
          valid_row_count = staging.import_batch.valid_row_count,
          invalid_row_count = staging.import_batch.invalid_row_count,
          pending_review_count = staging.import_batch.pending_review_count
      RETURNING batch_id, batch_code
    `, [
      batchCode,
      sourceFilePath,
      sourceSha,
      `${EXPECTED_ROWS} raw rows extracted; ${EXPECTED_MEDIA} embedded media objects indexed; staging only.`,
      sourceDocument.document_id,
      IMPORTER_VERSION,
      rawRows.length,
      rawRows.length
    ]))[0];

    for (const row of rawRows) {
      const rowHash = `${sourceSha}:${row.sheet_name}:${row.source_row_no}`;
      await client.query(`
        INSERT INTO staging.ulanmulun_b13_raw
          (batch_id, source_document_id, sheet_name, row_no, location_text,
           disease_description, photo_ref, source_text, native_grade,
           proposed_action, raw_payload, raw_text, parsed_values, quality_flag,
           validation_status, validation_message, correction_status,
           correction_note, source_hash_sha256)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13::jsonb,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (batch_id, sheet_name, row_no) DO UPDATE
        SET location_text = EXCLUDED.location_text,
            disease_description = EXCLUDED.disease_description,
            photo_ref = EXCLUDED.photo_ref,
            source_text = EXCLUDED.source_text,
            native_grade = EXCLUDED.native_grade,
            proposed_action = EXCLUDED.proposed_action,
            raw_payload = EXCLUDED.raw_payload,
            raw_text = EXCLUDED.raw_text,
            parsed_values = EXCLUDED.parsed_values,
            source_hash_sha256 = EXCLUDED.source_hash_sha256
      `, [
        batch.batch_id,
        sourceDocument.document_id,
        row.sheet_name,
        Number(row.source_row_no),
        row.location_text || null,
        row.disease_description || null,
        row.photo_ref_raw || null,
        row.source_text || null,
        row.native_grade || null,
        row.proposed_action || null,
        JSON.stringify(row.raw_payload),
        row.raw_text,
        JSON.stringify({ source_row_no: row.source_row_no }),
        row.quality_flag || "B",
        row.validation_status || "pending",
        row.validation_message || null,
        row.correction_status || "uncorrected",
        row.correction_note || null,
        rowHash
      ]);
    }

    for (const media of mediaRows) {
      const fileUri = `xlsx://${sourceSha}/${media.internal_path}`;
      await client.query(`
        INSERT INTO inspect.media_attachment
          (source_document_id, batch_id, file_uri, relative_path, file_name,
           media_type, mime_type, checksum_sha256, file_size_bytes, photo_ref,
           description, metadata, quality_flag)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'B')
        ON CONFLICT (file_uri) DO UPDATE
        SET source_document_id = EXCLUDED.source_document_id,
            batch_id = EXCLUDED.batch_id,
            relative_path = EXCLUDED.relative_path,
            file_name = EXCLUDED.file_name,
            media_type = EXCLUDED.media_type,
            mime_type = EXCLUDED.mime_type,
            checksum_sha256 = EXCLUDED.checksum_sha256,
            file_size_bytes = EXCLUDED.file_size_bytes,
            photo_ref = EXCLUDED.photo_ref,
            description = EXCLUDED.description,
            metadata = EXCLUDED.metadata,
            quality_flag = EXCLUDED.quality_flag
      `, [
        sourceDocument.document_id,
        batch.batch_id,
        fileUri,
        media.internal_path,
        media.original_file_name,
        media.mime_type && media.mime_type.startsWith("image/") ? "image" : "other",
        media.mime_type || null,
        media.checksum_sha256,
        Number(media.file_size_bytes || 0),
        media.photo_ref_candidate || null,
        media.validation_message || null,
        JSON.stringify({
          source_file_name: sourceFileName,
          source_file_sha256: sourceSha,
          media_sequence: Number(media.media_sequence),
          related_sheet: media.related_sheet,
          anchor_row: media.anchor_row ? Number(media.anchor_row) : null,
          anchor_column: media.anchor_column ? Number(media.anchor_column) : null,
          anchor_count: media.anchor_count ? Number(media.anchor_count) : 0,
          relation_confidence: media.relation_confidence,
          validation_status: media.validation_status,
          validation_message: media.validation_message
        })
      ]);
    }

    if (anchorRows.length) {
      const mediaIds = await query(client, `
        SELECT media_id, relative_path FROM inspect.media_attachment WHERE batch_id = $1
      `, [batch.batch_id]);
      const mediaIdByPath = new Map(mediaIds.map((row) => [row.relative_path, row.media_id]));
      const rawIds = await query(client, `
        SELECT raw_id, row_no FROM staging.ulanmulun_b13_raw WHERE batch_id = $1
      `, [batch.batch_id]);
      const rawIdByRow = new Map(rawIds.map((row) => [Number(row.row_no), row.raw_id]));
      for (const anchor of anchorRows) {
        const mediaId = mediaIdByPath.get(anchor.internal_path);
        if (!mediaId) throw new Error(`Anchor references unknown media path: ${anchor.internal_path}`);
        const sourceRow = anchor.source_row_candidate ? Number(anchor.source_row_candidate) : null;
        await client.query(`
          INSERT INTO staging.media_anchor_candidate
            (media_id, batch_id, source_raw_id, sheet_name, drawing_path, anchor_sequence,
             anchor_type, anchor_row, anchor_column, to_row, to_column,
             relation_confidence, validation_status, validation_message)
          VALUES ($1,$2,$3,'Sheet1',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
          ON CONFLICT (media_id, drawing_path, anchor_sequence) DO UPDATE
          SET source_raw_id = EXCLUDED.source_raw_id,
              anchor_row = EXCLUDED.anchor_row,
              anchor_column = EXCLUDED.anchor_column,
              to_row = EXCLUDED.to_row,
              to_column = EXCLUDED.to_column,
              relation_confidence = EXCLUDED.relation_confidence,
              validation_status = EXCLUDED.validation_status,
              validation_message = EXCLUDED.validation_message
        `, [
          mediaId, batch.batch_id, sourceRow ? rawIdByRow.get(sourceRow) || null : null,
          anchor.drawing_path, Number(anchor.drawing_anchor_sequence), anchor.anchor_type,
          anchor.anchor_row ? Number(anchor.anchor_row) : null,
          anchor.anchor_column ? Number(anchor.anchor_column) : null,
          anchor.to_row ? Number(anchor.to_row) : null,
          anchor.to_column ? Number(anchor.to_column) : null,
          anchor.relation_confidence || "none", anchor.validation_status || "needs_review",
          anchor.validation_message || null
        ]);
      }
    }

    afterFormal = (await query(client, `
      SELECT
        (SELECT count(*)::int FROM inspect.disease_case) AS disease_case_count,
        (SELECT count(*)::int FROM inspect.observation_value) AS observation_value_count,
        (SELECT count(*)::int FROM analysis.evaluation_result) AS evaluation_result_count,
        (SELECT count(*)::int FROM maintenance.work_order) AS work_order_count
    `))[0];

    if (JSON.stringify(beforeFormal) !== JSON.stringify(afterFormal)) {
      throw new Error(`Formal table counts changed: before=${JSON.stringify(beforeFormal)} after=${JSON.stringify(afterFormal)}`);
    }

    await client.query("COMMIT");

    const summary = (await pool.query(`
      SELECT
        $1::text AS batch_code,
        (SELECT batch_id FROM staging.import_batch WHERE batch_code = $1) AS batch_id,
        (SELECT count(*)::int FROM staging.ulanmulun_b13_raw raw JOIN staging.import_batch b ON b.batch_id = raw.batch_id WHERE b.batch_code = $1) AS raw_rows,
        (SELECT count(*)::int FROM inspect.media_attachment WHERE batch_id = (SELECT batch_id FROM staging.import_batch WHERE batch_code = $1)) AS media_rows
    `, [batchCode])).rows[0];

    console.log(JSON.stringify({
      import: "committed",
      source_file_sha256: sourceSha,
      batch_code: summary.batch_code,
      batch_id: summary.batch_id,
      raw_rows: summary.raw_rows,
      media_rows: summary.media_rows,
      formal_counts_before: beforeFormal,
      formal_counts_after: afterFormal
    }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`B13 staging import failed: ${error.message}`);
  process.exit(1);
});

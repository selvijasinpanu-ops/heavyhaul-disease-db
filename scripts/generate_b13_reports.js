const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { Pool } = require("pg");

if (process.env.B13_SKIP_DOTENV !== "1") {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

const projectRoot = path.join(__dirname, "..");
const reportDir = process.env.B13_REPORT_DIR ? path.resolve(process.env.B13_REPORT_DIR) : path.join(projectRoot, "reports");
fs.mkdirSync(reportDir, { recursive: true });

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

function writeCsv(fileName, rows, columns) {
  const lines = [
    columns.map(csvCell).join(","),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(","))
  ];
  const outPath = path.join(reportDir, fileName);
  fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
  return outPath;
}

function multiCrackDetection(text) {
  const explicit = text.match(/(?:\d+\s*[条道]\s*(?:裂缝|斜裂缝)|共\s*\d+\s*条|裂缝\s*[2-9]\d*)/g);
  const indexed = text.match(/\b(?:L|W|D)\s*[2-9]\b/gi);
  const groups = text.match(/\d+(?:\.\d+)?\s*(?:m|mm|米|毫米)\s*[×xX*]\s*\d+(?:\.\d+)?\s*(?:m|mm|米|毫米)/g);
  if (explicit) return { count: 2, basis: `explicit:${explicit.join("|")}` };
  if (indexed) return { count: 2, basis: `indexed:${indexed.join("|")}` };
  if (groups && groups.length >= 2) return { count: groups.length, basis: `length_width_groups:${groups.join("|")}` };
  return { count: 0, basis: "no_reliable_multi_crack_pattern" };
}

function repairStatus(text) {
  if (text.includes("修补后再次开裂")) return { status: "repaired_then_recracked", flag: "R" };
  if (text.includes("修补后开裂")) return { status: "repaired_then_cracked", flag: "R" };
  if (text.includes("再次开裂")) return { status: "recracked", flag: "R" };
  if (text.includes("复裂")) return { status: "recracked", flag: "R" };
  if (text.includes("已修补")) return { status: "repaired", flag: "B" };
  return { status: "none", flag: null };
}

function suspiciousWidths(text) {
  const matches = [];
  const patterns = [
    /\bW(?:1|2)?\s*[=:：]\s*(6|8|10)\s*(?:mm|毫米)\b/gi,
    /裂缝[^。；;\n]{0,30}宽度\s*[=:：]?\s*(6|8|10)\s*(?:mm|毫米)/gi,
    /(\d+(?:\.\d+)?)\s*(?:m|米)\s*[×xX*]\s*(6|8|10)\s*(?:mm|毫米)/gi
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const width = Number(match[2] || match[1]);
      matches.push({ matched_text: match[0], parsed_width_mm: width, match_context: text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40), detection_basis: pattern === patterns[0] ? "explicit_width_variable" : pattern === patterns[1] ? "explicit_crack_width_text" : "length_width_context", requires_manual_review: true });
    }
  }
  return matches;
}

function issueList(row, anchoredMediaCount) {
  const text = row.raw_text || "";
  const issues = [];
  const multi = multiCrackDetection(text);
  const repair = repairStatus(text);
  if (!row.raw_payload || Object.keys(row.raw_payload).length === 0) issues.push("missing_raw_payload");
  if (!text.trim()) issues.push("missing_raw_text");
  if (!(row.location_text || "").trim()) issues.push("unrecognized_location");
  if (multi.count > 0) issues.push("multi_crack_candidate");
  if (text.includes("065m")) issues.push("suspected_length_065m");
  if (text.includes("038m2") || text.includes("038m²")) issues.push("suspected_area_038m2");
  if (suspiciousWidths(text).length) issues.push("suspicious_6_8_10_mm_width");
  if (text.includes("未见")) issues.push("contains_unseen");
  if (text.includes("已修补")) issues.push("contains_repaired");
  if (repair.flag === "R") issues.push("contains_recracking_after_repair");
  if (!(row.photo_ref || "").trim() && anchoredMediaCount > 0) issues.push("no_photo_ref_but_anchor_media");
  if ((row.photo_ref || "").trim() && anchoredMediaCount === 0) issues.push("photo_ref_without_anchor_media");
  return issues;
}

function qualityFromIssues(issues, row) {
  if (issues.some((issue) => ["missing_raw_payload", "missing_raw_text", "contains_recracking_after_repair"].includes(issue))) return "R";
  if (issues.some((issue) => issue.startsWith("suspected_") || issue === "suspicious_6_8_10_mm_width" || issue === "unrecognized_location" || issue === "multi_crack_candidate")) return "C";
  if (issues.includes("contains_recracking_after_repair")) return "R";
  if ((row.disease_description || "").match(/\d/) && issues.length === 0) return "A";
  return "B";
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });
  const batch = (await query(`
    SELECT b.*, sd.document_title, sd.checksum_sha256 AS source_sha
    FROM staging.import_batch b
    LEFT JOIN standard.source_document sd ON sd.document_id = b.source_document_id
    WHERE b.source_case_code = 'B-13'
      AND b.source_system = 'FIELD_SURVEY_XLSX'
    ORDER BY b.batch_id DESC
    LIMIT 1
  `))[0];
  if (!batch) {
    throw new Error("No B-13 staging import batch found");
  }

  const rawRows = await query(`
    SELECT raw_id, batch_id, sheet_name, row_no, location_text, disease_description,
           photo_ref, source_text, native_grade, proposed_action, raw_payload,
           raw_text, quality_flag, validation_status, validation_message
    FROM staging.ulanmulun_b13_raw
    WHERE batch_id = $1
    ORDER BY row_no
  `, [batch.batch_id]);

  const mediaRows = await query(`
    SELECT media_id, file_uri, relative_path, file_name, media_type, mime_type,
           checksum_sha256, file_size_bytes, photo_ref, metadata
    FROM inspect.media_attachment
    WHERE batch_id = $1
    ORDER BY (metadata->>'media_sequence')::int
  `, [batch.batch_id]);

  const anchorRows = await query(`
    SELECT a.*, m.relative_path, m.file_name
    FROM staging.media_anchor_candidate a
    JOIN inspect.media_attachment m ON m.media_id = a.media_id
    WHERE a.batch_id = $1
    ORDER BY a.anchor_candidate_id
  `, [batch.batch_id]);

  const mediaByAnchorRow = new Map();
  for (const anchor of anchorRows) {
    if (anchor.anchor_row) mediaByAnchorRow.set(anchor.anchor_row, (mediaByAnchorRow.get(anchor.anchor_row) || 0) + 1);
  }

  const issueRows = [];
  const summaryRows = [];
  const multiCrackRows = [];
  const repairRows = [];
  const widthRows = [];
  const qualityCounts = { A: 0, B: 0, C: 0, R: 0 };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of rawRows) {
      const issues = issueList(row, mediaByAnchorRow.get(row.row_no) || 0);
      const multi = multiCrackDetection(row.raw_text || "");
      const repair = repairStatus(row.raw_text || "");
      const widths = suspiciousWidths(row.raw_text || "");
      const quality = qualityFromIssues(issues, row);
      const validationStatus = quality === "R" || quality === "C" ? "needs_review" : "valid";
      qualityCounts[quality] += 1;
      await client.query(`
        UPDATE staging.ulanmulun_b13_raw
        SET quality_flag = $1,
            validation_status = $2,
            validation_message = $3
        WHERE raw_id = $4
      `, [quality, validationStatus, issues.join("; "), row.raw_id]);

      for (const issue of issues) {
        issueRows.push({
          source_row_no: row.row_no,
          issue_type: issue,
          quality_flag: quality,
          location_text: row.location_text || "",
          disease_description: row.disease_description || "",
          photo_ref: row.photo_ref || "",
          raw_text: row.raw_text || ""
        });
      }

      summaryRows.push({
        source_row_no: row.row_no,
        location_text: row.location_text || "",
        disease_description: row.disease_description || "",
        photo_ref: row.photo_ref || "",
        source_text: row.source_text || "",
        native_grade: row.native_grade || "",
        quality_flag: quality,
        validation_status: validationStatus,
        issue_count: issues.length,
        issue_types: issues.join("; ")
      });
      if (multi.count > 0) multiCrackRows.push({ source_row_no: row.row_no, disease_description: row.disease_description || "", detected_crack_count: multi.count, detection_basis: multi.basis, quality_flag: quality, manual_review_required: true });
      if (repair.status !== "none") repairRows.push({ source_row_no: row.row_no, disease_description: row.disease_description || "", repair_status_candidate: repair.status, quality_flag: repair.flag === "R" ? "R" : quality, validation_status: repair.flag === "R" ? "needs_review" : "candidate", manual_review_required: repair.flag === "R" });
      for (const width of widths) widthRows.push({ source_row_no: row.row_no, disease_description: row.disease_description || "", ...width });
    }
    const stats = (await client.query(`
      SELECT count(*)::int AS row_count,
             count(*) FILTER (WHERE validation_status = 'valid')::int AS valid_row_count,
             count(*) FILTER (WHERE validation_status = 'invalid')::int AS invalid_row_count,
             count(*) FILTER (WHERE validation_status = 'needs_review')::int AS pending_review_count,
             count(*) FILTER (WHERE quality_flag = 'R')::int AS r_count,
             count(*) FILTER (WHERE quality_flag = 'C')::int AS c_count
      FROM staging.ulanmulun_b13_raw WHERE batch_id = $1
    `, [batch.batch_id])).rows[0];
    await client.query(`
      UPDATE staging.import_batch
      SET row_count = $1, valid_row_count = $2, invalid_row_count = $3,
          pending_review_count = $4, validated_at = now(),
          issue_summary = $5,
          quality_flag = CASE WHEN $6 > 0 THEN 'R' WHEN $7 > 0 THEN 'C' ELSE 'B' END
      WHERE batch_id = $8
    `, [stats.row_count, stats.valid_row_count, stats.invalid_row_count, stats.pending_review_count,
      `quality_counts:R=${stats.r_count},C=${stats.c_count}; candidate relations remain needs_review`, stats.r_count, stats.c_count, batch.batch_id]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  const mediaSummaryRows = mediaRows.map((media) => ({
    media_sequence: media.metadata?.media_sequence || "",
    internal_path: media.relative_path || "",
    file_name: media.file_name || "",
    mime_type: media.mime_type || "",
    file_size_bytes: media.file_size_bytes || "",
    checksum_sha256: media.checksum_sha256 || "",
    anchor_row: media.metadata?.anchor_row || "",
    anchor_column: media.metadata?.anchor_column || "",
    photo_ref_candidate: media.photo_ref || "",
    relation_confidence: media.metadata?.relation_confidence || "none",
    validation_status: media.metadata?.validation_status || "needs_review"
  }));

  const duplicateRows = await query(`
    SELECT sheet_name, row_no, count(*)::int AS duplicate_count
    FROM staging.ulanmulun_b13_raw
    WHERE batch_id = $1
    GROUP BY sheet_name, row_no
    HAVING count(*) > 1
  `, [batch.batch_id]);

  const formalCounts = (await query(`
    SELECT
      (SELECT count(*)::int FROM inspect.disease_case) AS disease_case_count,
      (SELECT count(*)::int FROM inspect.observation_value) AS observation_value_count,
      (SELECT count(*)::int FROM analysis.evaluation_result) AS evaluation_result_count,
      (SELECT count(*)::int FROM maintenance.work_order) AS work_order_count
  `))[0];

  const issuePath = writeCsv("b13_staging_quality_issues.csv", issueRows, [
    "source_row_no",
    "issue_type",
    "quality_flag",
    "location_text",
    "disease_description",
    "photo_ref",
    "raw_text"
  ]);
  const rowSummaryPath = writeCsv("b13_staging_row_summary.csv", summaryRows, [
    "source_row_no",
    "location_text",
    "disease_description",
    "photo_ref",
    "source_text",
    "native_grade",
    "quality_flag",
    "validation_status",
    "issue_count",
    "issue_types"
  ]);
  const mediaSummaryPath = writeCsv("b13_media_summary.csv", mediaSummaryRows, [
    "media_sequence",
    "internal_path",
    "file_name",
    "mime_type",
    "file_size_bytes",
    "checksum_sha256",
    "anchor_row",
    "anchor_column",
    "photo_ref_candidate",
    "relation_confidence",
    "validation_status"
  ]);
  const mediaSequenceByPath = new Map(mediaRows.map((media) => [media.relative_path, media.metadata?.media_sequence || ""]));
  const anchorSummaryRows = anchorRows.map((row) => ({
    media_sequence: mediaSequenceByPath.get(row.relative_path) || "",
    media_id: row.media_id,
    internal_path: row.relative_path || "",
    drawing_path: row.drawing_path,
    drawing_anchor_sequence: row.anchor_sequence,
    anchor_type: row.anchor_type,
    anchor_row: row.anchor_row || "",
    anchor_column: row.anchor_column || "",
    to_row: row.to_row || "",
    to_column: row.to_column || "",
    source_raw_id: row.source_raw_id || "",
    relation_confidence: row.relation_confidence,
    validation_status: row.validation_status,
    validation_message: row.validation_message || ""
  }));
  const anchorSummaryPath = writeCsv("b13_media_anchor_summary.csv", anchorSummaryRows, ["media_sequence", "media_id", "internal_path", "drawing_path", "drawing_anchor_sequence", "anchor_type", "anchor_row", "anchor_column", "to_row", "to_column", "source_raw_id", "relation_confidence", "validation_status", "validation_message"]);
  const multiCrackPath = writeCsv("b13_multi_crack_candidates.csv", multiCrackRows, ["source_row_no", "disease_description", "detected_crack_count", "detection_basis", "quality_flag", "manual_review_required"]);
  const repairPath = writeCsv("b13_recracking_candidates.csv", repairRows, ["source_row_no", "disease_description", "repair_status_candidate", "quality_flag", "validation_status", "manual_review_required"]);
  const widthPath = writeCsv("b13_suspicious_width_candidates.csv", widthRows, ["source_row_no", "disease_description", "matched_text", "parsed_width_mm", "match_context", "detection_basis", "requires_manual_review"]);

  const issueTypeCounts = issueRows.reduce((acc, row) => {
    acc[row.issue_type] = (acc[row.issue_type] || 0) + 1;
    return acc;
  }, {});
  const needsReviewRows = summaryRows.filter((row) => row.validation_status === "needs_review").length;
  const mediaNeedsReview = mediaSummaryRows.filter((row) => row.validation_status === "needs_review").length;
  const batchStats = (await query(`SELECT row_count, valid_row_count, invalid_row_count, pending_review_count FROM staging.import_batch WHERE batch_id = $1`, [batch.batch_id]))[0];

  const reportLines = [
    "# B-13 staging import report",
    "",
    `Generated at: ${new Date().toISOString()}`,
    "",
    "## Source",
    "",
    `- Source file: ${batch.source_file_uri}`,
    `- Source SHA-256: ${batch.checksum_sha256}`,
    `- Import batch: ${batch.batch_id} (${batch.batch_code})`,
    "",
    "## Counts",
    "",
    "| Item | Count |",
    "|---|---:|",
    `| Raw records expected | 424 |`,
    `| Raw records in staging | ${rawRows.length} |`,
    `| Successful staging rows | ${batchStats.valid_row_count} |`,
    `| Pending review rows | ${needsReviewRows} |`,
    `| Invalid rows | ${batchStats.invalid_row_count} |`,
    `| Duplicate source rows | ${duplicateRows.length} |`,
    `| Embedded media expected | 389 |`,
    `| Media records in staging | ${mediaRows.length} |`,
    `| Clearly associated media | 0 |`,
    `| Media needing review | ${mediaNeedsReview} |`,
    `| Drawing anchor candidates | ${anchorRows.length} |`,
    `| Anchor candidates with source row | ${anchorRows.filter((row) => row.source_raw_id).length} |`,
    "",
    "## Quality Counts",
    "",
    "| Grade | Count |",
    "|---|---:|",
    `| A | ${qualityCounts.A} |`,
    `| B | ${qualityCounts.B} |`,
    `| C | ${qualityCounts.C} |`,
    `| R | ${qualityCounts.R} |`,
    "",
    "## Issue Type Counts",
    "",
    "| Issue | Count |",
    "|---|---:|",
    ...Object.entries(issueTypeCounts).sort((a, b) => b[1] - a[1]).map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## Formal Table Safety",
    "",
    "| Formal table | Row count after import |",
    "|---|---:|",
    `| inspect.disease_case | ${formalCounts.disease_case_count} |`,
    `| inspect.observation_value | ${formalCounts.observation_value_count} |`,
    `| analysis.evaluation_result | ${formalCounts.evaluation_result_count} |`,
    `| maintenance.work_order | ${formalCounts.work_order_count} |`,
    "",
    "No B-13 staging row was published to formal disease cases, observations, evaluations, or work orders in this round.",
    "",
    "## Output Files",
    "",
    `- ${path.relative(projectRoot, issuePath)}`,
    `- ${path.relative(projectRoot, rowSummaryPath)}`,
    `- ${path.relative(projectRoot, mediaSummaryPath)}`,
    `- ${path.relative(projectRoot, anchorSummaryPath)}`,
    `- ${path.relative(projectRoot, multiCrackPath)}`,
    `- ${path.relative(projectRoot, repairPath)}`,
    `- ${path.relative(projectRoot, widthPath)}`
  ];

  const reportPath = path.join(reportDir, "b13_staging_import_report.md");
  fs.writeFileSync(reportPath, reportLines.join("\n") + "\n", "utf8");

  console.log(JSON.stringify({
    report: reportPath,
    raw_rows: rawRows.length,
    media_rows: mediaRows.length,
    quality_counts: qualityCounts,
    issue_type_counts: issueTypeCounts,
    formal_counts: formalCounts,
    outputs: {
      issues: issuePath,
      row_summary: rowSummaryPath,
      media_summary: mediaSummaryPath,
      anchor_summary: anchorSummaryPath,
      multi_crack: multiCrackPath,
      recracking: repairPath,
      suspicious_widths: widthPath
    }
  }, null, 2));
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error(`B13 report generation failed: ${error.message}`);
      process.exitCode = 1;
    })
    .finally(async () => {
      await pool.end();
    });
}

module.exports = { multiCrackDetection, repairStatus, suspiciousWidths };

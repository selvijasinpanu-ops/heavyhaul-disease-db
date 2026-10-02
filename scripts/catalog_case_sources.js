const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const caseRoot = process.argv[2] || process.env.CASE_SOURCE_ROOT;
if (!caseRoot) {
  console.error("Case source root is required as an argument or CASE_SOURCE_ROOT");
  process.exit(1);
}
const projectRoot = path.join(__dirname, "..");
const reportDir = path.join(projectRoot, "reports");

const textExt = new Set([".doc", ".docx", ".pdf", ".xls", ".xlsx", ".csv"]);
const mediaExt = new Set([".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".gif", ".heic"]);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, files);
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function classify(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (textExt.has(ext)) return "document_or_table";
  if (mediaExt.has(ext)) return "media";
  return "other";
}

function bridgeHint(filePath) {
  const relative = path.relative(caseRoot, filePath);
  const parts = relative.split(path.sep);
  const joined = parts.join(" / ");
  const code = joined.match(/\bB[-_ ]?\d+[A-Z]?\b/i)?.[0] || "";
  const chainage = joined.match(/[KkＳS]?\d+\+\d+(?:\.\d+)?/)?.[0] || "";
  const folderHint = parts.length > 1 ? parts[0] : "";
  return { code, chainage, folderHint };
}

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });
  const files = walk(caseRoot).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
  const rows = [];
  const byExt = new Map();
  const byTopFolder = new Map();
  const byKind = new Map();

  for (const filePath of files) {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase() || "(none)";
    const kind = classify(filePath);
    const relativePath = path.relative(caseRoot, filePath);
    const topFolder = relativePath.includes(path.sep) ? relativePath.split(path.sep)[0] : "(root)";
    const hint = bridgeHint(filePath);
    const checksum = stat.size <= 250 * 1024 * 1024 ? await sha256(filePath) : "";

    byExt.set(ext, (byExt.get(ext) || 0) + 1);
    byTopFolder.set(topFolder, (byTopFolder.get(topFolder) || 0) + 1);
    byKind.set(kind, (byKind.get(kind) || 0) + 1);

    rows.push({
      relative_path: relativePath,
      extension: ext,
      kind,
      size_bytes: stat.size,
      last_write_time: stat.mtime.toISOString(),
      top_folder: topFolder,
      bridge_code_hint: hint.code,
      chainage_hint: hint.chainage,
      folder_hint: hint.folderHint,
      sha256: checksum
    });
  }

  const csv = [
    [
      "relative_path",
      "extension",
      "kind",
      "size_bytes",
      "last_write_time",
      "top_folder",
      "bridge_code_hint",
      "chainage_hint",
      "folder_hint",
      "sha256"
    ].map(csvCell).join(","),
    ...rows.map((row) => [
      row.relative_path,
      row.extension,
      row.kind,
      row.size_bytes,
      row.last_write_time,
      row.top_folder,
      row.bridge_code_hint,
      row.chainage_hint,
      row.folder_hint,
      row.sha256
    ].map(csvCell).join(","))
  ].join("\n") + "\n";

  fs.writeFileSync(path.join(reportDir, "case_source_inventory.csv"), csv, "utf8");

  const lines = [
    "# 案例资料来源清单",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    `案例目录：${caseRoot}`,
    "",
    `文件总数：${rows.length}`,
    "",
    "## 按类型统计",
    "",
    "| 类型 | 数量 |",
    "|---|---:|",
    ...Array.from(byKind.entries()).sort().map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## 按扩展名统计",
    "",
    "| 扩展名 | 数量 |",
    "|---|---:|",
    ...Array.from(byExt.entries()).sort().map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## 按顶层目录统计",
    "",
    "| 顶层目录 | 数量 |",
    "|---|---:|",
    ...Array.from(byTopFolder.entries()).sort((a, b) => b[1] - a[1]).map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## 数据库处理建议",
    "",
    "- Word、PDF、Excel 文件先登记为来源文件或导入批次，不直接写入正式病害实例。",
    "- 图片、TIF 等作为媒体附件建立文件指纹、相对路径和来源关系。",
    "- 桥梁调查表、病害情况表、单项病害汇总表优先进入 staging，人工核验后再发布到正式表。",
    "- 任何疑似错误数值保留原文，并以质量标记进入核验流程。"
  ];

  const mdPath = path.join(reportDir, "case_source_inventory.md");
  fs.writeFileSync(mdPath, lines.join("\n") + "\n", "utf8");

  console.log(JSON.stringify({
    case_root: caseRoot,
    file_count: rows.length,
    by_kind: Object.fromEntries(Array.from(byKind.entries()).sort()),
    by_extension: Object.fromEntries(Array.from(byExt.entries()).sort()),
    output_csv: path.join(reportDir, "case_source_inventory.csv"),
    output_md: mdPath
  }, null, 2));
}

main().catch((error) => {
  console.error(`Case source catalog failed: ${error.message}`);
  process.exit(1);
});

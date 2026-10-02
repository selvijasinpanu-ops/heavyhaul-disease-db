const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { multiCrackDetection, repairStatus, suspiciousWidths } = require("../scripts/generate_b13_reports");
const { stripDumpGuards } = require("../scripts/init_database");
const root = path.join(__dirname, "..");

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (["node_modules", ".git", "__pycache__"].includes(entry.name)) return [];
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(file) : [file];
  });
}
const files = sourceFiles(root);
const jsFiles = files.filter((file) => file.endsWith(".js"));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  assert.equal(result.status, 0, `${path.relative(root, file)}: ${result.stderr}`);
}
const pyFiles = files.filter((file) => file.endsWith(".py"));
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const pyResult = spawnSync(python, ["-c", "import ast,sys,pathlib; [ast.parse(pathlib.Path(p).read_text(encoding='utf-8-sig'), filename=p) for p in sys.argv[1:]]", ...pyFiles], { encoding: "utf8" });
assert.equal(pyResult.status, 0, pyResult.stderr || "Python is required for source validation.");

assert.equal(multiCrackDetection("掉块尺寸900mm×110mm×60mm").count, 0);
assert(multiCrackDetection("存在2条裂缝").count >= 2);
assert(multiCrackDetection("L2=3m，W2=6mm").count >= 2);
assert.equal(repairStatus("已修补").flag, "B");
assert.equal(repairStatus("修补后开裂").flag, "R");
assert.equal(suspiciousWidths("W=6mm").length, 1);
assert.equal(suspiciousWidths("掉块长宽高：900mm×110mm×60mm").length, 0);
assert.equal(stripDumpGuards("\\restrict test\nSELECT 1;\n\\unrestrict test"), "SELECT 1;");

const manifest = JSON.parse(fs.readFileSync(path.join(root, "db", "migration_checksums.json"), "utf8"));
const crypto = require("node:crypto");
for (const [name, expected] of Object.entries(manifest)) {
  const actual = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, "db", "migrations", name))).digest("hex");
  assert.equal(actual, expected, `Published migration changed: ${name}`);
}
console.log(`Source validation passed: ${jsFiles.length} JavaScript files, ${pyFiles.length} Python files, ${Object.keys(manifest).length} original migration checksums and quality parsing cases. No database or field data was used.`);

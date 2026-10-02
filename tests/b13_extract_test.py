import csv
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_XLSX = Path(os.environ["B13_XLSX_PATH"]) if os.environ.get("B13_XLSX_PATH") else None
PYTHON = sys.executable


class B13ExtractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if SOURCE_XLSX is None:
            raise unittest.SkipTest("Set B13_XLSX_PATH to run the real XLSX integration test")
        cls.output_dir = Path(tempfile.mkdtemp(prefix="b13_extract_test_"))
        cls.default_output_dir = PROJECT_ROOT / "staging_output"
        cls.default_output_hashes_before = cls._directory_hashes(cls.default_output_dir)
        result = subprocess.run(
            [PYTHON, "scripts/extract_b13_staging.py", str(SOURCE_XLSX), "--output-dir", str(cls.output_dir)],
            cwd=PROJECT_ROOT,
            text=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
        )
        cls.extract_result = result
        if result.returncode != 0:
            raise AssertionError(result.stderr or result.stdout)
        cls.default_output_hashes_after = cls._directory_hashes(cls.default_output_dir)
        cls.rows_path = cls.output_dir / "b13_raw_rows.jsonl"
        cls.media_path = cls.output_dir / "b13_media_manifest.csv"
        cls.anchor_path = cls.output_dir / "b13_media_anchor_candidates.csv"
        cls.rows = [json.loads(line) for line in cls.rows_path.read_text(encoding="utf-8").splitlines() if line]
        with cls.media_path.open(encoding="utf-8-sig", newline="") as file:
            cls.media = list(csv.DictReader(file))

    @staticmethod
    def _directory_hashes(directory):
        if not directory.exists():
            return {}
        return {
            str(path.relative_to(directory)): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in directory.rglob("*")
            if path.is_file()
        }

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, "output_dir"):
            import shutil
            shutil.rmtree(cls.output_dir, ignore_errors=True)

    def test_extract_row_count_is_424(self):
        self.assertEqual(len(self.rows), 424)

    def test_excel_row_range_is_8_to_431(self):
        row_numbers = [int(row["source_row_no"]) for row in self.rows]
        self.assertEqual(min(row_numbers), 8)
        self.assertEqual(max(row_numbers), 431)
        self.assertEqual(row_numbers, list(range(8, 432)))

    def test_embedded_media_count_is_389(self):
        self.assertEqual(len(self.media), 389)
        self.assertTrue(all(row["checksum_sha256"] for row in self.media))

    def test_anchor_candidates_are_retained(self):
        with self.anchor_path.open(encoding="utf-8-sig", newline="") as file:
            anchors = list(csv.DictReader(file))
        self.assertGreater(len(anchors), 0)
        self.assertGreater(len(anchors), len(self.media))
        self.assertTrue(all(row["validation_status"] == "needs_review" for row in anchors))

    def test_output_dir_isolated_from_project_staging_output(self):
        self.assertEqual(self.default_output_hashes_after, self.default_output_hashes_before)
        self.assertTrue(self.rows_path.is_relative_to(self.output_dir))
        self.assertTrue(self.media_path.is_relative_to(self.output_dir))
        self.assertTrue(self.anchor_path.is_relative_to(self.output_dir))

    def test_missing_file_errors_clearly(self):
        result = subprocess.run(
            [PYTHON, "scripts/extract_b13_staging.py", "missing_b13.xlsx"],
            cwd=PROJECT_ROOT,
            text=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Source file not found", (result.stderr or "") + (result.stdout or ""))

    def test_suspicious_values_preserve_raw_text(self):
        all_text = "\n".join(row["raw_text"] for row in self.rows)
        self.assertIn("065m", all_text)
        self.assertTrue("038m2" in all_text or "038m²" in all_text)
        self.assertRegex(all_text, re.compile(r"(^|[^0-9.])(6|8|10)\s*(mm|毫米)", re.MULTILINE))

    def test_env_content_not_written_to_outputs(self):
        output_text = self.rows_path.read_text(encoding="utf-8") + self.media_path.read_text(encoding="utf-8-sig")
        self.assertNotIn("PGPASSWORD", output_text)
        self.assertNotIn("password", output_text.lower())
        self.assertNotIn("local-db-password", output_text)


if __name__ == "__main__":
    unittest.main()

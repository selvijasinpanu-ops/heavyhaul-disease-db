import csv
import hashlib
import json
import mimetypes
import os
import posixpath
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships"
DOC_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
DRAW_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"
A_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"

NS = {
    "main": MAIN_NS,
    "rel": REL_NS,
    "xdr": DRAW_NS,
    "a": A_NS,
}

DATA_START_ROW = 8
DATA_END_ROW = 431
EXPECTED_ROW_COUNT = 424
EXPECTED_MEDIA_COUNT = 389
OUTPUT_DIR = Path("staging_output")


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def read_xml(zf, name):
    try:
        return ET.fromstring(zf.read(name))
    except KeyError:
        return None


def column_label_to_number(label):
    value = 0
    for char in label:
        value = value * 26 + ord(char.upper()) - ord("A") + 1
    return value


def number_to_column_label(value):
    label = ""
    while value:
        value, remainder = divmod(value - 1, 26)
        label = chr(ord("A") + remainder) + label
    return label


def split_cell_ref(ref):
    match = re.match(r"^([A-Z]+)(\d+)$", ref)
    if not match:
        return None, None
    return column_label_to_number(match.group(1)), int(match.group(2))


def load_shared_strings(zf):
    xml = read_xml(zf, "xl/sharedStrings.xml")
    if xml is None:
        return []
    values = []
    for item in xml.findall("main:si", NS):
        parts = [node.text or "" for node in item.findall(".//main:t", NS)]
        values.append("".join(parts))
    return values


def cell_text(cell, shared_strings):
    inline = cell.find("main:is/main:t", NS)
    if inline is not None:
        return inline.text or ""
    value_node = cell.find("main:v", NS)
    if value_node is None:
        return ""
    value = value_node.text or ""
    if cell.attrib.get("t") == "s":
        try:
            return shared_strings[int(value)]
        except (ValueError, IndexError):
            return value
    return value


def workbook_sheet_paths(zf):
    workbook = read_xml(zf, "xl/workbook.xml")
    rels = read_xml(zf, "xl/_rels/workbook.xml.rels")
    if workbook is None or rels is None:
        raise RuntimeError("Invalid XLSX: missing workbook relationships")
    rel_map = {rel.attrib.get("Id"): rel.attrib.get("Target") for rel in rels}
    sheets = {}
    for sheet in workbook.findall("main:sheets/main:sheet", NS):
        rid = sheet.attrib.get(f"{{{DOC_REL_NS}}}id")
        target = rel_map.get(rid)
        if target:
            sheets[sheet.attrib.get("name")] = "xl/" + target.lstrip("/")
    return sheets


def load_sheet_rows(sheet_xml, shared_strings):
    rows = {}
    for row in sheet_xml.findall("main:sheetData/main:row", NS):
        row_no = int(row.attrib.get("r", "0") or 0)
        values = {}
        for cell in row.findall("main:c", NS):
            ref = cell.attrib.get("r")
            col, _ = split_cell_ref(ref)
            if col:
                values[number_to_column_label(col)] = cell_text(cell, shared_strings)
        rows[row_no] = values
    return rows


def build_merge_fill_map(sheet_xml, raw_rows):
    fills = {}
    merge_parent = {}
    merge_cells = sheet_xml.find("main:mergeCells", NS)
    if merge_cells is None:
        return fills, merge_parent
    for merge in merge_cells.findall("main:mergeCell", NS):
        ref = merge.attrib.get("ref", "")
        if ":" not in ref:
            continue
        start, end = ref.split(":", 1)
        start_col, start_row = split_cell_ref(start)
        end_col, end_row = split_cell_ref(end)
        if not all([start_col, start_row, end_col, end_row]):
            continue
        top_value = raw_rows.get(start_row, {}).get(number_to_column_label(start_col), "")
        for row_no in range(start_row, end_row + 1):
            for col_no in range(start_col, end_col + 1):
                col_label = number_to_column_label(col_no)
                fills[(row_no, col_label)] = top_value
                merge_parent[(row_no, col_label)] = start
    return fills, merge_parent


def normalized_text(value):
    if value is None:
        return ""
    return str(value).replace("\r\n", "\n").replace("\r", "\n")


def extract_rows(zf, sheet_path, source_path, source_sha):
    shared_strings = load_shared_strings(zf)
    sheet_xml = read_xml(zf, sheet_path)
    if sheet_xml is None:
        raise RuntimeError(f"Missing worksheet XML: {sheet_path}")
    raw_rows = load_sheet_rows(sheet_xml, shared_strings)
    merge_fills, merge_parent = build_merge_fill_map(sheet_xml, raw_rows)

    records = []
    for row_no in range(DATA_START_ROW, DATA_END_ROW + 1):
        raw_cells = {}
        effective_cells = {}
        for col in [number_to_column_label(i) for i in range(column_label_to_number("B"), column_label_to_number("I") + 1)]:
            raw_value = normalized_text(raw_rows.get(row_no, {}).get(col, ""))
            effective_value = raw_value if raw_value else normalized_text(merge_fills.get((row_no, col), ""))
            raw_cells[col] = raw_value
            effective_cells[col] = effective_value
        photo_ref_raw = " | ".join([part for part in [effective_cells.get("D", ""), effective_cells.get("E", "")] if part])
        raw_text = " | ".join([effective_cells[col] for col in effective_cells if effective_cells[col]])
        raw_payload = {
            "raw_cells": raw_cells,
            "effective_cells": effective_cells,
            "merge_parent": {
                col: merge_parent.get((row_no, col))
                for col in effective_cells
                if merge_parent.get((row_no, col))
            },
        }
        records.append({
            "source_row_no": row_no,
            "sheet_name": "Sheet1",
            "source_file_name": source_path.name,
            "source_file_path": str(source_path),
            "source_file_sha256": source_sha,
            "location_text": effective_cells.get("B", ""),
            "disease_description": effective_cells.get("C", ""),
            "photo_ref_raw": photo_ref_raw,
            "source_text": effective_cells.get("F", ""),
            "native_grade": effective_cells.get("G", ""),
            "proposed_action": effective_cells.get("H", ""),
            "raw_payload": raw_payload,
            "raw_text": raw_text,
            "quality_flag": "B",
            "validation_status": "pending",
            "validation_message": "",
            "correction_status": "uncorrected",
            "correction_note": "",
        })
    return records


def resolve_zip_target(owner_part_path, relationship_target):
    target = (relationship_target or "").replace("\\", "/")
    if target.startswith("/"):
        return posixpath.normpath(target.lstrip("/"))
    return posixpath.normpath(posixpath.join(posixpath.dirname(owner_part_path), target))


def worksheet_drawing_paths(zf, sheet_path):
    sheet_xml = read_xml(zf, sheet_path)
    if sheet_xml is None:
        return []
    drawings = []
    rels_path = str(Path(sheet_path).parent / "_rels" / (Path(sheet_path).name + ".rels")).replace("\\", "/")
    rels_xml = read_xml(zf, rels_path)
    if rels_xml is None:
        return drawings
    rel_map = {rel.attrib.get("Id"): rel.attrib.get("Target") for rel in rels_xml}
    for drawing in sheet_xml.findall("main:drawing", NS):
        rid = drawing.attrib.get(f"{{{DOC_REL_NS}}}id")
        target = rel_map.get(rid)
        if target:
            drawings.append(resolve_zip_target(sheet_path, target))
    return drawings


def drawing_media_anchors(zf, drawing_path):
    drawing_xml = read_xml(zf, drawing_path)
    rels_path = str(Path(drawing_path).parent / "_rels" / (Path(drawing_path).name + ".rels")).replace("\\", "/")
    rels_xml = read_xml(zf, rels_path)
    if drawing_xml is None or rels_xml is None:
        return {}
    rel_map = {rel.attrib.get("Id"): rel.attrib.get("Target") for rel in rels_xml}
    anchors = []
    for anchor_sequence, anchor in enumerate(list(drawing_xml), start=1):
        if not anchor.tag.endswith("Anchor"):
            continue
        from_node = anchor.find("xdr:from", NS)
        row = None
        col = None
        if from_node is not None:
            row_node = from_node.find("xdr:row", NS)
            col_node = from_node.find("xdr:col", NS)
            if row_node is not None and row_node.text is not None:
                row = int(row_node.text) + 1
            if col_node is not None and col_node.text is not None:
                col = int(col_node.text) + 1
        blip = anchor.find(".//a:blip", NS)
        rid = blip.attrib.get(f"{{{DOC_REL_NS}}}embed") if blip is not None else None
        target = rel_map.get(rid)
        if target:
            media_path = resolve_zip_target(drawing_path, target)
            to_node = anchor.find("xdr:to", NS)
            to_row = to_col = None
            if to_node is not None:
                to_row_node = to_node.find("xdr:row", NS)
                to_col_node = to_node.find("xdr:col", NS)
                to_row = int(to_row_node.text) + 1 if to_row_node is not None and to_row_node.text else None
                to_col = int(to_col_node.text) + 1 if to_col_node is not None and to_col_node.text else None
            anchors.append({
                "media_path": media_path,
                "anchor_sequence": anchor_sequence,
                "anchor_type": anchor.tag.rsplit("}", 1)[-1],
                "anchor_row": row,
                "anchor_column": col,
                "to_row": to_row,
                "to_column": to_col,
                "drawing_path": drawing_path,
            })
    return anchors


def extract_media_manifest(zf, sheet_path, row_by_number):
    media_paths = sorted([name for name in zf.namelist() if name.lower().startswith("xl/media/")])
    anchor_map = {}
    for drawing_path in worksheet_drawing_paths(zf, sheet_path):
        for anchor in drawing_media_anchors(zf, drawing_path):
            anchor_map.setdefault(anchor["media_path"], []).append(anchor)

    rows = []
    for index, media_path in enumerate(media_paths, start=1):
        data = zf.read(media_path)
        suffix = Path(media_path).suffix.lower()
        mime_type = mimetypes.types_map.get(suffix, "application/octet-stream")
        anchors = anchor_map.get(media_path, [])
        anchor = anchors[0] if anchors else {}
        anchor_row = anchor.get("anchor_row")
        candidate = row_by_number.get(anchor_row, {}).get("photo_ref_raw", "") if anchor_row in row_by_number else ""
        confidence = "anchor_row_candidate" if anchor_row in row_by_number else "none"
        status = "needs_review"
        message = "Anchored to an Excel row; candidate only, requires manual review." if candidate else "No reliable disease-row relationship was committed."
        rows.append({
            "media_sequence": index,
            "internal_path": media_path,
            "original_file_name": Path(media_path).name,
            "extension": suffix,
            "mime_type": mime_type,
            "file_size_bytes": len(data),
            "checksum_sha256": sha256_bytes(data),
            "related_sheet": "Sheet1" if anchor else "",
            "anchor_row": anchor_row or "",
            "anchor_column": anchor.get("anchor_column") or "",
            "anchor_count": len(anchors),
            "photo_ref_candidate": candidate,
            "relation_confidence": confidence,
            "validation_status": status,
            "validation_message": message,
        })
    return rows


def extract_anchor_candidates(zf, sheet_path, row_by_number, media_rows):
    media_by_path = {row["internal_path"]: row for row in media_rows}
    candidates = []
    sequence = 0
    for drawing_path in worksheet_drawing_paths(zf, sheet_path):
        for anchor in drawing_media_anchors(zf, drawing_path):
            sequence += 1
            media = media_by_path.get(anchor["media_path"])
            if not media:
                continue
            row_no = anchor["anchor_row"]
            row = row_by_number.get(row_no)
            candidates.append({
                "media_sequence": media["media_sequence"],
                "internal_path": anchor["media_path"],
                "drawing_path": anchor["drawing_path"],
                "drawing_anchor_sequence": anchor["anchor_sequence"],
                "anchor_type": anchor["anchor_type"],
                "anchor_row": anchor["anchor_row"] or "",
                "anchor_column": anchor["anchor_column"] or "",
                "to_row": anchor["to_row"] or "",
                "to_column": anchor["to_column"] or "",
                "source_row_candidate": row_no if row_no in row_by_number else "",
                "photo_ref_candidate": row.get("photo_ref_raw", "") if row else "",
                "relation_confidence": "anchor_row_candidate" if row else "none",
                "validation_status": "needs_review",
                "validation_message": "Candidate only; do not create formal case_attachment automatically.",
            })
    return candidates


def write_jsonl(path, rows):
    with path.open("w", encoding="utf-8", newline="\n") as file:
        for row in rows:
            file.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def write_csv(path, rows):
    fieldnames = [
        "media_sequence",
        "internal_path",
        "original_file_name",
        "extension",
        "mime_type",
        "file_size_bytes",
        "checksum_sha256",
        "related_sheet",
        "anchor_row",
        "anchor_column",
        "anchor_count",
        "photo_ref_candidate",
        "relation_confidence",
        "validation_status",
        "validation_message",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def write_anchor_csv(path, rows):
    fieldnames = [
        "media_sequence", "internal_path", "drawing_path", "drawing_anchor_sequence",
        "anchor_type", "anchor_row", "anchor_column", "to_row", "to_column",
        "source_row_candidate", "photo_ref_candidate", "relation_confidence",
        "validation_status", "validation_message"
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("xlsx_path", nargs="?", default=None)
    parser.add_argument("--output-dir", default=str(OUTPUT_DIR))
    args = parser.parse_args()
    source_arg = args.xlsx_path or os.environ.get("B13_XLSX_PATH")
    if not source_arg:
        raise SystemExit("B-13 xlsx path is required as an argument or B13_XLSX_PATH")

    source_path = Path(source_arg).resolve()
    if not source_path.exists():
        raise FileNotFoundError(f"Source file not found: {source_path}")

    source_sha = sha256_file(source_path)
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    rows_path = output_dir / "b13_raw_rows.jsonl"
    media_path = output_dir / "b13_media_manifest.csv"
    anchor_path = output_dir / "b13_media_anchor_candidates.csv"

    with zipfile.ZipFile(source_path) as zf:
        sheet_paths = workbook_sheet_paths(zf)
        sheet_path = sheet_paths.get("Sheet1")
        if not sheet_path:
            raise RuntimeError("Sheet1 was not found")
        records = extract_rows(zf, sheet_path, source_path, source_sha)
        if len(records) != EXPECTED_ROW_COUNT:
            raise RuntimeError(f"Expected {EXPECTED_ROW_COUNT} raw rows, got {len(records)}")
        row_by_number = {record["source_row_no"]: record for record in records}
        media_rows = extract_media_manifest(zf, sheet_path, row_by_number)
        if len(media_rows) != EXPECTED_MEDIA_COUNT:
            raise RuntimeError(f"Expected {EXPECTED_MEDIA_COUNT} embedded media objects, got {len(media_rows)}")
        anchor_rows = extract_anchor_candidates(zf, sheet_path, row_by_number, media_rows)

    write_jsonl(rows_path, records)
    write_csv(media_path, media_rows)
    write_anchor_csv(anchor_path, anchor_rows)
    print(json.dumps({
        "source_file": str(source_path),
        "source_file_sha256": source_sha,
        "raw_rows": len(records),
        "media_objects": len(media_rows),
        "raw_rows_output": str(rows_path),
        "media_manifest_output": str(media_path),
        "media_anchor_candidates": len(anchor_rows),
        "media_anchor_output": str(anchor_path),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

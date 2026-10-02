import json
import re
import sys
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET


NS = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def dimension_to_bounds(ref):
    if not ref:
        return None
    last = ref.split(":")[-1]
    match = re.match(r"([A-Z]+)(\d+)$", last)
    if not match:
        return None
    col_label, row = match.groups()
    col = 0
    for char in col_label:
        col = col * 26 + (ord(char) - ord("A") + 1)
    return {"last_cell": last, "max_column": col, "max_row": int(row)}


def read_xml(zf, name):
    try:
        return ET.fromstring(zf.read(name))
    except KeyError:
        return None


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
    value_node = cell.find("main:v", NS)
    inline_node = cell.find("main:is/main:t", NS)
    if inline_node is not None:
        return inline_node.text or ""
    if value_node is None:
        return ""
    value = value_node.text or ""
    if cell.attrib.get("t") == "s":
        try:
            return shared_strings[int(value)]
        except (ValueError, IndexError):
            return value
    return value


def read_sheet_profile(xml, shared_strings, sample_limit=12):
    rows = []
    non_empty_rows = 0
    max_non_empty_row = 0
    for row in xml.findall("main:sheetData/main:row", NS):
        row_index = int(row.attrib.get("r", "0") or 0)
        cells = []
        for cell in row.findall("main:c", NS):
            text = cell_text(cell, shared_strings).strip()
            if text:
                cells.append({"ref": cell.attrib.get("r"), "text": text[:160]})
        if cells:
            non_empty_rows += 1
            max_non_empty_row = max(max_non_empty_row, row_index)
            if len(rows) < sample_limit:
                rows.append({"row": row_index, "cells": cells})
    return {
        "non_empty_rows": non_empty_rows,
        "max_non_empty_row": max_non_empty_row,
        "sample_rows": rows,
    }


def inspect_xlsx(path):
    path = Path(path)
    with zipfile.ZipFile(path) as zf:
        names = zf.namelist()
        workbook = read_xml(zf, "xl/workbook.xml")
        shared_strings = load_shared_strings(zf)
        rels = read_xml(zf, "xl/_rels/workbook.xml.rels")
        rel_map = {}
        if rels is not None:
            for rel in rels:
                rel_map[rel.attrib.get("Id")] = rel.attrib.get("Target")

        sheets = []
        if workbook is not None:
            for sheet in workbook.findall("main:sheets/main:sheet", NS):
                rid = sheet.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
                target = rel_map.get(rid, "")
                sheet_path = "xl/" + target.lstrip("/")
                xml = read_xml(zf, sheet_path)
                dimension = None
                row_count = None
                if xml is not None:
                    dim = xml.find("main:dimension", NS)
                    dimension = dim.attrib.get("ref") if dim is not None else None
                    row_count = sum(1 for _ in xml.findall("main:sheetData/main:row", NS))
                    profile = read_sheet_profile(xml, shared_strings)
                else:
                    profile = {}
                sheets.append({
                    "name": sheet.attrib.get("name"),
                    "sheet_id": sheet.attrib.get("sheetId"),
                    "path": sheet_path,
                    "dimension": dimension,
                    "bounds": dimension_to_bounds(dimension),
                    "xml_row_elements": row_count,
                    **profile,
                })

        media = [name for name in names if name.lower().startswith("xl/media/")]
        drawings = [name for name in names if name.lower().startswith("xl/drawings/")]
        comments = [name for name in names if name.lower().startswith("xl/comments")]

        return {
            "file": str(path),
            "size_bytes": path.stat().st_size,
            "sheet_count": len(sheets),
            "sheets": sheets,
            "embedded_media_count": len(media),
            "drawing_part_count": len(drawings),
            "comment_part_count": len(comments),
            "media_extension_counts": {
                ext: sum(1 for name in media if Path(name).suffix.lower() == ext)
                for ext in sorted({Path(name).suffix.lower() for name in media})
            },
        }


def main():
    if len(sys.argv) < 2:
        raise SystemExit("Usage: inspect_xlsx_package.py <xlsx-path> [output-json]")
    result = inspect_xlsx(sys.argv[1])
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if len(sys.argv) >= 3:
        out = Path(sys.argv[2])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()

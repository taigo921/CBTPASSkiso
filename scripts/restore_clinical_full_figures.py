#!/usr/bin/env python3
"""Restore complete clinical figures while removing page text and sidebars.

The crop coordinates are measured on a 1,255 x 1,793 render of the source
clinical PDF.  Each question is rebuilt from its individual figure panels so
that no photograph, radiograph, histology panel, or graph is lost.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
REFERENCE_SIZE = (1255, 1793)
GAP = 16

# PDF pages are zero based. Boxes use the 180 dpi reference render above.
FIGURES = {
    "E2-4-3-062": {
        "file": "data/E2.json",
        "page": 154,
        "layout": "rows",
        "panels": [[(742, 245, 1136, 540)], [(458, 548, 1136, 882)]],
    },
    "E2-4-6-141": {
        "file": "data/E2.json",
        "page": 201,
        "layout": "columns",
        "panels": [
            [(465, 322, 856, 582), (465, 774, 858, 1069)],
            [(866, 275, 1151, 583), (868, 592, 1152, 1069)],
        ],
    },
    "E2-4-7-152": {
        "file": "data/E2.json",
        "page": 206,
        "layout": "rows",
        "panels": [[(743, 165, 1135, 440)], [(458, 450, 1134, 789)]],
    },
    "E3-3-3-090": {
        "file": "data/E3.json",
        "page": 320,
        "layout": "rows",
        "panels": [[(743, 198, 1135, 501)], [(459, 510, 1135, 823)]],
    },
    "E4-1-035": {
        "file": "data/E4.json",
        "page": 441,
        "layout": "rows",
        "panels": [
            [(411, 500, 805, 761), (812, 499, 1152, 761)],
            [(412, 768, 807, 1043)],
            [(535, 1051, 1153, 1612)],
        ],
    },
}


def crop_panels(page: Image.Image, groups: list[list[tuple[int, int, int, int]]]):
    scale_x = page.width / REFERENCE_SIZE[0]
    scale_y = page.height / REFERENCE_SIZE[1]
    return [
        [
            page.crop(tuple(round(value * (scale_x if i % 2 == 0 else scale_y)) for i, value in enumerate(box)))
            for box in group
        ]
        for group in groups
    ]


def compose_rows(rows: list[list[Image.Image]]) -> Image.Image:
    widths = [sum(panel.width for panel in row) + GAP * (len(row) - 1) for row in rows]
    heights = [max(panel.height for panel in row) for row in rows]
    output = Image.new("RGB", (max(widths), sum(heights) + GAP * (len(rows) - 1)), "white")
    y = 0
    for row, width, height in zip(rows, widths, heights):
        x = (output.width - width) // 2
        for panel in row:
            output.paste(panel, (x, y + (height - panel.height) // 2))
            x += panel.width + GAP
        y += height + GAP
    return output


def compose_columns(columns: list[list[Image.Image]]) -> Image.Image:
    widths = [max(panel.width for panel in column) for column in columns]
    heights = [sum(panel.height for panel in column) + GAP * (len(column) - 1) for column in columns]
    output = Image.new("RGB", (sum(widths) + GAP * (len(columns) - 1), max(heights)), "white")
    x = 0
    for column, width in zip(columns, widths):
        y = 0
        for panel in column:
            output.paste(panel, (x + (width - panel.width) // 2, y))
            y += panel.height + GAP
        x += width + GAP
    return output


def encode_webp(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, "WEBP", quality=90, method=6)
    return "data:image/webp;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="clinical source PDF")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--preview-dir", type=Path, default=Path("/tmp/clinical-full-figure-previews"))
    args = parser.parse_args()

    args.preview_dir.mkdir(parents=True, exist_ok=True)
    document = fitz.open(args.source)
    files: dict[Path, list[dict]] = {}

    for uid, spec in FIGURES.items():
        page = document[spec["page"]]
        pixmap = page.get_pixmap(matrix=fitz.Matrix(3, 3), alpha=False)
        rendered = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        panels = crop_panels(rendered, spec["panels"])
        image = compose_columns(panels) if spec["layout"] == "columns" else compose_rows(panels)
        image.save(args.preview_dir / f"{uid}.webp", "WEBP", quality=90, method=6)
        print(f"{uid}: page {spec['page'] + 1}, {image.width}x{image.height}")

        path = ROOT / spec["file"]
        questions = files.setdefault(path, json.loads(path.read_text(encoding="utf-8")))
        question = next(question for question in questions if question.get("uid") == uid)
        question["image_base64"] = encode_webp(image)
        question["has_image"] = True

    if args.apply:
        for path, questions in files.items():
            path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

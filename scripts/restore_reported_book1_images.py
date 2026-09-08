#!/usr/bin/env python3
"""Restore complete figures for reported Problem Book 1 crop defects.

Each entry is deliberately tied to its source PDF page and a reviewed crop.
Run without ``--apply`` to write visual previews; only ``--apply`` changes the
corresponding JSON image payloads.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from dataclasses import dataclass
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT / "github-current"
PREVIEW_DIR = ROOT / "tmp/pdfs/reported-clipped-preview"
RENDER_SCALE = 3.0555555556  # 1534 × 2192 from the reviewed source pages.


@dataclass(frozen=True)
class Fix:
    uid: str
    data_file: str
    pdf_file: str
    page_index: int  # zero-based
    crop: tuple[int, int, int, int]


# Coordinates include every diagram label/legend but exclude the duplicated
# structured question text and the printed explanation.
FIXES = (
    Fix("A2-001", "data/1-60.json", "1−30.pdf", 21, (1000, 230, 1420, 720)),
    Fix("B2-073", "data/61-90.json", "61−90.pdf", 29, (430, 435, 1410, 995)),
    Fix("B3-001", "data/91-120.json", "91−120pdf.pdf", 14, (630, 265, 1440, 755)),
    Fix("B4-024", "data/121-144.json", "121−144pdf.pdf", 9, (1070, 1160, 1430, 1480)),
    Fix("B4-025", "data/121-144.json", "121−144pdf.pdf", 10, (330, 270, 940, 430)),
    Fix("C1-003", "data/145-174.json", "145−174pdf.pdf", 2, (750, 230, 1410, 620)),
)


def encode(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=95, subsampling=0, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def render_crop(fix: Fix) -> Image.Image:
    pdf_path = ROOT / fix.pdf_file
    page = pdfium.PdfDocument(pdf_path)[fix.page_index].render(scale=RENDER_SCALE).to_pil().convert("RGB")
    if page.size != (1534, 2192):
        raise RuntimeError(f"Unexpected render size for {pdf_path.name}: {page.size}")
    return page.crop(fix.crop)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="write reviewed crops into question JSON")
    args = parser.parse_args()

    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    crops = {fix.uid: render_crop(fix) for fix in FIXES}
    for uid, crop in crops.items():
        preview = PREVIEW_DIR / f"{uid}.jpg"
        crop.save(preview, quality=95, subsampling=0)
        print(f"{uid}: {crop.width}x{crop.height} -> {preview}")

    if not args.apply:
        return

    fixes_by_file: dict[str, list[Fix]] = {}
    for fix in FIXES:
        fixes_by_file.setdefault(fix.data_file, []).append(fix)
    for relative_path, file_fixes in fixes_by_file.items():
        path = REPO / relative_path
        questions = json.loads(path.read_text(encoding="utf-8"))
        by_uid = {str(question.get("uid")): question for question in questions}
        for fix in file_fixes:
            question = by_uid[fix.uid]
            question["image_base64"] = encode(crops[fix.uid])
            question.pop("image", None)
            question["has_image"] = True
        path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

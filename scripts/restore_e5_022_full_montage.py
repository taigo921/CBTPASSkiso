#!/usr/bin/env python3
"""Restore the complete four-photo montage for E5-1-022 from the source PDF."""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT / "github-current"
SOURCE_PDF = ROOT / "臨床.pdf"
PREVIEW = ROOT / "tmp/pdfs/reported-clipped-preview/E5-1-022.jpg"
UID = "E5-1-022"

# Page 501 is zero-based index 500. The coordinates are for a 1534×2192 render
# and include all four panels plus their (ア)〜(エ) labels, without duplicated
# question text/choices or the page's right-side section tab.
PAGE_INDEX = 500
RENDER_SCALE = 3.0555555556
CROP = (740, 210, 1420, 1005)


def encode(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, format="JPEG", quality=95, subsampling=0, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    page = pdfium.PdfDocument(SOURCE_PDF)[PAGE_INDEX].render(scale=RENDER_SCALE).to_pil().convert("RGB")
    if page.size != (1534, 2192):
        raise RuntimeError(f"Unexpected source render size: {page.size}")
    montage = page.crop(CROP)
    PREVIEW.parent.mkdir(parents=True, exist_ok=True)
    montage.save(PREVIEW, quality=95, subsampling=0)
    print(f"{UID}: {montage.width}x{montage.height} -> {PREVIEW}")

    if not args.apply:
        return

    path = REPO / "data/E5.json"
    questions = json.loads(path.read_text(encoding="utf-8"))
    question = next(item for item in questions if item.get("uid") == UID)
    question["image_base64"] = encode(montage)
    question.pop("image", None)
    question["has_image"] = True
    path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

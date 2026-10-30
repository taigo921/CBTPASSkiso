#!/usr/bin/env python3
"""Restore the complete five-label figure for E3-4-2-106.

The source is page 393 (one-based) of the clinical problem-book PDF.  The PDF
is intentionally not tracked because it is about 1.3 GB.  This script records
the reviewed source page and crop so the embedded image can be reproduced.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
UID = "E3-4-2-106"
SOURCE_PAGE = 393
RENDER_DPI = 300
CROP = (645, 390, 1970, 970)


def extract(source: Path) -> Image.Image:
    pdf = pdfium.PdfDocument(source)
    page = pdf[SOURCE_PAGE - 1]
    rendered = page.render(scale=RENDER_DPI / 72).to_pil().convert("RGB")
    return rendered.crop(CROP)


def encode(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, "WEBP", quality=92, method=6)
    return "data:image/webp;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="path to the clinical problem-book PDF")
    parser.add_argument("--apply", action="store_true", help="update data/E3.json after writing the preview")
    args = parser.parse_args()

    image = extract(args.source)
    preview = Path("/tmp/E3-4-2-106-restored.webp")
    image.save(preview, "WEBP", quality=92, method=6)
    print(f"{UID}: page {SOURCE_PAGE}, crop {CROP}, {image.size} -> {preview}")

    if not args.apply:
        return

    data_path = ROOT / "data/E3.json"
    questions = json.loads(data_path.read_text(encoding="utf-8"))
    question = next(item for item in questions if item.get("uid") == UID)
    question["image_base64"] = encode(image)
    question["has_image"] = True
    question.pop("image", None)
    data_path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

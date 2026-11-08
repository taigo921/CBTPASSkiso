#!/usr/bin/env python3
"""Restore complete figures for reported E3 questions.

The source is the clinical problem-book PDF, which is intentionally not
tracked because it is about 1.3 GB.  Page numbers and 300 dpi crop boxes were
reviewed against the printed questions so these embedded figures can be
reproduced without relying on a hand-edited screenshot.
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
RENDER_DPI = 300
FIGURES = {
    # Four ameloblast maturation stages, all arrows, and the （ア） label.
    "E3-1-005": {"page": 252, "crop": (960, 330, 1925, 850)},
    # Gracey curette with all labels （ア）〜（オ）.
    "E3-3-3-097": {"page": 325, "crop": (890, 1675, 1935, 2140)},
    # Rest-position and denture-wearing measurements shown side by side.
    "E3-4-2-098": {"page": 389, "crop": (1025, 345, 1915, 1065)},
}


def render_crop(document: pdfium.PdfDocument, page_number: int, crop: tuple[int, int, int, int]) -> Image.Image:
    page = document[page_number - 1]
    rendered = page.render(scale=RENDER_DPI / 72).to_pil().convert("RGB")
    return rendered.crop(crop)


def encode(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, "WEBP", quality=92, method=6)
    return "data:image/webp;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="path to the clinical problem-book PDF")
    parser.add_argument("--apply", action="store_true", help="update data/E3.json")
    parser.add_argument("--preview-dir", type=Path, default=Path("/tmp/reported-e3-figures"))
    args = parser.parse_args()

    args.preview_dir.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(args.source)
    restored: dict[str, Image.Image] = {}

    for uid, spec in FIGURES.items():
        image = render_crop(document, spec["page"], spec["crop"])
        restored[uid] = image
        preview = args.preview_dir / f"{uid}.webp"
        image.save(preview, "WEBP", quality=92, method=6)
        print(f"{uid}: page {spec['page']}, crop {spec['crop']}, {image.size} -> {preview}")

    if not args.apply:
        return

    data_path = ROOT / "data/E3.json"
    questions = json.loads(data_path.read_text(encoding="utf-8"))
    by_uid = {question.get("uid"): question for question in questions}
    for uid, image in restored.items():
        question = by_uid[uid]
        question["image_base64"] = encode(image)
        question["has_image"] = True
        question.pop("image", None)
    data_path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

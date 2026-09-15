#!/usr/bin/env python3
"""Restore full figures for the five images reported on 2026-09-15.

The clinical source payloads in ``../tmp/pdfs/enriched`` retain the complete
question panel.  The one basic-science figure is rebuilt from its source PDF.
Run without ``--apply`` to write inspected previews; only ``--apply`` updates
the five corresponding data records.
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
WORKSPACE = ROOT.parent
PREVIEW_DIR = WORKSPACE / "tmp/pdfs/reported-clipped-preview"


def decode(payload: str) -> Image.Image:
    return Image.open(io.BytesIO(base64.b64decode(payload.split(",", 1)[-1]))).convert("RGB")


def encode(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, "JPEG", quality=95, subsampling=0, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def clinical_crop(uid: str, box: tuple[int, int, int, int]) -> Image.Image:
    source_path = WORKSPACE / "tmp/pdfs/enriched" / ("臨床_E-1.json" if uid == "E1-3-028" else "臨床_E-3.json")
    questions = json.loads(source_path.read_text(encoding="utf-8"))
    question = next(item for item in questions if item.get("uid") == uid)
    return decode(question["image_base64"]).crop(box)


def cell_cytoskeleton() -> Image.Image:
    # Page 3 contains C2-063. The crop contains the whole cell figure and its
    # red arrow, but omits the duplicated question text and answer explanation.
    page = pdfium.PdfDocument(WORKSPACE / "175-204.pdf")[2].render(scale=3.0555555556).to_pil().convert("RGB")
    return page.crop((1118, 215, 1405, 660))


TARGETS = {
    "E3-1-002": ("data/E3.json", lambda: clinical_crop("E3-1-002", (475, 20, 858, 322))),
    "E3-1-006": ("data/E3.json", lambda: clinical_crop("E3-1-006", (208, 64, 856, 395))),
    "E3-3-2-068": ("data/E3.json", lambda: clinical_crop("E3-3-2-068", (235, 69, 852, 645))),
    "E1-3-028": ("data/E1.json", lambda: clinical_crop("E1-3-028", (248, 52, 848, 500))),
    "C2-063": ("data/175-204.json", cell_cytoskeleton),
}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    images = {uid: create() for uid, (_, create) in TARGETS.items()}
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for uid, image in images.items():
        preview = PREVIEW_DIR / f"{uid}-restored.jpg"
        image.save(preview, quality=95, subsampling=0)
        print(f"{uid}: {image.size} -> {preview}")

    if not args.apply:
        return

    by_file: dict[str, dict[str, Image.Image]] = {}
    for uid, (path, _) in TARGETS.items():
        by_file.setdefault(path, {})[uid] = images[uid]
    for relative_path, replacements in by_file.items():
        path = ROOT / relative_path
        questions = json.loads(path.read_text(encoding="utf-8"))
        for question in questions:
            image = replacements.get(question.get("uid"))
            if image is not None:
                question["image_base64"] = encode(image)
                question.pop("image", None)
                question["has_image"] = True
        path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

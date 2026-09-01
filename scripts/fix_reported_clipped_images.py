#!/usr/bin/env python3
"""Rebuild the three clipped images reported on 2026-09-01."""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[2]
REPO = ROOT / "github-current"
PREVIEW = ROOT / "tmp/pdfs/reported-clipped-preview"


def decode(payload: str) -> Image.Image:
    if payload.startswith("data:"):
        payload = payload.split(",", 1)[1]
    return Image.open(io.BytesIO(base64.b64decode(payload))).convert("RGB")


def encode(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, "JPEG", quality=95, subsampling=0, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def compose(source: Image.Image, rows: list[list[tuple[int, int, int, int]]]) -> Image.Image:
    gap = 12
    crops = [[source.crop(box) for box in row] for row in rows]
    widths = [sum(part.width for part in row) + gap * (len(row) - 1) for row in crops]
    heights = [max(part.height for part in row) for row in crops]
    canvas = Image.new("RGB", (max(widths), sum(heights) + gap * (len(rows) - 1)), "white")
    y = 0
    for row, width, height in zip(crops, widths, heights):
        x = (canvas.width - width) // 2
        for part in row:
            canvas.paste(part, (x, y + (height - part.height) // 2))
            x += part.width + gap
        y += height + gap
    return canvas


def update_question(path: Path, uid: str, image: Image.Image, apply: bool) -> None:
    questions = json.loads(path.read_text(encoding="utf-8"))
    question = next(item for item in questions if item.get("uid") == uid)
    PREVIEW.mkdir(parents=True, exist_ok=True)
    image.save(PREVIEW / f"{uid}.jpg", quality=95, subsampling=0)
    print(uid, image.size)
    if not apply:
        return
    question["image_base64"] = encode(image)
    question.pop("image", None)
    question["has_image"] = True
    path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    enriched = json.loads((ROOT / "tmp/pdfs/enriched/臨床_E-4.json").read_text(encoding="utf-8"))
    target_uids = {"E4-1-027", "E4-1-036"}
    sources = {
        question["uid"]: decode(question.get("image_base64") or question["image"])
        for question in enriched
        if question.get("uid") in target_uids
    }

    cephalogram = compose(sources["E4-1-027"], [[(263, 62, 871, 386)]])
    update_question(REPO / "data/E4.json", "E4-1-027", cephalogram, args.apply)

    clinical = compose(
        sources["E4-1-036"],
        [
            [(580, 138, 868, 352)],
            [(195, 352, 583, 570), (580, 352, 868, 570)],
            [(580, 568, 868, 750)],
            [(210, 750, 868, 1086)],
        ],
    )
    update_question(REPO / "data/E4.json", "E4-1-036", clinical, args.apply)

    rendered_page = Image.open(ROOT / "tmp/pdfs/current-fixes/book1-page-395.png").convert("RGB")
    contact_angle = rendered_page.crop((720, 1625, 1405, 1788))
    update_question(REPO / "data/D1-001-034.json", "D1-018", contact_angle, args.apply)


if __name__ == "__main__":
    main()

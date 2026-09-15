#!/usr/bin/env python3
"""Restore callouts clipped from the two reported C-3 diagrams.

The original full source pages are not present in this checkout.  The figures
themselves are intact, but their outer callout labels were cropped away during
the initial import.  This script extends only the blank edges and restores
those labels next to their surviving leader lines.  Run without ``--apply``
to generate review previews; ``--apply`` updates just the two question images.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
DATA_FILE = ROOT / "data/C3-034-118.json"
PREVIEW_DIR = ROOT.parent / "tmp/pdfs/reported-clipped-preview"
FONT_PATH = "/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc"


def decode(payload: str) -> Image.Image:
    encoded = payload.split(",", 1)[-1]
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")


def encode(image: Image.Image) -> str:
    output = io.BytesIO()
    image.save(output, "JPEG", quality=95, subsampling=0, optimize=True, progressive=True)
    return "data:image/jpeg;base64," + base64.b64encode(output.getvalue()).decode("ascii")


def font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], *, width: int = 2) -> None:
    draw.line((start, end), fill="#222222", width=width)
    x0, y0 = start
    x1, y1 = end
    if abs(x1 - x0) >= abs(y1 - y0):
        direction = 1 if x1 > x0 else -1
        draw.polygon([(x1, y1), (x1 - direction * 9, y1 - 5), (x1 - direction * 9, y1 + 5)], fill="#222222")
    else:
        direction = 1 if y1 > y0 else -1
        draw.polygon([(x1, y1), (x1 - 5, y1 - direction * 9), (x1 + 5, y1 - direction * 9)], fill="#222222")


def muscle_filament(image: Image.Image) -> Image.Image:
    # The H-band and Z-line callouts were below the old crop.  Preserve the
    # original figure and add a white lower margin with leaders to the same
    # visible structures.
    canvas = Image.new("RGB", (image.width, image.height + 72), "white")
    canvas.paste(image, (0, 0))
    draw = ImageDraw.Draw(canvas)
    label = font(25)
    # (エ): Z line; (オ): H band (the central thick-filament-only area).
    draw.text((77, image.height + 27), "(エ)", fill="#111111", font=label)
    arrow(draw, (122, image.height + 28), (138, 147))
    draw.text((243, image.height + 38), "(オ)", fill="#111111", font=label)
    arrow(draw, (279, image.height + 37), (279, 157))
    return canvas


def heart_and_vessels(image: Image.Image) -> Image.Image:
    # The labels on the left/top were cut off; their leader lines still begin
    # at the old image edge.  Add enough margin to show each label clearly.
    left, top = 76, 45
    canvas = Image.new("RGB", (image.width + left, image.height + top + 10), "white")
    canvas.paste(image, (left, top))
    draw = ImageDraw.Draw(canvas)
    label = font(25)
    # (ア) inferior vena cava, (イ) superior vena cava, (ウ) ascending aorta.
    draw.text((13, 265), "(ア)", fill="#111111", font=label)
    arrow(draw, (58, 279), (left + 2, top + 275))
    draw.text((13, 40), "(イ)", fill="#111111", font=label)
    arrow(draw, (59, 55), (left + 4, top + 18))
    draw.text((245, 7), "(ウ)", fill="#111111", font=label)
    arrow(draw, (282, 31), (left + 190, top + 7))
    return canvas


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    questions = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    transforms = {"C3-049": muscle_filament, "C3-057": heart_and_vessels}
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for question in questions:
        uid = question.get("uid")
        transform = transforms.get(uid)
        if transform is None:
            continue
        image = transform(decode(question["image_base64"]))
        preview = PREVIEW_DIR / f"{uid}-restored.jpg"
        image.save(preview, quality=95, subsampling=0)
        print(f"{uid}: {image.size} -> {preview}")
        if args.apply:
            question["image_base64"] = encode(image)
            question["has_image"] = True

    if args.apply:
        DATA_FILE.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

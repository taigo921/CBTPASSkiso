#!/usr/bin/env python3
"""Restore figures identified by the basic-section visual audit.

The source PDF is intentionally kept outside git.  Coordinates below use a
300 dpi (2091 x 2988 pixel) render and PIL's ``left, top, right, bottom``
convention.  Run without ``--apply`` to generate review WebPs; ``--apply``
updates only ``image_base64`` for the listed questions.
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


ROOT = Path(__file__).resolve().parents[1]
RENDER_DPI = 300
EXPECTED_PAGE_SIZE = (2091, 2988)
WEBP_QUALITY = 92


@dataclass(frozen=True)
class Figure:
    data_file: str
    page: int  # zero-based PDF page index
    crop: tuple[int, int, int, int]
    panels: tuple[tuple[int, int, int, int], ...] = ()


# Crops include every figure label, axis, legend, and table header while
# excluding structured question text, printed explanations, and answer marks.
FIGURES: dict[str, Figure] = {
    "A3-003": Figure("data/1-60.json", 11, (1560, 330, 1950, 800)),
    "B1-006": Figure(
        "data/1-60.json",
        45,
        (500, 650, 1960, 1540),
        panels=(
            (480, 650, 960, 1080),
            (950, 650, 1430, 1080),
            (1420, 650, 1950, 1080),
            (480, 1080, 960, 1540),
            (950, 1080, 1430, 1540),
            (1470, 1300, 1950, 1540),
        ),
    ),
    "B3-001": Figure("data/91-120.json", 92, (870, 420, 1950, 1090)),
    "B3-009": Figure("data/91-120.json", 95, (1130, 1200, 1930, 1580)),
    "B4-025": Figure("data/121-144.json", 118, (420, 360, 1250, 580)),
    "B4-036": Figure(
        "data/121-144.json",
        123,
        (615, 390, 1960, 2050),
        panels=(
            (615, 370, 1240, 930),
            (1250, 370, 1925, 930),
            (615, 925, 1240, 1490),
            (1250, 925, 1925, 1490),
            (615, 1490, 1240, 2050),
        ),
    ),
    "C2-029": Figure("data/145-174.json", 150, (930, 380, 1920, 1450)),
    "C3-001": Figure("data/175-204.json", 178, (620, 350, 1960, 1240)),
    "C3-034": Figure("data/C3-034-118.json", 192, (800, 360, 1910, 760)),
    "C3-049": Figure("data/C3-034-118.json", 198, (1280, 1560, 1930, 1940)),
    "C3-054": Figure("data/C3-034-118.json", 201, (580, 690, 1940, 900)),
    "C3-055": Figure("data/C3-034-118.json", 201, (1320, 1560, 1950, 2200)),
    "C3-073": Figure("data/C3-034-118.json", 210, (1710, 280, 1930, 720)),
    "C3-086": Figure("data/C3-034-118.json", 215, (880, 1580, 1950, 2310)),
    "C3-199": Figure("data/C3-119-204.json", 263, (1220, 260, 1950, 770)),
    "C3-200": Figure("data/C3-119-204.json", 263, (1230, 1560, 1950, 2190)),
    "C3-202": Figure("data/C3-119-204.json", 264, (500, 1480, 1920, 2150)),
    "C3-204": Figure("data/C3-119-204.json", 265, (680, 1470, 1940, 2170)),
    "C4-076": Figure("data/C4-001-094.json", 302, (650, 1720, 1930, 2260)),
    "C5-016": Figure("data/C5-001-055.json", 318, (1460, 320, 1920, 610)),
    "C5-031": Figure("data/C5-001-055.json", 324, (700, 400, 1930, 830)),
    "D1-007": Figure("data/D1-001-034.json", 377, (1240, 1580, 1940, 2100)),
    "D2-008": Figure("data/D2-001-076.json", 393, (540, 660, 1940, 1030)),
    "D2-029": Figure("data/D2-001-076.json", 402, (1650, 1610, 1920, 1940)),
}


def render_page(document: pdfium.PdfDocument, page_index: int) -> Image.Image:
    page = document[page_index]
    rendered = page.render(scale=RENDER_DPI / 72).to_pil().convert("RGB")
    if rendered.size != EXPECTED_PAGE_SIZE:
        raise RuntimeError(
            f"page {page_index}: expected {EXPECTED_PAGE_SIZE}, got {rendered.size}"
        )
    return rendered


def stack_vertically(page: Image.Image, boxes: tuple[tuple[int, int, int, int], ...]) -> Image.Image:
    parts = [page.crop(box) for box in boxes]
    width = max(part.width for part in parts)
    gap = 24
    canvas = Image.new("RGB", (width, sum(part.height for part in parts) + gap * (len(parts) - 1)), "white")
    y = 0
    for part in parts:
        canvas.paste(part, ((width - part.width) // 2, y))
        y += part.height + gap
    return canvas


def build_image(page: Image.Image, figure: Figure) -> Image.Image:
    if figure.panels:
        return stack_vertically(page, figure.panels)
    return page.crop(figure.crop)


def encode_webp(image: Image.Image) -> tuple[str, bytes]:
    output = io.BytesIO()
    image.save(output, "WEBP", quality=WEBP_QUALITY, method=6)
    raw = output.getvalue()
    return "data:image/webp;base64," + base64.b64encode(raw).decode("ascii"), raw


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="Problem Book 1 source PDF (kept outside git)")
    parser.add_argument("--apply", action="store_true", help="update only image_base64 in the listed JSON records")
    parser.add_argument(
        "--preview-dir",
        type=Path,
        default=Path("/tmp/audit-basic-figures"),
        help="directory for visually reviewed WebP copies",
    )
    args = parser.parse_args()

    args.preview_dir.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(args.source)
    rendered_pages: dict[int, Image.Image] = {}
    encoded: dict[str, str] = {}

    for uid, figure in FIGURES.items():
        if figure.page not in rendered_pages:
            rendered_pages[figure.page] = render_page(document, figure.page)
        page = rendered_pages[figure.page]
        image = build_image(page, figure)
        payload, raw = encode_webp(image)
        if len(raw) > 300 * 1024:
            raise RuntimeError(f"{uid}: WebP is {len(raw)} bytes (over 300 KiB)")
        encoded[uid] = payload
        preview = args.preview_dir / f"{uid}.webp"
        preview.write_bytes(raw)
        panel_note = f", panels={figure.panels}" if figure.panels else ""
        print(
            f"{uid}: page {figure.page}, crop {figure.crop}{panel_note}, "
            f"{image.size}, {len(raw)} bytes -> {preview}"
        )

    if not args.apply:
        return

    by_file: dict[str, list[str]] = {}
    for uid, figure in FIGURES.items():
        by_file.setdefault(figure.data_file, []).append(uid)

    for relative, uids in by_file.items():
        path = ROOT / relative
        questions = json.loads(path.read_text(encoding="utf-8"))
        questions_by_uid = {str(question.get("uid")): question for question in questions}
        for uid in uids:
            if uid not in questions_by_uid:
                raise KeyError(f"{uid} not found in {relative}")
            questions_by_uid[uid]["image_base64"] = encoded[uid]
        path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

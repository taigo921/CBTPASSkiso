#!/usr/bin/env python3
"""Re-crop problem-book 1 images without altering their medical content.

The embedded images were originally cut from full PDF question panels.  Many
still contain the printed question/explanation around the actual figure.  This
script detects the figure/photo/table region, writes review images in dry-run
mode, and can replace only the embedded image payload after visual review.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

import numpy as np
from PIL import Image


BOOK1_FILES = [
    "data/1-60.json",
    "data/61-90.json",
    "data/91-120.json",
    "data/121-144.json",
    "data/145-174.json",
    "data/175-204.json",
    "data/C3-034-118.json",
    "data/C3-119-204.json",
    "data/C4-001-094.json",
    "data/C5-001-055.json",
    "data/C6-001-088.json",
    "data/D1-001-034.json",
    "data/D2-001-076.json",
]

# Overrides are intentionally small and reviewable. Coordinates refer to the
# current embedded image and use PIL's (left, top, right, bottom) convention.
OVERRIDES: dict[str, tuple[int, int, int, int]] = {
    "A6-007": (72, 72, 440, 315),
    "A6-008": (0, 18, 493, 239),
    "A6-014": (130, 22, 486, 322),
    "A6-024": (80, 75, 425, 477),
    "B4-025": (0, 0, 560, 130),
    "B4-036": (0, 46, 555, 740),
    "C2-013": (0, 0, 560, 243),
    "C2-016": (0, 0, 560, 297),
    "C3-159": (0, 0, 560, 340),
    "C3-197": (0, 0, 560, 128),
    "C5-016": (0, 15, 420, 250),
    "C6-032": (135, 0, 500, 226),
    "C6-034": (150, 3, 522, 215),
    "C6-060": (85, 20, 520, 225),
    "C6-067": (40, 0, 500, 195),
    # The question text touches the photo panel in the source scan.
    "D1-028": (68, 45, 510, 532),
    "D1-025": (95, 0, 520, 185),
    "D2-042": (125, 60, 470, 430),
}

# This entry contains only a duplicate scan of text already represented by the
# structured question and choices; there is no table/figure/photo to preserve.
REMOVE_IMAGE_UIDS = {"B4-047"}


def runs(values: np.ndarray, *, min_len: int = 1) -> list[tuple[int, int]]:
    padded = np.pad(values.astype(np.int8), (1, 1))
    changes = np.diff(padded)
    starts = np.flatnonzero(changes == 1)
    ends = np.flatnonzero(changes == -1)
    return [(int(a), int(b)) for a, b in zip(starts, ends) if b - a >= min_len]


def close_short_gaps(values: np.ndarray, max_gap: int) -> np.ndarray:
    result = values.copy()
    for start, end in runs(~values):
        if start > 0 and end < len(values) and end - start <= max_gap:
            result[start:end] = True
    return result


def content_mask(image: Image.Image) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"))
    gray = rgb.mean(axis=2)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    # Include dark line art/text and coloured photographic/diagram content.
    return (gray < 210) | (chroma > 38)


def automatic_crop(image: Image.Image) -> tuple[int, int, int, int]:
    mask = content_mask(image)
    height, width = mask.shape

    row_density = mask.mean(axis=1)
    active_rows = close_short_gaps(row_density > 0.012, max(6, height // 38))
    row_bands = runs(active_rows, min_len=max(10, height // 50))
    if not row_bands:
        return (0, 0, width, height)

    # Figures/photos are broad and dense; printed prose is usually shallow and
    # sparse. A light top penalty prevents the question sentence winning.
    def row_score(band: tuple[int, int]) -> float:
        top, bottom = band
        density = float(row_density[top:bottom].mean())
        score = (bottom - top) * density**0.60
        if top < height * 0.16 and bottom - top < height * 0.22:
            score *= 0.62
        return score

    top, bottom = max(row_bands, key=row_score)

    # The source book places a dotted rule between the illustration and its
    # printed explanation. Use it as the lower boundary. This also preserves
    # multi-row figures that would otherwise look like separate components.
    separator_rows = np.zeros(height, dtype=bool)
    for y in range(height):
        dark_runs = runs(mask[y])
        if not dark_runs:
            continue
        span = dark_runs[-1][1] - dark_runs[0][0]
        separator_rows[y] = (
            row_density[y] > 0.30
            and len(dark_runs) >= 40
            and span > width * 0.72
        )
    separators = runs(close_short_gaps(separator_rows, 2))
    lower_separators = [
        start
        for start, _ in separators
        if start > max(top + max(35, height * 0.16), height * 0.55)
    ]
    stopped_at_separator = bool(lower_separators)
    if stopped_at_separator:
        bottom = min(lower_separators)
    else:
        # A standalone figure/photo has no reliable semantic crop boundary.
        # Preserve it byte-for-byte unless it has a reviewed override.
        return (0, 0, width, height)

    band_mask = mask[top:bottom]
    col_density = band_mask.mean(axis=0)
    active_cols = close_short_gaps(col_density > 0.010, max(5, width // 55))
    col_bands = runs(active_cols, min_len=max(4, width // 100))

    # Preserve every horizontally separated panel (e.g. five small graphs).
    # Discard only thin page furniture flush against an outer edge.
    kept: list[tuple[int, int]] = []
    for left, right in col_bands:
        band_width = right - left
        near_edge = left < width * 0.035 or right > width * 0.965
        narrow = band_width < width * 0.12
        if near_edge and narrow:
            continue
        kept.append((left, right))

    if kept:
        left = min(item[0] for item in kept)
        right = max(item[1] for item in kept)
    else:
        left, right = 0, width

    pad_x = max(7, width // 70)
    pad_y = max(7, height // 70)
    left = max(0, left - pad_x)
    right = min(width, right + pad_x)
    top = max(0, top - pad_y)
    if not stopped_at_separator:
        bottom = min(height, bottom + pad_y)

    # Reject suspiciously small results.
    if right - left < width * 0.25 or bottom - top < height * 0.12:
        return (0, 0, width, height)
    return (left, top, right, bottom)


def decode_image(payload: str) -> tuple[Image.Image, str]:
    prefix = ""
    encoded = payload
    if payload.startswith("data:"):
        prefix, encoded = payload.split(",", 1)
        prefix += ","
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB"), prefix


def encode_image(image: Image.Image, prefix: str) -> str:
    output = io.BytesIO()
    image.save(output, "JPEG", quality=95, subsampling=0, optimize=True)
    return prefix + base64.b64encode(output.getvalue()).decode("ascii")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--review-dir", type=Path)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--only", help="UID prefix, for example D1 or D2")
    args = parser.parse_args()

    if not args.apply and not args.review_dir:
        parser.error("use --review-dir for a dry run or --apply after review")
    if args.review_dir:
        args.review_dir.mkdir(parents=True, exist_ok=True)

    report: list[dict[str, object]] = []
    changed_files = 0
    for relative in BOOK1_FILES:
        path = args.root / relative
        questions = json.loads(path.read_text())
        file_changed = False
        for question in questions:
            uid = str(question.get("uid", ""))
            if args.only and not uid.startswith(args.only):
                continue
            field = "image_base64" if question.get("image_base64") else "image"
            payload = question.get(field)
            if not payload:
                continue
            if uid in REMOVE_IMAGE_UIDS:
                if args.apply:
                    question.pop("image_base64", None)
                    question.pop("image", None)
                    question["has_image"] = False
                    file_changed = True
                report.append(
                    {
                        "uid": uid,
                        "source": relative,
                        "action": "remove_redundant_text_image",
                    }
                )
                continue

            image, prefix = decode_image(payload)
            box = OVERRIDES.get(uid, automatic_crop(image))
            cropped = image.crop(box)
            original_size = image.size
            retained = cropped.width * cropped.height / (image.width * image.height)

            if args.review_dir:
                cropped.save(args.review_dir / f"{uid}.jpg", quality=94, subsampling=0)
            if args.apply and box != (0, 0, image.width, image.height):
                question[field] = encode_image(cropped, prefix)
                file_changed = True

            report.append(
                {
                    "uid": uid,
                    "source": relative,
                    "original_size": original_size,
                    "crop": box,
                    "output_size": cropped.size,
                    "retained_area": round(retained, 4),
                }
            )

        if args.apply and file_changed:
            path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n")
            changed_files += 1

    report_path = (args.review_dir or args.root) / "recrop-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(f"reviewed {len(report)} images; changed {changed_files} files; report: {report_path}")


if __name__ == "__main__":
    main()

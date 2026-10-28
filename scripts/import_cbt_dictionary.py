#!/usr/bin/env python3
"""Import CBT Dictionary exercise pages without committing the source PDFs.

The scanned books place questions and official explanations on the same spread.
This importer detects each item, renders separate question/explanation images, and
extracts the official answer.  It deliberately fails when an answer cannot be
validated so a broken or mismatched item cannot be published silently.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import unicodedata
from pathlib import Path

import fitz
from PIL import Image


PAGE_WIDTH = 842
PAGE_HEIGHT = 595
GUTTER_X = 410
RIGHT_EDGE = 830
ANSWER_RE = re.compile(r"正\s*解\s*[\[【\(（]?\s*([A-E])", re.I)
SOURCE_SHA256 = "8c3e30f0d7c251871cb1a545d69442002141eef981849be9cd363806ce836099"

# Printed source IDs are the canonical inventory.  OCR occasionally turns the
# leading squares/digits into punctuation, so a detected-panel count must never
# be treated as the expected total.
SOURCE_RANGES = (
    ("A", 18),
    ("B", 88),
    ("C", 145),
    ("D", 35),
    ("E1", 81),
    ("E2", 175),
    ("E3", 300),
    ("E4", 114),
)
EXPECTED_SOURCE_IDS = tuple(
    f"{prefix}{number:03d}"
    for prefix, final_number in SOURCE_RANGES
    for number in range(1, final_number + 1)
)
EXPECTED_COUNT = len(EXPECTED_SOURCE_IDS)


def normalized(value: str) -> str:
    return unicodedata.normalize("NFKC", value).upper()


def dedupe_positions(values: list[float], gap: float = 8) -> list[float]:
    result: list[float] = []
    for value in sorted(values):
        if not result or value - result[-1] > gap:
            result.append(value)
    return result


def detected_starts(page: fitz.Page) -> tuple[list[float], list[float]]:
    left: list[float] = []
    right: list[float] = []
    for block in page.get_text("blocks"):
        x0, y0, _x1, _y1, text, *_ = block
        compact = normalized(text).replace(" ", "").replace("\n", "")
        if x0 < GUTTER_X:
            if "□□" in compact and re.search(r"[A-Z].{0,4}\d", compact):
                left.append(y0)
        elif re.search(r"(^|[^A-Z])([A-G])([0-9O]{3,4})([^0-9]|$)", compact):
            right.append(y0)
    return dedupe_positions(left), dedupe_positions(right)


def official_answers(page: fitz.Page) -> list[str]:
    return [match.upper() for match in ANSWER_RE.findall(normalized(page.get_text()))]


def complete_starts(primary: list[float], secondary: list[float], count: int) -> list[float]:
    if len(primary) == count:
        return primary
    if len(secondary) == count:
        return secondary
    if count == 1:
        return [primary[0] if primary else secondary[0] if secondary else 42.0]

    # The source uses vertically stacked panels. Preserve detected anchors only
    # when all panels were found; partial OCR anchors are less safe than the
    # regular panel grid and can assign a neighboring explanation to an item.
    top, bottom = 40.0, 540.0
    return [top + (bottom - top) * index / count for index in range(count)]


def answer_from_segment(page: fitz.Page, top: float, bottom: float) -> str | None:
    text = normalized(page.get_text(clip=fitz.Rect(GUTTER_X, top, RIGHT_EDGE, bottom)))
    direct = ANSWER_RE.findall(text)
    if len(direct) == 1:
        return direct[0].upper()
    marked = re.findall(r"([A-E])\s*[○〇◯]", text)
    if len(set(marked)) == 1:
        return marked[0].upper()
    return None


def render_crop(page: fitz.Page, rect: fitz.Rect, destination: Path, scale: float, quality: int) -> None:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, colorspace=fitz.csRGB, alpha=False)
    image = Image.open(io.BytesIO(pixmap.tobytes("png")))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=quality, method=6)


def import_exercises(source: Path, output: Path, scale: float, quality: int) -> dict:
    document = fitz.open(source)
    questions_dir = output / "questions"
    explanations_dir = output / "explanations"
    items: list[dict] = []
    unresolved: list[dict] = []

    for page_index, page in enumerate(document):
        left_detected, right_detected = detected_starts(page)
        page_answers = official_answers(page)
        count = max(len(left_detected), len(right_detected), len(page_answers))
        if count == 0:
            continue

        left_starts = complete_starts(left_detected, right_detected, count)
        right_starts = complete_starts(right_detected, left_detected, count)
        left_bounds = left_starts + [552.0]
        right_bounds = right_starts + [568.0]

        extracted_answers: list[str | None]
        if len(page_answers) == count:
            extracted_answers = page_answers
        else:
            extracted_answers = [
                answer_from_segment(page, max(0, right_starts[index] - 8), min(PAGE_HEIGHT, right_bounds[index + 1] - 3))
                for index in range(count)
            ]

        for item_index in range(count):
            ordinal = len(items) + 1
            uid = f"DICT2-{ordinal:04d}"
            question_path = questions_dir / f"q{ordinal:04d}.webp"
            explanation_path = explanations_dir / f"q{ordinal:04d}.webp"
            question_rect = fitz.Rect(
                32,
                max(0, left_starts[item_index] - 13),
                402,
                min(PAGE_HEIGHT, left_bounds[item_index + 1] - 7),
            )
            explanation_rect = fitz.Rect(
                GUTTER_X,
                max(0, right_starts[item_index] - 9),
                RIGHT_EDGE,
                min(PAGE_HEIGHT, right_bounds[item_index + 1] - 3),
            )
            render_crop(page, question_rect, question_path, scale, quality)
            render_crop(page, explanation_rect, explanation_path, scale, quality)
            answer = extracted_answers[item_index]
            item = {
                "uid": uid,
                "number": ordinal,
                "answer": answer,
                "choices": "ABCDE",
                "questionImage": f"dictionary-assets/exercises/questions/{question_path.name}",
                "explanationImage": f"dictionary-assets/exercises/explanations/{explanation_path.name}",
                "sourcePage": page_index + 1,
                "sourceSlot": item_index + 1,
            }
            items.append(item)
            if answer is None:
                unresolved.append({"uid": uid, "page": page_index + 1, "slot": item_index + 1})

    manifest = {
        "schemaVersion": 1,
        "source": "CBTの辞典② 基礎臨床",
        "sourceFileSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "expectedCount": EXPECTED_COUNT,
        "count": len(items),
        "items": items,
        "unresolved": unresolved,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="local path to 辞典② PDF")
    parser.add_argument("output", type=Path, help="output dictionary-assets/exercises directory")
    parser.add_argument("--scale", type=float, default=1.7)
    parser.add_argument("--quality", type=int, default=72)
    parser.add_argument("--allow-unresolved", action="store_true")
    args = parser.parse_args()

    manifest = import_exercises(args.source, args.output, args.scale, args.quality)
    print(f"Imported {manifest['count']} items; unresolved answers: {len(manifest['unresolved'])}")
    inventory_errors = []
    if manifest["sourceFileSha256"] != SOURCE_SHA256:
        inventory_errors.append("source PDF hash does not match the linked Dictionary 2 file")
    if manifest["count"] != EXPECTED_COUNT:
        inventory_errors.append(f"detected {manifest['count']} panels, but the printed source inventory has {EXPECTED_COUNT} questions")
    if inventory_errors:
        print("Import is not publishable:")
        for error in inventory_errors:
            print(f"- {error}")
    if (inventory_errors or manifest["unresolved"]) and not args.allow_unresolved:
        print(json.dumps(manifest["unresolved"], ensure_ascii=False, indent=2))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

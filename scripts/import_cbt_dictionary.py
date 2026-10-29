#!/usr/bin/env python3
"""Import Dictionary 2 using its printed source IDs as the inventory.

The source alternates between two spread layouts and its embedded OCR is noisy.
OCR is used only to locate panels; canonical order/count come from printed IDs.
The command refuses a partial or ambiguous import unless --allow-unresolved is
explicitly supplied for audit work.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import fitz
from PIL import Image

PAGE_HEIGHT = 595.0
HALF_SPLIT = 410.0
SOURCE_SHA256 = "8c3e30f0d7c251871cb1a545d69442002141eef981849be9cd363806ce836099"
SOURCE_RANGES = (("A", 18), ("B", 88), ("C", 145), ("D", 35), ("E1", 81), ("E2", 175), ("E3", 300), ("E4", 114))
EXPECTED_SOURCE_IDS = tuple(
    f"{prefix}{number:03d}"
    for prefix, final_number in SOURCE_RANGES
    for number in range(1, final_number + 1)
)
EXPECTED_COUNT = len(EXPECTED_SOURCE_IDS)
EXPECTED_INDEX = {source_id: index for index, source_id in enumerate(EXPECTED_SOURCE_IDS)}
ANSWER_RE = re.compile(r"正\s*解\s*[\[【\(（]?\s*([A-E])", re.I)

# OCR omitted the leading boxes/ID on these eleven question panels. Coordinates
# are PDF points and are stable for the verified source hash above.
QUESTION_REPAIRS = {
    "C022": (53, 0, 204.0),
    "C033": (57, 0, 45.0),
    "C074": (70, 0, 374.8),
    "C098": (79, 0, 448.9),
    "C130": (91, 0, 191.5),
    "E1016": (117, 0, 406.6),
    "E1059": (135, 0, 44.6),
    "E1067": (139, 0, 102.8),
    "E2008": (148, 0, 214.0),
    "E2022": (153, 0, 226.0),
    "E3207": (311, 0, 41.0),
}

# Explanation header IDs that the embedded OCR did not preserve. These points
# were checked against the corresponding printed ID on the right-hand page.
EXPLANATION_REPAIRS = {
    "A004": (2, 1, 42.0),
    "C042": (60, 1, 42.0),
    "C067": (68, 1, 191.0),
    "C112": (85, 1, 42.0),
    "D029": (108, 1, 173.0),
    "E1071": (141, 1, 184.0),
    "E1079": (145, 1, 41.0),
    "E2040": (159, 1, 360.0),
    "E2081": (179, 1, 280.0),
    "E2082": (180, 1, 40.0),
    "E2111": (194, 1, 40.0),
    "E3221": (317, 1, 39.0),
    "E3222": (317, 1, 278.0),
    "E3223": (318, 1, 40.0),
    "E3224": (318, 1, 270.0),
    "E3228": (320, 1, 40.0),
    "E3229": (320, 1, 275.0),
    "E3232": (322, 1, 40.0),
    "E3258": (334, 1, 215.0),
    "E3286": (347, 1, 354.5),
    "E4099": (395, 1, 190.0),
    "E4106": (398, 1, 40.0),
    "E4111": (400, 1, 365.0),
}

# The red answer glyph is damaged in the PDF text layer at these IDs. Values
# below were read from the rendered official explanation; handwritten printed-
# source corrections (for example E1039/E2112/E3002/E3093) take precedence.
ANSWER_OVERRIDES = {
    "A016": "B", "B041": "A", "C015": "B", "C066": "D",
    "C067": "C", "C099": "E", "C100": "A", "D028": "C",
    "E1023": "C",
    "E1039": "B", "E1043": "D", "E1070": "B", "E2012": "C",
    "E2028": "C", "E2033": "B", "E2039": "E", "E2042": "B",
    "E2056": "B", "E2058": "A", "E2077": "E", "E2080": "C",
    "E2112": "B", "E2122": "E", "E2124": "A", "E3002": "E",
    "E3018": "D", "E3019": "E", "E3086": "B", "E3093": "D",
    "E3098": "C", "E3177": "A", "E3186": "D", "E3210": "E",
    "E3257": "E", "E3260": "A", "E3268": "E", "E3285": "D",
    "E3286": "C",
    "E4027": "B", "E4032": "C", "E4088": "E", "E4092": "D",
    "E4098": "A", "E4106": "A", "E4110": "E",
}


@dataclass(frozen=True)
class Panel:
    source_id: str | None
    page: int
    half: int
    y: float
    x: float
    text: str


def normalized(value: str) -> str:
    return unicodedata.normalize("NFKC", value).upper().replace("O", "0")


def compact(value: str) -> str:
    return normalized(value).replace(" ", "").replace("\n", "")


def source_prefix_for_page(page_index: int) -> str | None:
    if 110 <= page_index < 145:
        return "E1"
    if 145 <= page_index < 225:
        return "E2"
    if 225 <= page_index < 353:
        return "E3"
    if page_index >= 353:
        return "E4"
    return None


def source_id_in_text(value: str, page_index: int) -> str | None:
    value = compact(value)
    prefix = source_prefix_for_page(page_index)
    if prefix:
        match = re.search(r"(?:E[1-4])?([0-9]{3})", value[:30])
        source_id = prefix + match.group(1) if match else None
    else:
        match = re.search(r"([A-D])([0-9]{3})", value[:30])
        source_id = "".join(match.groups()) if match else None
    return source_id if source_id in EXPECTED_INDEX else None


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def question_panels(document: fitz.Document) -> list[Panel]:
    panels: list[Panel] = []
    for page_index, page in enumerate(document):
        for block in page.get_text("blocks"):
            x0, y0, _x1, _y1, text, *_ = block
            value = compact(text)
            if "□□" not in value or not re.search(r"[A-Z].{0,5}\d", value):
                continue
            panels.append(Panel(source_id_in_text(text, page_index), page_index + 1, int(x0 >= HALF_SPLIT), y0, x0, value[:80]))

    occupied = {(panel.page, panel.half, round(panel.y)) for panel in panels}
    for source_id, (page, half, y) in QUESTION_REPAIRS.items():
        if (page, half, round(y)) not in occupied:
            panels.append(Panel(source_id, page, half, y, 42.0 if half == 0 else 432.0, "manual OCR repair"))

    panels.sort(key=lambda panel: (panel.page, panel.half, panel.y))
    if len(panels) != EXPECTED_COUNT:
        raise ValueError(f"question inventory: detected {len(panels)}, expected {EXPECTED_COUNT}")

    result: list[Panel] = []
    mismatches: list[dict] = []
    for expected_id, panel in zip(EXPECTED_SOURCE_IDS, panels):
        if panel.source_id and panel.source_id != expected_id:
            mismatches.append({"expected": expected_id, "ocr": panel.source_id, "page": panel.page, "y": panel.y})
        result.append(Panel(expected_id, panel.page, panel.half, panel.y, panel.x, panel.text))
    if mismatches:
        raise ValueError(f"question ID order mismatch: {json.dumps(mismatches[:10], ensure_ascii=False)}")
    return result


def explanation_candidates(document: fitz.Document) -> list[Panel]:
    candidates: list[Panel] = []
    for page_index, page in enumerate(document):
        for block in page.get_text("blocks"):
            x0, y0, _x1, _y1, text, *_ = block
            value = compact(text)
            if "□□" in value:
                continue
            source_id = source_id_in_text(text, page_index)
            if source_id and (len(value) < 90 or x0 > 700 or 330 < x0 < 420):
                candidates.append(Panel(source_id, page_index + 1, int(x0 >= HALF_SPLIT), y0, x0, value[:80]))
    return sorted(candidates, key=lambda panel: (panel.page, panel.half, panel.y))


def ordered_exact_matches(candidates: list[Panel]) -> list[Panel]:
    """Return the longest in-order exact match against the printed ID list."""
    columns = len(candidates)
    previous = [0] * (columns + 1)
    trace: list[bytearray] = []
    for source_id in EXPECTED_SOURCE_IDS:
        current = [0] * (columns + 1)
        operations = bytearray(columns + 1)
        for column, candidate in enumerate(candidates, 1):
            if source_id == candidate.source_id:
                current[column] = previous[column - 1] + 1
                operations[column] = 2
            elif previous[column] >= current[column - 1]:
                current[column] = previous[column]
                operations[column] = 0
            else:
                current[column] = current[column - 1]
                operations[column] = 1
        trace.append(operations)
        previous = current

    row, column = len(EXPECTED_SOURCE_IDS), columns
    matches: list[Panel] = []
    while row and column:
        operation = trace[row - 1][column]
        if operation == 2 and EXPECTED_SOURCE_IDS[row - 1] == candidates[column - 1].source_id:
            matches.append(candidates[column - 1])
            row -= 1
            column -= 1
        elif operation == 0:
            row -= 1
        else:
            column -= 1
    matches.reverse()
    return matches


def complete_explanations(document: fitz.Document) -> list[Panel]:
    matches = ordered_exact_matches(explanation_candidates(document))
    matched_ids = {panel.source_id for panel in matches}
    for source_id, (page, half, y) in EXPLANATION_REPAIRS.items():
        if source_id not in matched_ids:
            matches.append(Panel(source_id, page, half, y, 430.0, "manual OCR repair"))
    matches.sort(key=lambda panel: EXPECTED_INDEX[panel.source_id])
    ids = [panel.source_id for panel in matches]
    if ids != list(EXPECTED_SOURCE_IDS):
        missing = [source_id for source_id in EXPECTED_SOURCE_IDS if source_id not in ids]
        raise ValueError(f"explanation inventory is incomplete: {missing}")
    return matches


def next_boundary(panel: Panel, all_panels: list[Panel], default_bottom: float = 558.0) -> float:
    later = [other.y for other in all_panels if other.page == panel.page and other.half == panel.half and other.y > panel.y + 5]
    return min(later) - 6 if later else default_bottom


def crop_rect(panel: Panel, bottom: float) -> fitz.Rect:
    left, right = (30.0, 404.0) if panel.half == 0 else (420.0, 812.0)
    return fitz.Rect(left, max(0.0, panel.y - 10), right, min(PAGE_HEIGHT, max(panel.y + 35, bottom)))


def answer_from_text(value: str) -> str | None:
    direct = ANSWER_RE.findall(normalized(value))
    if len(direct) == 1:
        return direct[0].upper()
    marked = re.findall(r"([A-E])\s*[○〇◯]", normalized(value))
    return marked[0].upper() if len(set(marked)) == 1 else None


def render_crop(page: fitz.Page, rect: fitz.Rect, destination: Path, scale: float, quality: int) -> None:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, colorspace=fitz.csRGB, alpha=False)
    image = Image.open(io.BytesIO(pixmap.tobytes("png")))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=quality, method=6)


def import_exercises(source: Path, output: Path, scale: float, quality: int) -> dict:
    source_hash = file_sha256(source)
    if source_hash != SOURCE_SHA256:
        raise ValueError("source PDF hash does not match the linked Dictionary 2 file")

    document = fitz.open(source)
    questions = question_panels(document)
    explanations = complete_explanations(document)
    explanations_by_id = {panel.source_id: panel for panel in explanations}
    all_boundaries = questions + explanations
    items: list[dict] = []
    unresolved: list[dict] = []

    for ordinal, question in enumerate(questions, 1):
        source_id = question.source_id
        explanation = explanations_by_id.get(source_id)
        answer: str | None = None
        issue: str | None = None
        explanation_bottom = 0.0
        if explanation:
            explanation_bottom = next_boundary(explanation, all_boundaries)
            text = document[explanation.page - 1].get_text(clip=crop_rect(explanation, explanation_bottom))
            answer = ANSWER_OVERRIDES.get(source_id) or answer_from_text(text)
            if not answer:
                issue = "answer OCR is ambiguous"
        else:
            issue = "explanation header was not matched"

        uid = f"DICT2-{source_id}"
        name = f"{source_id.lower()}.webp"
        render_crop(document[question.page - 1], crop_rect(question, next_boundary(question, all_boundaries)), output / "questions" / name, scale, quality)
        if explanation:
            render_crop(document[explanation.page - 1], crop_rect(explanation, explanation_bottom), output / "explanations" / name, scale, quality)

        items.append({
            "uid": uid,
            "sourceId": source_id,
            "number": ordinal,
            "answer": answer,
            "choices": "ABCDE",
            "questionImage": f"dictionary-assets/exercises/questions/{name}",
            "explanationImage": f"dictionary-assets/exercises/explanations/{name}" if explanation else None,
            "sourcePage": question.page,
            "explanationPage": explanation.page if explanation else None,
        })
        if issue:
            unresolved.append({"uid": uid, "sourceId": source_id, "issue": issue})

    missing = [source_id for source_id in EXPECTED_SOURCE_IDS if source_id not in explanations_by_id]
    manifest = {
        "schemaVersion": 2,
        "source": "CBTの辞典② 基礎臨床",
        "sourceFileSha256": source_hash,
        "expectedCount": EXPECTED_COUNT,
        "count": len(items),
        "matchedExplanationCount": len(explanations),
        "missingExplanationIds": missing,
        "unresolved": unresolved,
        "items": items,
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
    parser.add_argument("--allow-unresolved", action="store_true", help="write audit output even when validation is incomplete")
    args = parser.parse_args()
    try:
        manifest = import_exercises(args.source, args.output, args.scale, args.quality)
    except ValueError as error:
        print(f"Import failed: {error}")
        return 2
    print(f"Imported {manifest['count']} questions; matched {manifest['matchedExplanationCount']} explanations; unresolved: {len(manifest['unresolved'])}")
    if manifest["unresolved"] and not args.allow_unresolved:
        print(json.dumps(manifest["unresolved"], ensure_ascii=False, indent=2))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

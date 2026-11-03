#!/usr/bin/env python3
"""Import the two mock exams contained in CBT Dictionary 3.

The linked source contains 320 items for mock 1 and 304 items for mock 2.
Mock 2's block-6 cover says 40 items, but the PDF ends at 266(4), so the
missing 16 items are recorded in the manifest and are never fabricated.
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


SOURCE_SHA256 = "292e05997547741cf382ddb4dd2b53a5dbccb92ca53ee33c6ca344a3e3995e10"
PAGE_HEIGHT = 595.0
HALVES = {0: (30.0, 410.0), 1: (430.0, 812.0)}

# Page numbers are one-based. These starts were inspected where the PDF text
# layer damaged the printed question marker.
QUESTION_REPAIRS = {
    1: {
        123: (49, 271.1), 156: (61, 47.2), 179: (71, 49.2),
        197: (78, 374.1), 220: (86, 155.0), 227: (88, 445.2),
        233: (90, 428.5), 237: (92, 154.8), 238: (93, 49.1),
    },
    2: {
        15: (145, 48.7), 28: (149, 389.9), 149: (201, 360.3),
        185: (216, 318.3), 202: (222, 321.8), 208: (224, 154.1),
        238: (237, 310.5),
    },
}

EXPLANATION_REPAIRS = {
    1: {
        12: (4, 340.7), 13: (5, 49.6), 31: (11, 199.8), 58: (22, 45.5),
        73: (28, 395.0), 75: (29, 209.7), 76: (30, 44.3), 83: (32, 392.7),
        152: (60, 46.4), 215: (84, 371.8),
    },
    2: {
        58: (163, 196.7), 62: (166, 230.4), 68: (168, 220.2),
        69: (168, 371.8), 85: (175, 44.2), 140: (198, 197.6),
        151: (202, 162.3), 167: (208, 163.0), 177: (212, 348.7),
        230: (233, 366.1), 238: (237, 174.2),
    },
}

TYPE_A_RANGES = {
    1: ((1, 22, 1), (24, 47, 61), (49, 71, 121), (73, 93, 181)),
    2: ((140, 164, 1), (166, 189, 61), (191, 213, 121), (215, 238, 181)),
}
LINKED_RANGES = {1: (95, 138), 2: (240, 272)}

# (mock, stem, part) -> (page, half, y). The PDF text layer omits these
# printed markers, so their positions cannot be recovered from OCR alone.
LINKED_REPAIRS = {
    (2, 249, 2): (248, 1, 50.0),
    (2, 252, 1): (251, 0, 48.0),
    (2, 257, 2): (256, 1, 50.0),
}

# Printed official answer boxes/rationale were inspected for entries whose
# answer glyph is missing or corrupted in the PDF text layer.
ANSWER_OVERRIDES = {
    "DICT3-M1-015": "C", "DICT3-M1-036": "D", "DICT3-M1-041": "E",
    "DICT3-M1-069": "A", "DICT3-M1-099": "E", "DICT3-M1-103": "E",
    "DICT3-M1-113": "D", "DICT3-M1-117": "E", "DICT3-M1-143": "C",
    "DICT3-M1-171": "C", "DICT3-M1-180": "E", "DICT3-M1-241-2": "G",
    "DICT3-M1-249-1": "F", "DICT3-M1-255-1": "C", "DICT3-M1-256-2": "C",
    "DICT3-M1-258-2": "D", "DICT3-M1-263-3": "D", "DICT3-M1-263-4": "D",
    "DICT3-M1-265-1": "A", "DICT3-M1-265-2": "D", "DICT3-M1-267-3": "D",
    "DICT3-M2-002": "A", "DICT3-M2-003": "A", "DICT3-M2-036": "D",
    "DICT3-M2-060": "E", "DICT3-M2-066": "A", "DICT3-M2-099": "B",
    "DICT3-M2-121": "D", "DICT3-M2-197": "D", "DICT3-M2-211": "C",
    "DICT3-M2-215": "C", "DICT3-M2-257-2": "D", "DICT3-M2-265-3": "B",
}


@dataclass(frozen=True)
class Panel:
    mock: int
    ordinal: int
    source_id: str
    block: int
    page: int
    half: int
    y: float
    kind: str


def compact(value: str) -> str:
    return unicodedata.normalize("NFKC", value).replace(" ", "").replace("\n", "")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def question_starts(document: fitz.Document, mock: int, first: int, last: int) -> list[tuple[int, float]]:
    starts: list[tuple[int, float]] = []
    for page_number in range(first, last + 1):
        for block in document[page_number - 1].get_text("blocks"):
            x, y, *_rest, text = (*block[:4], block[4])
            value = compact(text)
            if x < 100 and "□□" in value[:10]:
                starts.append((page_number, y))
    repairs = QUESTION_REPAIRS[mock]
    for number, (page, y) in repairs.items():
        if first <= page <= last:
            starts.append((page, y))
    return sorted(set(starts))


def explanation_starts(document: fitz.Document, mock: int, first: int, last: int) -> dict[int, tuple[int, float]]:
    found: dict[int, tuple[int, float]] = {}
    for page_number in range(first, last + 1):
        for block in document[page_number - 1].get_text("blocks"):
            x, y, *_rest, text = (*block[:4], block[4])
            if x <= 420:
                continue
            value = compact(text)
            for raw in re.findall(r"問題([0-9]{1,3})", value):
                number = int(raw)
                if 1 <= number <= 240 and number not in found:
                    found[number] = (page_number, y)
    found.update(EXPLANATION_REPAIRS[mock])
    return found


def type_a_panels(document: fitz.Document, mock: int) -> tuple[list[Panel], list[Panel]]:
    questions: list[Panel] = []
    explanations: list[Panel] = []
    for block, (first, last, start_number) in enumerate(TYPE_A_RANGES[mock], 1):
        starts = question_starts(document, mock, first, last)
        if len(starts) != 60:
            raise ValueError(f"mock {mock} block {block}: detected {len(starts)} question panels, expected 60")
        for offset, (page, y) in enumerate(starts):
            number = start_number + offset
            questions.append(Panel(mock, number, f"{number:03d}", block, page, 0, y, "type-a"))

        headers = explanation_starts(document, mock, first, last)
        for number in range(start_number, start_number + 60):
            if number not in headers:
                raise ValueError(f"mock {mock}: explanation header {number} was not found")
            page, y = headers[number]
            explanations.append(Panel(mock, number, f"{number:03d}", block, page, 1, y, "type-a"))
    return questions, explanations


def linked_panels(document: fitz.Document, mock: int) -> list[Panel]:
    first, last = LINKED_RANGES[mock]
    raw: list[tuple[int, int, int, int, float]] = []
    for page_number in range(first, last + 1):
        for block in document[page_number - 1].get_text("blocks"):
            x, y, *_rest, text = (*block[:4], block[4])
            value = compact(text)
            match = re.search(r"□□(2[4-7][0-9])(?:-?\d)?\(([1-4])\)", value[:40])
            if match:
                raw.append((int(match.group(1)), int(match.group(2)), page_number, int(x >= 420), y))

    # The text layer dropped these printed markers, but the panels are visible
    # at the normal half-page positions in the reviewed source.
    for (repair_mock, number, part), (page, half, y) in LINKED_REPAIRS.items():
        if repair_mock == mock:
            raw.append((number, part, page, half, y))

    actual = {(number, part): (page, half, y) for number, part, page, half, y in raw}
    expected = [(number, part) for number in range(241, 261) for part in (1, 2)]
    final_stem = 270 if mock == 1 else 266
    expected += [(number, part) for number in range(261, final_stem + 1) for part in (1, 2, 3, 4)]
    missing = [key for key in expected if key not in actual]
    if missing:
        raise ValueError(f"mock {mock}: linked panels missing from detected source: {missing}")

    result: list[Panel] = []
    for index, (number, part) in enumerate(expected, 241):
        page, half, y = actual[(number, part)]
        block_number = 5 if number <= 260 else 6
        result.append(Panel(mock, index, f"{number:03d}-{part}", block_number, page, half, y, "linked"))
    return result


def next_y(panel: Panel, panels: list[Panel], default: float = 548.0) -> float:
    later = [item.y for item in panels if item.page == panel.page and item.half == panel.half and item.y > panel.y + 4]
    return min(later) - 5 if later else default


def rect(panel: Panel, bottom: float, top_padding: float = 6.0) -> fitz.Rect:
    left, right = HALVES[panel.half]
    return fitz.Rect(left, max(25.0, panel.y - top_padding), right, min(548.0, bottom))


def answer_from_text(value: str, choices: str) -> str | None:
    value = unicodedata.normalize("NFKC", value).upper()
    direct = re.findall(r"正\s*解\s*([A-J])", value)
    if len(set(direct)) == 1:
        return direct[0]
    marked = re.findall(r"([A-J])\s*[○〇◯]", value)
    if len(set(marked)) == 1:
        return marked[0]
    ocr_marked = re.findall(r"([A-J])O(?=\s*[:：])", value)
    if len(set(ocr_marked)) == 1:
        return ocr_marked[0]
    # In many scanned answer rows the label and mark are separate text
    # objects, or one label is dropped altogether. Their five/seven marks
    # remain ordered A..E/G, so the sole circle position is authoritative.
    marks = re.findall(r"[×○〇◯]", value)
    if len(marks) == len(choices) and marks.count("○") + marks.count("〇") + marks.count("◯") == 1:
        circle = next(index for index, mark in enumerate(marks) if mark in "○〇◯")
        return choices[circle]
    return None


def choices_from_text(value: str) -> str:
    """Return the contiguous A-E/J choice range printed in a linked item."""
    value = unicodedata.normalize("NFKC", value).upper()
    labels = set(re.findall(r"(?m)^\s*([A-J])(?=[^A-Z\n])", value))
    highest = max((ord(label) - ord("A") for label in labels), default=4)
    highest = max(4, min(9, highest))
    return "ABCDEFGHIJ"[: highest + 1]


def render(page: fitz.Page, crop: fitz.Rect, target: Path, scale: float, quality: int) -> None:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=crop, colorspace=fitz.csRGB, alpha=False)
    image = Image.open(io.BytesIO(pixmap.tobytes("png")))
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=quality, method=6)


def linked_split_y(document: fitz.Document, panel: Panel) -> float:
    page = document[panel.page - 1]
    left, right = HALVES[panel.half]
    candidates: list[float] = []
    anchors: list[float] = []
    for block in page.get_text("blocks"):
        x, y, x1, _y1, text, *_ = block
        if x1 < left or x > right or y <= panel.y + 30:
            continue
        value = compact(text)
        # Several scanned headings have one damaged glyph in the text layer
        # (for example "函題範藺"), while the printed heading is intact.
        if "出題範囲" in value or "題範" in value:
            candidates.append(y)
        if "正解" in value or "答と誤答" in value or "根拠" in value:
            anchors.append(y)
    if candidates:
        return min(candidates)
    # Last-resort recovery for headings whose entire OCR is damaged. The
    # answer heading follows the source-scope box by roughly 50 points.
    if anchors:
        return max(panel.y + 40, min(anchors) - 55)
    raise ValueError(f"{panel.mock}-{panel.source_id}: explanation boundary was not found")


def import_source(source: Path, output: Path, scale: float, quality: int) -> dict:
    if sha256(source) != SOURCE_SHA256:
        raise ValueError("source PDF hash does not match the linked Dictionary 3 file")
    document = fitz.open(source)
    if len(document) != 272:
        raise ValueError(f"source PDF has {len(document)} pages, expected 272")

    items: list[dict] = []
    unresolved: list[dict] = []
    for mock in (1, 2):
        questions, explanations = type_a_panels(document, mock)
        explanation_by_number = {item.ordinal: item for item in explanations}
        all_type_a = questions + explanations
        for question in questions:
            explanation = explanation_by_number[question.ordinal]
            name = f"mock{mock}-{question.source_id}.webp"
            question_rect = rect(question, next_y(question, all_type_a))
            explanation_rect = rect(explanation, next_y(explanation, all_type_a))
            text = document[explanation.page - 1].get_text(clip=explanation_rect)
            uid = f"DICT3-M{mock}-{question.source_id}"
            answer = ANSWER_OVERRIDES.get(uid) or answer_from_text(text, "ABCDE")
            if not answer:
                unresolved.append({"uid": uid, "issue": "answer OCR is ambiguous"})
            render(document[question.page - 1], question_rect, output / "questions" / name, scale, quality)
            render(document[explanation.page - 1], explanation_rect, output / "explanations" / name, scale, quality)
            items.append({
                "uid": uid, "mock": mock, "block": question.block,
                "sourceId": question.source_id, "number": len(items) + 1, "answer": answer,
                "choices": "ABCDE", "questionImage": f"dictionary-assets/mock-exams/questions/{name}",
                "explanationImage": f"dictionary-assets/mock-exams/explanations/{name}",
                "sourcePage": question.page, "explanationPage": explanation.page,
            })

        linked = linked_panels(document, mock)
        for panel in linked:
            name = f"mock{mock}-{panel.source_id}.webp"
            if mock == 1 and 131 <= panel.page <= 136:
                # These six long Type-Q items put the question on the left and
                # its explanation on the right instead of stacking both.
                question_rect = rect(panel, 548.0)
                explanation_panel = Panel(**{**panel.__dict__, "half": 1, "y": 40.0})
                explanation_rect = rect(explanation_panel, 548.0, 0.0)
            else:
                split = linked_split_y(document, panel)
                question_rect = rect(panel, split - 4)
                explanation_rect = rect(Panel(**{**panel.__dict__, "y": split}), 548.0, 4.0)
            question_text = unicodedata.normalize(
                "NFKC", document[panel.page - 1].get_text(clip=question_rect)
            )
            choices = choices_from_text(question_text)
            text = document[panel.page - 1].get_text(clip=explanation_rect)
            uid = f"DICT3-M{mock}-{panel.source_id}"
            answer = ANSWER_OVERRIDES.get(uid) or answer_from_text(text, choices)
            if answer and answer not in choices:
                choices = "ABCDEFGHIJ"[: ord(answer) - ord("A") + 1]
            if not answer:
                unresolved.append({"uid": uid, "issue": "answer OCR is ambiguous"})
            render(document[panel.page - 1], question_rect, output / "questions" / name, scale, quality)
            render(document[panel.page - 1], explanation_rect, output / "explanations" / name, scale, quality)
            items.append({
                "uid": uid, "mock": mock, "block": panel.block,
                "sourceId": panel.source_id, "number": len(items) + 1, "answer": answer,
                "choices": choices, "questionImage": f"dictionary-assets/mock-exams/questions/{name}",
                "explanationImage": f"dictionary-assets/mock-exams/explanations/{name}",
                "sourcePage": panel.page, "explanationPage": panel.page,
            })

    items.sort(key=lambda item: (item["mock"], item["block"], item["number"]))
    for number, item in enumerate(items, 1):
        item["number"] = number
    manifest = {
        "schemaVersion": 1,
        "source": "CBTの辞典③ 誌上問題篇",
        "sourceFileSha256": SOURCE_SHA256,
        "expectedFromAvailableSource": 624,
        "count": len(items),
        "mockCounts": {"1": sum(item["mock"] == 1 for item in items), "2": sum(item["mock"] == 2 for item in items)},
        "sourceGap": {"mock": 2, "block": 6, "coverCount": 40, "availableCount": 24, "missingCount": 16, "lastAvailableId": "266-4"},
        "unresolved": unresolved,
        "items": items,
    }
    output.mkdir(parents=True, exist_ok=True)
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--scale", type=float, default=1.7)
    parser.add_argument("--quality", type=int, default=72)
    parser.add_argument("--allow-unresolved", action="store_true")
    args = parser.parse_args()
    try:
        manifest = import_source(args.source, args.output, args.scale, args.quality)
    except ValueError as error:
        print(f"Import failed: {error}")
        return 2
    print(json.dumps({key: manifest[key] for key in ("count", "mockCounts", "sourceGap")}, ensure_ascii=False))
    print(f"Unresolved: {len(manifest['unresolved'])}")
    if manifest["unresolved"] and not args.allow_unresolved:
        print(json.dumps(manifest["unresolved"], ensure_ascii=False, indent=2))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

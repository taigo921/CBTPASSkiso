#!/usr/bin/env python3
"""Regenerate review-only ANSWER question figures from the source PDFs.

This script never writes to data/*.json.  Crops, contact sheets, and the
resumable report are written below /private/tmp/answer-figs by default.
"""

from __future__ import annotations

import argparse
import base64
import bisect
import difflib
import io
import json
import math
import re
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

import numpy as np
import pypdfium2 as pdfium
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path("/private/tmp/answer-figs")
PDFS = {
    1: Path("/Users/taigo/CBTPASS-sources/answer ①基礎編.pdf.pdf"),
    2: Path("/Users/taigo/CBTPASS-sources/answer ②基礎編.pdf.pdf"),
    3: Path("/Users/taigo/CBTPASS-sources/answer ③臨床編.pdf.pdf"),
    4: Path("/Users/taigo/CBTPASS-sources/answer ④臨床編.pdf"),
}
NORMAL_RE = re.compile(r"[^0-9A-Za-zぁ-んァ-ヶ一-龠々ー]+")
EXPLANATION_MARKERS = ("選択肢チェック", "【正解", "正解 ", "正解　")
IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg")
# Full-page scan coordinates at the 2x detection scale.  These four visuals
# cannot be recovered by removing OCR glyphs: a codon table and graph consist
# mostly of text, while the other two diagrams are nearly empty line art.
MANUAL_CROPS: dict[str, tuple[int, tuple[int, int, int, int]]] = {
    "ANS1-B-4-2-017": (224, (185, 747, 657, 1050)),
    "ANS2-C-2-2-015": (24, (167, 130, 639, 482)),
    "ANS2-D-1-023": (285, (368, 281, 466, 379)),
    "ANS4-E-4-1-054": (393, (277, 386, 544, 524)),
}


@dataclass
class PageText:
    text: str
    normalized: str
    norm_to_char: list[int]
    line_ranges: list[tuple[int, int]]


@dataclass
class Match:
    page_index: int
    score: float
    start_char: int
    end_char: int


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--files",
        nargs="*",
        help="JSON paths, basenames, stems, or comma-separated values (default: all answer files)",
    )
    parser.add_argument(
        "--uids",
        nargs="*",
        help="UIDs or comma-separated UIDs (default: every question with image_base64)",
    )
    parser.add_argument("--output-dir", type=Path, default=OUTPUT)
    parser.add_argument("--force", action="store_true", help="regenerate completed UIDs")
    parser.add_argument("--no-contact-sheets", action="store_true")
    parser.add_argument("--contact-only", action="store_true")
    return parser.parse_args()


def flatten(values: list[str] | None) -> list[str]:
    return [item.strip() for value in values or [] for item in value.split(",") if item.strip()]


def normalize(text: str) -> str:
    return NORMAL_RE.sub("", text).lower()


def select_files(values: list[str] | None) -> list[Path]:
    all_files = sorted((ROOT / "data").glob("answer[1-4]-*.json"))
    requested = flatten(values)
    if not requested:
        return all_files
    result: list[Path] = []
    for value in requested:
        candidate = Path(value)
        names = {value, candidate.name, candidate.stem}
        matches = [p for p in all_files if p.name in names or p.stem in names]
        if not matches and candidate.exists():
            matches = [candidate.resolve()]
        if not matches:
            raise SystemExit(f"unknown --files value: {value}")
        result.extend(matches)
    return sorted(set(result))


def load_questions(files: list[Path], wanted_uids: set[str]) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    volume_orders: dict[int, int] = defaultdict(int)
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            raise SystemExit(f"expected a JSON array: {path}")
        for question in data:
            uid = str(question.get("uid", ""))
            match = re.match(r"ANS([1-4])-", uid)
            if not match:
                raise SystemExit(f"cannot determine ANSWER volume for {uid}")
            volume = int(match.group(1))
            order = volume_orders[volume]
            volume_orders[volume] += 1
            if not question.get("image_base64") or (wanted_uids and uid not in wanted_uids):
                continue
            item = dict(question)
            item["_file"] = path.name
            item["_volume"] = volume
            item["_volume_order"] = order
            questions.append(item)
    found = {q["uid"] for q in questions}
    missing = wanted_uids - found
    if missing:
        raise SystemExit("UIDs not found or lacking image_base64: " + ", ".join(sorted(missing)))
    return questions


def make_page_text(page: pdfium.PdfPage) -> PageText:
    textpage = page.get_textpage()
    text = textpage.get_text_range()
    normalized_chars: list[str] = []
    norm_to_char: list[int] = []
    for index, char in enumerate(text):
        cleaned = normalize(char)
        for out_char in cleaned:
            normalized_chars.append(out_char)
            norm_to_char.append(index)
    line_ranges: list[tuple[int, int]] = []
    start = 0
    for match in re.finditer(r"\r?\n", text):
        if match.start() > start:
            line_ranges.append((start, match.start()))
        start = match.end()
    if start < len(text):
        line_ranges.append((start, len(text)))
    return PageText(text, "".join(normalized_chars), norm_to_char, line_ranges)


def cache_page_texts(volume: int, document: pdfium.PdfDocument, cache_dir: Path) -> list[PageText]:
    cache_path = cache_dir / f"answer{volume}-text.json"
    if cache_path.exists():
        raw = json.loads(cache_path.read_text(encoding="utf-8"))
        if raw.get("page_count") == len(document):
            return [
                PageText(p["text"], p["normalized"], p["norm_to_char"], [tuple(x) for x in p["line_ranges"]])
                for p in raw["pages"]
            ]
    pages: list[PageText] = []
    for index in range(len(document)):
        pages.append(make_page_text(document[index]))
        if index % 50 == 0:
            print(f"answer{volume}: indexed text page {index}/{len(document) - 1}", file=sys.stderr)
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(
            {
                "page_count": len(document),
                "pages": [
                    {
                        "text": p.text,
                        "normalized": p.normalized,
                        "norm_to_char": p.norm_to_char,
                        "line_ranges": p.line_ranges,
                    }
                    for p in pages
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return pages


def best_window(query: str, page_text: str) -> tuple[float, int, int]:
    """Return a fuzzy ratio and location without comparing against the whole page."""
    if not query or not page_text:
        return 0.0, 0, 0
    exact = page_text.find(query)
    if exact >= 0:
        return 1.0, exact, exact + len(query)
    matcher = difflib.SequenceMatcher(None, query, page_text, autojunk=False)
    blocks = sorted(matcher.get_matching_blocks(), key=lambda block: block.size, reverse=True)[:5]
    best = (0.0, 0, min(len(page_text), len(query)))
    for block in blocks:
        if not block.size:
            continue
        estimated = max(0, block.b - block.a)
        for delta in range(-8, 9, 2):
            start = max(0, estimated + delta)
            for length_delta in (-5, 0, 5, 10):
                end = min(len(page_text), start + max(8, len(query) + length_delta))
                score = difflib.SequenceMatcher(None, query, page_text[start:end], autojunk=False).ratio()
                if score > best[0]:
                    best = (score, start, end)
    return best


def locate_question(
    question: dict[str, Any],
    pages: list[PageText],
    min_page: int = 0,
    max_page: int | None = None,
    expected_page: float | None = None,
) -> Match:
    qnorm = normalize(str(question.get("question", "")))
    # 15-25 chars is stable across punctuation/OCR differences; a longer second
    # key disambiguates repeated clinical lead-ins such as "XX歳の男性".
    head = qnorm[:25]
    long_query = qnorm[:80]
    exact_candidates = [
        index for index, page in enumerate(pages)
        if index >= min_page and (max_page is None or index <= max_page) and head and head in page.normalized
    ]
    candidates = exact_candidates
    if not candidates:
        # Shortlist by character n-gram overlap, then calculate a true local
        # window score only on the strongest pages. This is much cheaper than a
        # whole-page SequenceMatcher for every page in the book.
        grams = {head[i : i + 3] for i in range(max(0, len(head) - 2))}
        ranked: list[tuple[float, int]] = []
        for index, page in enumerate(pages):
            if index < min_page or (max_page is not None and index > max_page):
                continue
            overlap = sum(1 for gram in grams if gram in page.normalized)
            ranked.append((overlap / max(1, len(grams)), index))
        candidates = [index for _, index in sorted(ranked, reverse=True)[:12]]

    choice_text = "".join(str(value) for value in question.get("choices", {}).values())
    choice_key = normalize(choice_text)[:60]
    best: tuple[float, float, int, int, int] = (-1.0, -1.0, -1, 0, 0)
    for index in candidates:
        page = pages[index]
        score, start, end = best_window(long_query, page.normalized)
        if choice_key:
            choice_score, _, _ = best_window(choice_key, page.normalized)
            score = score * 0.82 + choice_score * 0.18
        adjusted = score
        if expected_page is not None:
            adjusted -= 0.018 * abs(index - expected_page)
        if adjusted > best[0]:
            best = (adjusted, score, index, start, end)
    _, score, page_index, norm_start, norm_end = best
    if page_index < 0:
        return Match(-1, 0.0, 0, 0)
    selected_page = pages[page_index]
    # The strongest fuzzy window can begin at the second sentence when OCR over
    # a photo corrupts the first sentence. Refine the block start from the first
    # transcribed line once the page itself is known.
    first_line = normalize(str(question.get("question", "")).splitlines()[0])[:25]
    if len(first_line) >= 8:
        refined = selected_page.normalized.find(first_line)
        if refined < 0 and len(first_line) > 12:
            refined = selected_page.normalized.find(first_line[:12])
        if refined >= 0:
            norm_start = refined
            norm_end = max(norm_end, refined + len(first_line))
    mapping = selected_page.norm_to_char
    start_char = mapping[min(norm_start, len(mapping) - 1)] if mapping else 0
    end_char = mapping[min(max(norm_end - 1, 0), len(mapping) - 1)] + 1 if mapping else 0
    return Match(page_index, round(score, 4), start_char, end_char)


def char_box(textpage: pdfium.PdfTextPage, index: int) -> tuple[float, float, float, float] | None:
    try:
        left, bottom, right, top = textpage.get_charbox(index)
    except Exception:
        return None
    if right <= left or top <= bottom:
        return None
    return left, bottom, right, top


def line_for_char(page: PageText, char_index: int) -> tuple[int, int]:
    for start, end in page.line_ranges:
        if start <= char_index <= end:
            return start, end
    return max(0, char_index), min(len(page.text), char_index + 1)


def line_box(textpage: pdfium.PdfTextPage, line: tuple[int, int]) -> tuple[float, float, float, float] | None:
    boxes = [char_box(textpage, i) for i in range(*line)]
    boxes = [box for box in boxes if box]
    if not boxes:
        return None
    return min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes)


def find_explanation_start(page: PageText, start_char: int) -> int:
    positions = [page.text.find(marker, start_char) for marker in EXPLANATION_MARKERS]
    positions = [position for position in positions if position >= 0]
    if positions:
        return min(positions)
    # OCR sometimes mangles the blue heading.  The answer display is a reliable
    # fallback, and the next question line must not enter the search region.
    answer = page.text.find("正解", start_char)
    return answer if answer >= 0 else len(page.text)


def find_choice_end(page: PageText, question: dict[str, Any], start_char: int, limit_char: int) -> int | None:
    """Find the first (question-side) occurrence of choice text, not its explanation."""
    norm_start = bisect.bisect_left(page.norm_to_char, start_char)
    norm_limit = bisect.bisect_left(page.norm_to_char, limit_char)
    norm_limit = min(len(page.normalized), max(norm_start + 120, norm_limit))
    best_char: int | None = None
    for value in question.get("choices", {}).values():
        key = normalize(str(value))[:24]
        if len(key) < 2:
            continue
        position = page.normalized.find(key, norm_start, norm_limit)
        if position < 0 and len(key) > 10:
            position = page.normalized.find(key[:10], norm_start, norm_limit)
        if position >= 0 and page.norm_to_char:
            end_norm = min(len(page.norm_to_char) - 1, position + len(key) - 1)
            char_position = page.norm_to_char[end_norm] + 1
            best_char = max(best_char or 0, char_position)
    return best_char


def pdf_to_pixels(box: tuple[float, float, float, float], page_height: float, scale: float) -> tuple[int, int, int, int]:
    left, bottom, right, top = box
    return (
        int(math.floor(left * scale)),
        int(math.floor((page_height - top) * scale)),
        int(math.ceil(right * scale)),
        int(math.ceil((page_height - bottom) * scale)),
    )


class UnionFind:
    def __init__(self) -> None:
        self.parent: list[int] = []

    def add(self) -> int:
        value = len(self.parent)
        self.parent.append(value)
        return value

    def find(self, value: int) -> int:
        while self.parent[value] != value:
            self.parent[value] = self.parent[self.parent[value]]
            value = self.parent[value]
        return value

    def union(self, first: int, second: int) -> None:
        a, b = self.find(first), self.find(second)
        if a != b:
            self.parent[b] = a


def connected_components(mask: np.ndarray, x_offset: int, y_offset: int) -> list[dict[str, int]]:
    """8-connected components using row runs (fast without scipy/opencv)."""
    union = UnionFind()
    runs: list[tuple[int, int, int, int]] = []  # y, x0, x1-exclusive, label
    previous: list[tuple[int, int, int]] = []
    for y, row in enumerate(mask):
        padded = np.pad(row.astype(np.int8), (1, 1))
        changes = np.diff(padded)
        starts = np.flatnonzero(changes == 1)
        ends = np.flatnonzero(changes == -1)
        current: list[tuple[int, int, int]] = []
        previous_index = 0
        for x0, x1 in zip(starts.tolist(), ends.tolist()):
            label = union.add()
            while previous_index < len(previous) and previous[previous_index][1] < x0 - 1:
                previous_index += 1
            scan = previous_index
            while scan < len(previous) and previous[scan][0] <= x1:
                union.union(label, previous[scan][2])
                scan += 1
            current.append((x0, x1, label))
            runs.append((y, x0, x1, label))
        previous = current
    stats: dict[int, dict[str, int]] = {}
    for y, x0, x1, label in runs:
        root = union.find(label)
        stat = stats.setdefault(
            root,
            {"x0": x0 + x_offset, "y0": y + y_offset, "x1": x1 + x_offset, "y1": y + 1 + y_offset, "area": 0},
        )
        stat["x0"] = min(stat["x0"], x0 + x_offset)
        stat["x1"] = max(stat["x1"], x1 + x_offset)
        stat["y0"] = min(stat["y0"], y + y_offset)
        stat["y1"] = max(stat["y1"], y + 1 + y_offset)
        stat["area"] += x1 - x0
    return list(stats.values())


def block_and_text_masks(
    page: pdfium.PdfPage,
    page_info: PageText,
    question: dict[str, Any],
    match: Match,
    detect_scale: float,
    image_size: tuple[int, int],
) -> tuple[tuple[int, int, int, int] | None, np.ndarray, list[tuple[int, int, int, int]]]:
    textpage = page.get_textpage()
    page_width, page_height = page.get_size()
    start_line = line_for_char(page_info, match.start_char)
    start_box = line_box(textpage, start_line)
    explanation_char = find_explanation_start(page_info, match.start_char)
    explanation_line = line_for_char(page_info, explanation_char)
    explanation_box = line_box(textpage, explanation_line)
    choice_end_char = find_choice_end(page_info, question, match.start_char, explanation_char)
    choice_end_box = line_box(textpage, line_for_char(page_info, choice_end_char)) if choice_end_char else None
    if not start_box:
        return None, np.zeros((1, 1), dtype=bool), []
    top = max(0, int((page_height - start_box[3]) * detect_scale) - 5)
    explanation_pixel_y = int((page_height - explanation_box[3]) * detect_scale) if explanation_box else None
    if choice_end_box:
        # The question figure can sit beside the choices and extend a little
        # below the final baseline, but never reaches the explanation artwork.
        bottom = min(image_size[1], int((page_height - choice_end_box[1]) * detect_scale) + 14)
        # Text extraction sometimes places the preceding question's answer at
        # the end of the page stream. Only trust an explanation marker that is
        # visually below this question and its choices.
        if explanation_pixel_y is not None and explanation_pixel_y > bottom - 20:
            bottom = min(bottom, int((page_height - explanation_box[3]) * detect_scale) - 4)
    elif explanation_box and explanation_pixel_y is not None and explanation_pixel_y > top + 20:
        bottom = min(image_size[1], int((page_height - explanation_box[3]) * detect_scale) - 4)
    else:
        bottom = min(image_size[1], int((page_height - start_box[1] + 170) * detect_scale))
    left = max(0, int(page_width * detect_scale * 0.045))
    right = min(image_size[0], int(page_width * detect_scale * 0.955))
    if bottom <= top + 20:
        return None, np.zeros((1, 1), dtype=bool), []
    text_mask = np.zeros((bottom - top, right - left), dtype=bool)
    text_boxes: list[tuple[int, int, int, int]] = []
    mask_end_char = choice_end_char or explanation_char
    for index in range(match.start_char, min(mask_end_char, textpage.count_chars())):
        box = char_box(textpage, index)
        if not box:
            continue
        x0, y0, x1, y1 = pdf_to_pixels(box, page_height, detect_scale)
        # Mask text a little beyond the OCR glyph box.  Labels embedded in a
        # figure may be masked for detection, but are retained in the final crop.
        x0, y0, x1, y1 = x0 - 3, y0 - 3, x1 + 3, y1 + 3
        ix0, iy0 = max(left, x0), max(top, y0)
        ix1, iy1 = min(right, x1), min(bottom, y1)
        if ix1 > ix0 and iy1 > iy0:
            text_mask[iy0 - top : iy1 - top, ix0 - left : ix1 - left] = True
            text_boxes.append((x0, y0, x1, y1))
    return (left, top, right, bottom), text_mask, text_boxes


def detect_figure(
    detect_image: Image.Image,
    block: tuple[int, int, int, int],
    text_mask: np.ndarray,
) -> tuple[tuple[int, int, int, int] | None, list[dict[str, int]], list[str]]:
    left, top, right, bottom = block
    rgb = np.asarray(detect_image.crop(block).convert("RGB"), dtype=np.int16)
    high, low = rgb.max(axis=2), rgb.min(axis=2)
    # Light cream/pink paper tint is background; ink and image pixels remain.
    foreground = (low < 224) | ((high - low > 24) & (low < 246))
    foreground[text_mask] = False
    # Join adjacent glyphs in figure legends/table cells into useful components.
    # Reapplying text_mask prevents question and choice glyphs from growing back.
    padded = np.pad(foreground, 2)
    dilated = np.zeros_like(foreground)
    for dy in range(5):
        for dx in range(5):
            dilated |= padded[dy : dy + foreground.shape[0], dx : dx + foreground.shape[1]]
    foreground = dilated
    foreground[text_mask] = False
    components = connected_components(foreground, left, top)
    block_width, block_height = right - left, bottom - top
    filtered: list[dict[str, int]] = []
    for component in components:
        width = component["x1"] - component["x0"]
        height = component["y1"] - component["y0"]
        area = component["area"]
        # Drop specks, text remnants, radio buttons, header rules, and edge bands.
        if area < 85 or (width < 14 and height < 14):
            continue
        if (width > block_width * 0.55 and height <= 12) or (height > block_height * 0.75 and width < 10):
            continue
        if component["x0"] <= left + 3 or component["x1"] >= right - 3:
            if (
                width < 18
                or height > block_height * 0.65
                or width < block_width * 0.28
                or (width < block_width * 0.35 and height > width * 1.5)
            ):
                continue
        # Surviving diagrams/photos/tables are either meaningfully large, or
        # belong to a cluster of nearby medium components joined below.
        if area >= 220 or width >= 35 or height >= 35:
            filtered.append(component)

    if not filtered:
        return None, [], ["no_figure"]

    # When a real photo/chart is present, discard tiny slender OCR remnants
    # before region joining.  Otherwise a radio button or one text baseline can
    # bridge the visual to a distant block of choices and pull that whole block
    # into the crop.  Keep the rule disabled for genuinely tiny standalone art.
    if max(component["area"] for component in filtered) >= 3000:
        cleaned = []
        for component in filtered:
            width = component["x1"] - component["x0"]
            height = component["y1"] - component["y0"]
            if component["area"] < 1200 and (width < 35 or height < 30):
                continue
            cleaned.append(component)
        if cleaned:
            filtered = cleaned

    # Components in the same visual region are joined by a generous gap.  This
    # keeps multi-panel photos, table cells, arrows, and legends together.
    regions: list[dict[str, Any]] = []
    for component in sorted(filtered, key=lambda c: (c["y0"], c["x0"])):
        touching: list[int] = []
        for index, region in enumerate(regions):
            x_gap = max(0, max(region["x0"], component["x0"]) - min(region["x1"], component["x1"]))
            y_gap = max(0, max(region["y0"], component["y0"]) - min(region["y1"], component["y1"]))
            x_overlap = min(region["x1"], component["x1"]) - max(region["x0"], component["x0"])
            y_overlap = min(region["y1"], component["y1"]) - max(region["y0"], component["y0"])
            if (x_gap <= 55 and y_gap <= 42) or (x_overlap > 0 and y_gap <= 75) or (y_overlap > 0 and x_gap <= 75):
                touching.append(index)
        if not touching:
            regions.append({**component, "members": [component]})
            continue
        base = regions[touching[0]]
        for key in ("x0", "y0"):
            base[key] = min(base[key], component[key])
        for key in ("x1", "y1"):
            base[key] = max(base[key], component[key])
        base["area"] += component["area"]
        base["members"].append(component)
        for index in reversed(touching[1:]):
            other = regions.pop(index)
            for key in ("x0", "y0"):
                base[key] = min(base[key], other[key])
            for key in ("x1", "y1"):
                base[key] = max(base[key], other[key])
            base["area"] += other["area"]
            base["members"].extend(other["members"])

    significant = []
    for region in regions:
        width, height = region["x1"] - region["x0"], region["y1"] - region["y0"]
        if region["area"] >= 450 or width >= 70 or height >= 70:
            significant.append(region)
    if not significant:
        return None, filtered, ["no_figure"]
    # Eliminate decorations around question numbers at the top-left.
    significant = [
        r for r in significant
        if not (r["y0"] < top + 35 and r["x0"] < left + 170 and r["y1"] - r["y0"] < 45)
    ] or significant

    # A handwritten check/circle or a surviving question-number ornament can
    # be a separate, much smaller region next to the real photographs.  Do not
    # let such an isolated mark widen the crop.  Figure labels normally merged
    # into their neighboring visual region during the generous join above.
    if len(significant) > 1:
        largest_area = max(r["area"] for r in significant)
        pruned = [
            r for r in significant
            if not (
                r["area"] < largest_area * 0.25
                and (
                    r["x1"] - r["x0"] < 100
                    or r["y1"] - r["y0"] < 50
                )
            )
        ]
        if pruned:
            significant = pruned

    x0 = min(r["x0"] for r in significant)
    y0 = min(r["y0"] for r in significant)
    x1 = max(r["x1"] for r in significant)
    y1 = max(r["y1"] for r in significant)
    flags: list[str] = []
    if len(significant) > 1:
        flags.append("multiple_regions")
    if (x1 - x0) * (y1 - y0) < 6000:
        flags.append("tiny_figure")
    # Six detect-scale pixels protect thin chart labels and scan edges without
    # reaching the nearby question/explanation baselines (12px often did).
    padding = 6
    return (
        max(left, x0 - padding),
        max(top, y0 - padding),
        min(right, x1 + padding),
        min(bottom, y1 + padding),
    ), filtered, flags


def text_overlap_flag(
    bbox: tuple[int, int, int, int],
    text_boxes: list[tuple[int, int, int, int]],
    detect_image: Image.Image,
) -> bool:
    # OCR boxes fully surrounded by the detected visual are likely legitimate
    # labels/ticks/table text. Text touching the crop boundary indicates leakage.
    x0, y0, x1, y1 = bbox
    margin = 7
    boundary_hits = 0
    for tx0, ty0, tx1, ty1 in text_boxes:
        overlap_x = min(x1, tx1) - max(x0, tx0)
        overlap_y = min(y1, ty1) - max(y0, ty0)
        if overlap_x <= 0 or overlap_y <= 0:
            continue
        if tx0 < x0 + margin or tx1 > x1 - margin or ty0 < y0 + margin or ty1 > y1 - margin:
            boundary_hits += 1
    return boundary_hits >= 2


def trim_question_text(
    bbox: tuple[int, int, int, int],
    text_boxes: list[tuple[int, int, int, int]],
) -> tuple[int, int, int, int]:
    """Remove question/choice glyphs caught only at a crop boundary."""
    x0, y0, x1, y1 = bbox
    for _ in range(3):
        changed = False
        for tx0, ty0, tx1, ty1 in text_boxes:
            if min(x1, tx1) <= max(x0, tx0) or min(y1, ty1) <= max(y0, ty0):
                continue
            distances = {
                "top": abs(ty0 - y0),
                "bottom": abs(y1 - ty1),
                "left": abs(tx0 - x0),
                "right": abs(x1 - tx1),
            }
            edge = min(distances, key=distances.get)
            if distances[edge] > 22:
                continue
            if edge == "top" and ty1 + 3 < y1 - 20:
                y0 = max(y0, ty1 + 3)
            elif edge == "bottom" and ty0 - 3 > y0 + 20:
                y1 = min(y1, ty0 - 3)
            elif edge == "left" and tx1 + 3 < x1 - 20:
                x0 = max(x0, tx1 + 3)
            elif edge == "right" and tx0 - 3 > x0 + 20:
                x1 = min(x1, tx0 - 3)
            else:
                continue
            changed = True
        if not changed:
            break
    return x0, y0, x1, y1


def retighten_to_components(
    bbox: tuple[int, int, int, int],
    components: list[dict[str, int]],
    block: tuple[int, int, int, int],
) -> tuple[int, int, int, int]:
    """Discard components that a text-boundary trim placed outside the crop."""
    x0, y0, x1, y1 = bbox
    kept = []
    for component in components:
        center_x = (component["x0"] + component["x1"]) / 2
        center_y = (component["y0"] + component["y1"]) / 2
        if x0 <= center_x <= x1 and y0 <= center_y <= y1:
            kept.append(component)
    if not kept:
        return bbox
    left, top, right, bottom = block
    padding = 12
    return (
        max(left, min(c["x0"] for c in kept) - padding),
        max(top, min(c["y0"] for c in kept) - padding),
        min(right, max(c["x1"] for c in kept) + padding),
        min(bottom, max(c["y1"] for c in kept) + padding),
    )


def classify_photo(image: Image.Image) -> bool:
    sample = image.convert("RGB")
    sample.thumbnail((320, 320), Image.Resampling.LANCZOS)
    array = np.asarray(sample, dtype=np.int16)
    if not array.size:
        return False
    saturation = array.max(axis=2) - array.min(axis=2)
    near_white = float(np.mean(array.min(axis=2) > 238))
    if near_white > 0.55:
        return False
    # Photos have many occupied RGB bins or substantial continuous grayscale
    # texture. Colored textbook line art remains comparatively sparse.
    quantized = (array // 16).reshape(-1, 3)
    colors = len(np.unique(quantized, axis=0))
    gray = array.mean(axis=2)
    texture = float(np.mean(np.abs(np.diff(gray, axis=0)))) if gray.shape[0] > 1 else 0.0
    return colors > 260 or (colors > 120 and texture > 8.0) or float(np.mean(saturation)) > 34


def save_crop(image: Image.Image, path_base: Path, old_data_uri: str = "") -> tuple[Path, str]:
    image = image.convert("RGB")
    if image.width > 820:
        height = max(1, round(image.height * 820 / image.width))
        image = image.resize((820, height), Image.Resampling.LANCZOS)
    old_is_photo = old_data_uri.startswith("data:image/jpeg") or old_data_uri.startswith("data:image/jpg")
    old_is_line_art = old_data_uri.startswith("data:image/png")
    photo = old_is_photo if old_is_photo or old_is_line_art else classify_photo(image)
    if photo:
        path = path_base.with_suffix(".jpg")
        image.save(path, format="JPEG", quality=80, optimize=True)
        return path, "photo"
    path = path_base.with_suffix(".png")
    image.quantize(colors=48, method=Image.Quantize.MEDIANCUT).save(path, format="PNG", optimize=True)
    return path, "line_art"


def find_output(output_dir: Path, uid: str) -> Path | None:
    return next((output_dir / f"{uid}{extension}" for extension in IMAGE_EXTENSIONS if (output_dir / f"{uid}{extension}").exists()), None)


def old_image(question: dict[str, Any]) -> Image.Image:
    _, encoded = str(question["image_base64"]).split(",", 1)
    return Image.open(io.BytesIO(base64.b64decode(encoded))).convert("RGB")


def fit_preview(image: Image.Image, width: int, height: int) -> Image.Image:
    image = image.copy().convert("RGB")
    image.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), "white")
    canvas.paste(image, ((width - image.width) // 2, (height - image.height) // 2))
    return canvas


def make_contact_sheets(
    questions: list[dict[str, Any]], report: dict[str, Any], output_dir: Path
) -> None:
    review_dir = output_dir / "review"
    review_dir.mkdir(parents=True, exist_ok=True)
    font = ImageFont.load_default(size=18)
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for question in questions:
        if question["uid"] in report:
            grouped[question["_file"]].append(question)
    for filename, items in grouped.items():
        for sheet_index in range(0, len(items), 20):
            chunk = items[sheet_index : sheet_index + 20]
            row_height, preview_width, label_width = 310, 480, 610
            sheet = Image.new("RGB", (preview_width * 2 + label_width, row_height * len(chunk)), "white")
            draw = ImageDraw.Draw(sheet)
            for row, question in enumerate(chunk):
                y = row * row_height
                entry = report[question["uid"]]
                try:
                    sheet.paste(fit_preview(old_image(question), preview_width, row_height - 35), (0, y + 35))
                except Exception:
                    pass
                output = find_output(output_dir, question["uid"])
                if output:
                    sheet.paste(fit_preview(Image.open(output), preview_width, row_height - 35), (preview_width, y + 35))
                flags = ",".join(entry.get("flags", [])) or "ok"
                label = (
                    f"{question['uid']}\npage {entry.get('page_index')}  "
                    f"match {entry.get('match_score', 0):.3f}\nconfidence {entry.get('confidence')}\n{flags}"
                )
                draw.text((preview_width * 2 + 12, y + 45), label, fill="black", font=font, spacing=8)
                draw.text((8, y + 8), "OLD", fill="#555555", font=font)
                draw.text((preview_width + 8, y + 8), "NEW", fill="#555555", font=font)
                draw.line((0, y + row_height - 1, sheet.width, y + row_height - 1), fill="#bbbbbb", width=1)
            stem = Path(filename).stem
            suffix = sheet_index // 20 + 1
            destination = review_dir / f"{stem}-{suffix:03d}.png"
            sheet.save(destination, format="PNG", optimize=True)


def write_report(path: Path, report: dict[str, Any]) -> None:
    temporary = path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    args = parse_args()
    files = select_files(args.files)
    wanted_uids = set(flatten(args.uids))
    questions = load_questions(files, wanted_uids)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.output_dir / "report.json"
    report: dict[str, Any] = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}

    if args.contact_only:
        make_contact_sheets(questions, report, args.output_dir)
        return 0

    by_volume: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for question in questions:
        if not args.force and question["uid"] in report and find_output(args.output_dir, question["uid"]):
            continue
        by_volume[question["_volume"]].append(question)

    for volume, volume_questions in sorted(by_volume.items()):
        source = PDFS[volume]
        if not source.is_file():
            raise SystemExit(f"missing source PDF: {source}")
        document = pdfium.PdfDocument(str(source))
        pages = cache_page_texts(volume, document, args.output_dir / "cache")
        matches: dict[str, Match] = {}
        min_page = 0
        previous_order: int | None = None
        for number, question in enumerate(volume_questions, 1):
            current_order = int(question["_volume_order"])
            max_page = None
            expected_page = None
            if previous_order is not None:
                order_gap = max(1, current_order - previous_order)
                max_page = min(len(pages) - 1, min_page + order_gap + 3)
                expected_page = min_page + order_gap * 0.6
            manual = MANUAL_CROPS.get(question["uid"])
            if manual:
                match = Match(manual[0], 1.0, 0, 0)
            else:
                match = locate_question(
                    question,
                    pages,
                    min_page=min_page,
                    max_page=max_page,
                    expected_page=expected_page,
                )
            matches[question["uid"]] = match
            if match.page_index >= 0:
                min_page = match.page_index
            previous_order = current_order
            if number % 25 == 0:
                print(f"answer{volume}: matched {number}/{len(volume_questions)}", file=sys.stderr)

        grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
        for question in volume_questions:
            grouped[matches[question["uid"]].page_index].append(question)

        for page_index, page_questions in sorted(grouped.items()):
            if page_index < 0:
                for question in page_questions:
                    report[question["uid"]] = {
                        "file": question["_file"], "page_index": None, "match_score": 0.0,
                        "bbox": None, "components": [], "confidence": "low", "flags": ["page_not_found"],
                    }
                write_report(report_path, report)
                continue
            page = document[page_index]
            detect_scale, render_scale = 2.0, 4.0
            detect_image = page.render(scale=detect_scale).to_pil().convert("RGB")
            render_image = page.render(scale=render_scale).to_pil().convert("RGB")
            for question in page_questions:
                uid = question["uid"]
                match = matches[uid]
                flags: list[str] = []
                if match.score < 0.78:
                    flags.append("low_match")
                manual = MANUAL_CROPS.get(uid)
                bbox: tuple[int, int, int, int] | None = None
                components: list[dict[str, int]] = []
                text_boxes: list[tuple[int, int, int, int]] = []
                if manual:
                    bbox = manual[1]
                    flags.append("manual_crop")
                else:
                    block, text_mask, text_boxes = block_and_text_masks(
                        page, pages[page_index], question, match, detect_scale, detect_image.size
                    )
                    if block:
                        bbox, components, detection_flags = detect_figure(detect_image, block, text_mask)
                        flags.extend(detection_flags)
                    else:
                        flags.append("no_figure")
                output_path = None
                image_kind = None
                render_bbox = None
                if bbox:
                    # Keep the visual-component bounds found above.  The source
                    # PDFs are full-page scans with an OCR text layer, and that
                    # layer frequently places spurious character boxes over a
                    # photograph.  Trimming against those boxes can collapse a
                    # correct multi-panel crop into a few-pixel strip.  Question
                    # and choice text has already been removed from the detection
                    # mask, so a second destructive trim is both unnecessary and
                    # unsafe here.
                    if text_overlap_flag(bbox, text_boxes, detect_image):
                        flags.append("text_inside")
                    ratio = render_scale / detect_scale
                    render_bbox = tuple(int(round(value * ratio)) for value in bbox)
                    crop = render_image.crop(render_bbox)
                    for extension in IMAGE_EXTENSIONS:
                        stale = args.output_dir / f"{uid}{extension}"
                        if stale.exists():
                            stale.unlink()
                    output_path, image_kind = save_crop(crop, args.output_dir / uid, str(question.get("image_base64", "")))
                severe = {"page_not_found", "no_figure", "text_inside", "low_match", "tiny_figure"}
                confidence = "low" if severe.intersection(flags) else ("medium" if "multiple_regions" in flags else "high")
                report[uid] = {
                    "file": question["_file"],
                    "page_index": page_index,
                    "match_score": match.score,
                    "bbox": list(render_bbox) if render_bbox else None,
                    "components": components,
                    "confidence": confidence,
                    "flags": list(dict.fromkeys(flags)),
                    "output": str(output_path) if output_path else None,
                    "image_kind": image_kind,
                }
                write_report(report_path, report)
                print(f"{uid}: page {page_index}, {confidence}, {','.join(flags) or 'ok'}", file=sys.stderr)

    if not args.no_contact_sheets:
        make_contact_sheets(questions, report, args.output_dir)
    print(f"processed report entries: {len(report)}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

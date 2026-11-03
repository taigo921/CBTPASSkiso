#!/usr/bin/env python3
"""Import the answer-verified questions from the school dental-materials Form.

The source is a 157-page PDF made from Microsoft Forms screenshots.  It says
there are 50 questions, but twelve questions never show a submitted/correct
answer in the supplied screenshots.  Those entries stay explicitly unresolved
instead of treating the student's selected radio button as an answer key.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path

import fitz
from PIL import Image, ImageOps


SOURCE_SHA256 = "c72730f7648a1d41b737ad5919615c2683c04b7a83297b1788048036b0688c37"
UNVERIFIED = [13, 18, 19, 24, 25, 26, 27, 32, 43, 44, 48, 52]


@dataclass(frozen=True)
class VerifiedQuestion:
    number: int
    answer: str
    question_page: int
    answer_page: int
    choice_page: int | None = None
    choice_labels: tuple[str, ...] | None = None


# Page numbers are one-based. Each answer page was inspected for the Forms
# correct-result check, not merely a selected radio button.
VERIFIED = [
    VerifiedQuestion(3, "D", 3, 4, 5),
    VerifiedQuestion(4, "C", 1, 151, 2),
    VerifiedQuestion(5, "D", 149, 147, 148),
    VerifiedQuestion(6, "B", 146, 144, 141),
    VerifiedQuestion(7, "A", 142, 140, 145),
    VerifiedQuestion(8, "C", 139, 137, 138),
    VerifiedQuestion(9, "B", 136, 134, 135),
    VerifiedQuestion(10, "C", 133, 131, 132),
    VerifiedQuestion(11, "D", 130, 129),
    VerifiedQuestion(12, "C", 128, 126, 127),
    VerifiedQuestion(14, "A", 122, 120, 121),
    VerifiedQuestion(15, "B", 119, 117, 118),
    VerifiedQuestion(16, "E", 116, 113, 154),
    VerifiedQuestion(17, "A", 112, 110, 111),
    VerifiedQuestion(20, "C", 103, 101, 102),
    VerifiedQuestion(21, "D", 100, 99, choice_labels=("シリカ", "酸化鉄", "ジルコニア", "カーボランダム", "タングステンカーバイド")),
    VerifiedQuestion(22, "D", 98, 96, 97),
    VerifiedQuestion(23, "A", 95, 93),
    VerifiedQuestion(28, "C", 79, 77, 78),
    VerifiedQuestion(29, "E", 76, 74, 75),
    VerifiedQuestion(30, "C", 73, 70, 72),
    VerifiedQuestion(31, "A", 69, 67, 68),
    VerifiedQuestion(33, "C", 63, 61, 62),
    VerifiedQuestion(34, "B", 60, 58, 59),
    VerifiedQuestion(35, "E", 57, 55, 56),
    VerifiedQuestion(36, "A", 54, 51, 53),
    VerifiedQuestion(37, "A", 50, 48, 49),
    VerifiedQuestion(38, "E", 47, 44, 45),
    VerifiedQuestion(39, "A", 43, 155, 42),
    VerifiedQuestion(40, "B", 40, 41, 42),
    VerifiedQuestion(41, "E", 38, 35, 36),
    VerifiedQuestion(42, "C", 34, 32, 33),
    VerifiedQuestion(45, "E", 25, 26, 27),
    VerifiedQuestion(46, "C", 24, 15),
    VerifiedQuestion(47, "B", 23, 157),
    VerifiedQuestion(49, "E", 17, 19, 18),
    VerifiedQuestion(50, "B", 16, 9, 10),
    VerifiedQuestion(51, "B", 11, 13, 8),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def page_image(document: fitz.Document, page_number: int) -> Image.Image:
    pixmap = document[page_number - 1].get_pixmap(
        matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False
    )
    return Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)


def content_crop(image: Image.Image) -> Image.Image:
    width, height = image.size
    return image.crop((int(width * 0.07), int(height * 0.13), int(width * 0.99), int(height * 0.94)))


def neutral_choice_crop(image: Image.Image) -> Image.Image:
    """Keep option text from an ungraded Forms screen without radio controls."""
    width, height = image.size
    crop = image.crop((int(width * 0.19), int(height * 0.24), int(width * 0.67), int(height * 0.79)))
    return ImageOps.autocontrast(ImageOps.grayscale(crop)).convert("RGB")


def question_composite(question: Image.Image, choices: Image.Image | None) -> Image.Image:
    top = content_crop(question)
    if choices is None:
        return top
    options = neutral_choice_crop(choices)
    canvas = Image.new("RGB", (top.width, top.height + options.height + 24), "white")
    canvas.paste(top, (0, 0))
    canvas.paste(options, ((top.width - options.width) // 2, top.height + 12))
    return canvas


def save_webp(image: Image.Image, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target, "WEBP", quality=88, method=6)


def import_source(source: Path, output: Path) -> dict:
    actual_sha = sha256(source)
    if actual_sha != SOURCE_SHA256:
        raise ValueError(f"source SHA-256 changed: {actual_sha}")
    covered = [item.number for item in VERIFIED] + UNVERIFIED
    if len(VERIFIED) != 38 or sorted(covered) != list(range(3, 53)):
        raise ValueError("verified and unresolved Forms question numbers must partition 3..52")

    document = fitz.open(source)
    if document.page_count != 157:
        raise ValueError(f"source has {document.page_count} pages, expected 157")

    items = []
    for ordinal, item in enumerate(VERIFIED, 1):
        source_id = f"FORM-{item.number:03d}"
        question_path = output / "questions" / f"{source_id.lower()}.webp"
        answer_path = output / "answers" / f"{source_id.lower()}.webp"
        question_page = page_image(document, item.question_page)
        answer_page = page_image(document, item.answer_page)
        choice_page = page_image(document, item.choice_page) if item.choice_page else None
        save_webp(question_composite(question_page, choice_page), question_path)
        save_webp(content_crop(answer_page), answer_path)
        items.append({
            "uid": f"DENTAL-MATERIALS-{item.number:03d}",
            "sourceId": source_id,
            "number": ordinal,
            "formQuestionNumber": item.number,
            "group": "2024 Forms",
            "answer": item.answer,
            "choices": "ABCDE",
            "questionImage": question_path.as_posix(),
            "explanationImage": answer_path.as_posix(),
            "sourcePages": {"question": item.question_page, "answer": item.answer_page},
        })
        if item.choice_labels:
            items[-1]["choiceLabels"] = dict(zip("ABCDE", item.choice_labels))

    manifest = {
        "schemaVersion": 1,
        "source": "学校配布 歯科理工 Forms 50問（2024版）",
        "sourceFileSha256": actual_sha,
        "sourceQuestionCount": 50,
        "count": len(items),
        "items": items,
        "unresolved": [
            {"formQuestionNumber": number, "reason": "supplied PDF does not show a submitted correct-result screen"}
            for number in UNVERIFIED
        ],
    }
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("dictionary-assets/dental-materials"))
    args = parser.parse_args()
    manifest = import_source(args.source, args.output)
    print(f"Imported {manifest['count']} verified questions; {len(manifest['unresolved'])} remain unresolved.")


if __name__ == "__main__":
    main()

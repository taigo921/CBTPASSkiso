#!/usr/bin/env python3
"""Render selected ANSWER PDF pages and OCR them with macOS Vision.

The PDF page numbers are zero-based indexes. Existing OCR text files are left
untouched so an interrupted run can resume safely.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

import pypdfium2 as pdfium


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--start", type=int, required=True, help="first PDF index")
    parser.add_argument("--end", type=int, required=True, help="last PDF index")
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--scale", type=float, default=2.2)
    parser.add_argument(
        "--ocr-source",
        type=Path,
        default=Path(__file__).with_name("answer_vision_ocr.m"),
    )
    parser.add_argument(
        "--ocr-binary", type=Path, default=Path("/private/tmp/answer_vision_ocr")
    )
    parser.add_argument("--keep-images", action="store_true")
    return parser.parse_args()


def build_ocr(source: Path, binary: Path) -> None:
    binary.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "clang",
            "-fobjc-arc",
            "-framework",
            "Foundation",
            "-framework",
            "AppKit",
            "-framework",
            "Vision",
            str(source),
            "-o",
            str(binary),
        ],
        check=True,
    )


def main() -> int:
    args = parse_args()
    if args.start < 0 or args.end < args.start:
        raise SystemExit("invalid page range")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    image_dir = args.output_dir.parent / "pages"
    image_dir.mkdir(parents=True, exist_ok=True)

    build_ocr(args.ocr_source, args.ocr_binary)
    document = pdfium.PdfDocument(str(args.pdf))
    if args.end >= len(document):
        raise SystemExit(f"PDF has {len(document)} pages; index {args.end} is out of range")

    for index in range(args.start, args.end + 1):
        text_path = args.output_dir / f"p{index}.txt"
        if text_path.exists():
            print(f"skip p{index}: {text_path} exists", file=sys.stderr)
            continue
        image_path = image_dir / f"p{index}.png"
        page = document[index]
        page.render(scale=args.scale).to_pil().save(image_path, format="PNG")
        result = subprocess.run(
            [str(args.ocr_binary), str(image_path)],
            check=True,
            stdout=subprocess.PIPE,
        )
        text_path.write_bytes(result.stdout)
        print(f"wrote {text_path}", file=sys.stderr)
        if not args.keep_images:
            image_path.unlink()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

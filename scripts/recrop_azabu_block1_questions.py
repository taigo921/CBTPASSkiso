#!/usr/bin/env python3
"""Rebuild Azabu mock block 1 question-only crops from tracked source pages.

The answer/explanation book places the official answer immediately below each
question.  These reviewed boundaries stop at the separator above that answer
area, so the practice screen cannot reveal the answer before submission.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

from PIL import Image


# question: (source page, top, bottom), in pixels on the tracked 901 px pages.
BLOCK1_CROPS = {
    7: (8, 66, 255),
    8: (8, 574, 1014),
    9: (9, 69, 277),
    10: (10, 62, 710),
    11: (11, 65, 528),
    12: (11, 733, 919),
    13: (12, 61, 249),
    14: (12, 522, 940),
    15: (13, 66, 274),
    16: (13, 596, 804),
    17: (14, 63, 250),
    18: (14, 615, 848),
    19: (15, 65, 273),
    20: (15, 456, 642),
    21: (15, 870, 1078),
    22: (16, 63, 250),
    23: (16, 684, 1030),
    24: (17, 67, 253),
    25: (17, 504, 713),
    26: (17, 850, 1034),
    27: (18, 67, 392),
    28: (18, 596, 829),
    29: (19, 69, 278),
    30: (19, 668, 1014),
    31: (20, 66, 483),
    32: (20, 641, 828),
    33: (21, 68, 529),
    34: (21, 666, 921),
    35: (22, 64, 303),
    36: (22, 576, 787),
    37: (23, 68, 255),
    38: (23, 553, 809),
    39: (24, 65, 254),
    40: (24, 457, 644),
    41: (25, 68, 252),
    42: (25, 574, 851),
    43: (26, 62, 250),
    44: (26, 431, 710),
    45: (27, 66, 299),
    46: (27, 481, 667),
    47: (28, 62, 365),
    48: (28, 707, 916),
    49: (29, 67, 276),
    50: (29, 527, 714),
    51: (30, 64, 297),
    52: (30, 617, 895),
    53: (31, 68, 255),
    54: (31, 552, 739),
    55: (32, 66, 253),
    56: (32, 411, 988),
    57: (33, 68, 255),
    58: (33, 437, 762),
    59: (34, 65, 298),
    60: (34, 457, 666),
}


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--output", type=Path, help="preview destination; defaults to the tracked block1 directory")
    args = parser.parse_args()

    source_dir = args.root / "mock-assets/azabu-2026/block1/pages"
    tracked_dir = args.root / "mock-assets/azabu-2026/block1"
    output_dir = args.output or tracked_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    records = []
    for number, (page_number, top, bottom) in BLOCK1_CROPS.items():
        source = source_dir / f"page-{page_number:03}.jpg"
        with Image.open(source) as page:
            if not (885 <= page.width <= 910) or not (0 <= top < bottom <= page.height):
                raise ValueError(f"unexpected source geometry for question {number}: {page.size}, {top}:{bottom}")
            crop = page.crop((0, top, page.width, bottom)).convert("RGB")
            destination = output_dir / f"q{number:03}.jpg"
            crop.save(destination, "JPEG", quality=94, subsampling=0, optimize=True)
        records.append({
            "question": number,
            "sourcePage": page_number,
            "crop": [0, top, crop.width, bottom],
            "width": crop.width,
            "height": bottom - top,
            "sha256": sha256(destination),
        })

    manifest = {
        "version": 1,
        "purpose": "Question-only crops; official answer and explanation begin below each crop.",
        "count": len(records),
        "questions": records,
    }
    manifest_path = output_dir / "question-crops.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(f"wrote {len(records)} reviewed crops to {output_dir}")


if __name__ == "__main__":
    main()

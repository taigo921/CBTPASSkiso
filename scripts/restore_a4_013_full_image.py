#!/usr/bin/env python3
"""Restore A4-013 from the complete source image already stored in the JSON."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data/1-60.json"


def main() -> None:
    questions = json.loads(DATA.read_text(encoding="utf-8"))
    question = next(item for item in questions if item.get("uid") == "A4-013")
    source = question.get("image")
    if not source:
        raise RuntimeError("A4-013 complete source image is missing")
    question["image_base64"] = source
    question["has_image"] = True
    DATA.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("restored A4-013 complete image")


if __name__ == "__main__":
    main()

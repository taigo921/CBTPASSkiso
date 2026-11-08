#!/usr/bin/env python3
"""Restore the clinical figures found clipped or undersized by visual audit.

The source PDF is intentionally outside the repository.  Every page index and
crop below was checked against the printed question number and wording.  Crop
coordinates are pixels on a 300 dpi render and include only the figure, labels,
legends, and table headings required to answer the question.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
from pathlib import Path

import pypdfium2 as pdfium
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
RENDER_DPI = 300
GAP = 24

# PDF page indexes are zero based.  Multiple crop boxes are stacked vertically
# so dense photographs and cephalometric charts stay legible on narrow screens.
FIGURES = {
    "E1-2-023": {"file": "E1.json", "page": 19, "crops": [(840, 1600, 1940, 2340)]},
    "E1-2-043": {"file": "E1.json", "page": 29, "crops": [(940, 260, 2000, 1040)]},
    "E1-5-008": {"file": "E1.json", "page": 74, "crops": [(840, 1640, 1940, 2380)]},
    "E2-1-021": {"file": "E2.json", "page": 95, "crops": [(1160, 370, 2020, 1060)]},
    "E2-2-014": {"file": "E2.json", "page": 111, "crops": [(1260, 390, 1960, 800)]},
    "E2-4-1-024": {
        "file": "E2.json",
        "page": 132,
        "crops": [(820, 680, 1980, 1540), (920, 1500, 1980, 2440)],
    },
    "E2-4-1-025": {
        "file": "E2.json",
        "page": 133,
        "crops": [(830, 740, 1950, 1690), (820, 1690, 1960, 2750)],
    },
    "E2-4-5-111": {"file": "E2.json", "page": 180, "crops": [(1400, 2120, 2020, 2420)]},
    "E2-4-5-112": {"file": "E2.json", "page": 181, "crops": [(1350, 250, 2020, 670)]},
    "E2-4-10-188": {
        "file": "E2.json",
        "page": 226,
        "crops": [(1415, 320, 1890, 1035), (1130, 1055, 1880, 1520)],
    },
    "E2-4-10-190": {
        "file": "E2.json",
        "page": 228,
        "crops": [(1200, 300, 1940, 1110), (1090, 1110, 1940, 1480)],
    },
    "E3-1-028": {"file": "E3.json", "page": 261, "crops": [(800, 1700, 2020, 2260)]},
    "E3-3-3-080": {"file": "E3.json", "page": 315, "crops": [(650, 740, 1960, 1750)]},
    "E3-3-3-100": {
        "file": "E3.json",
        "page": 326,
        "crops": [(580, 2050, 1235, 2365), (1245, 1885, 1905, 2365)],
    },
    "E3-3-3-112": {"file": "E3.json", "page": 333, "crops": [(830, 350, 2020, 930)]},
    "E3-3-3-116": {"file": "E3.json", "page": 335, "crops": [(1180, 400, 2030, 1270)]},
    "E3-4-1-001": {"file": "E3.json", "page": 338, "crops": [(1200, 330, 1980, 910)]},
    "E3-4-2-083": {"file": "E3.json", "page": 381, "crops": [(1220, 220, 2020, 1110)]},
    "E3-4-2-091": {"file": "E3.json", "page": 385, "crops": [(1190, 370, 2000, 860)]},
    "E4-1-026": {"file": "E4.json", "page": 435, "crops": [(870, 340, 1970, 850)]},
    "E4-1-035": {
        "file": "E4.json",
        "page": 441,
        "crops": [
            (670, 790, 1340, 1240),
            (1350, 790, 2020, 1240),
            (670, 1280, 1340, 1640),
            (850, 1760, 2020, 2740),
        ],
    },
    "E4-1-043": {
        "file": "E4.json",
        "page": 448,
        "crops": [(1330, 320, 1970, 850), (430, 890, 1950, 1260), (750, 1230, 1980, 2260)],
    },
    "E5-2-009": {"file": "E5.json", "page": 511, "crops": [(1260, 1600, 2020, 2140)]},
}


def compose_vertical(page: Image.Image, crops: list[tuple[int, int, int, int]]) -> Image.Image:
    panels = [page.crop(box) for box in crops]
    if len(panels) == 1:
        return panels[0]
    width = max(panel.width for panel in panels)
    height = sum(panel.height for panel in panels) + GAP * (len(panels) - 1)
    output = Image.new("RGB", (width, height), "white")
    y = 0
    for panel in panels:
        output.paste(panel, ((width - panel.width) // 2, y))
        y += panel.height + GAP
    return output


def encode(image: Image.Image) -> tuple[str, bytes]:
    output = io.BytesIO()
    image.save(output, "WEBP", quality=92, method=6)
    payload = output.getvalue()
    uri = "data:image/webp;base64," + base64.b64encode(payload).decode("ascii")
    return uri, payload


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="path to the clinical problem-book PDF")
    parser.add_argument("--apply", action="store_true", help="update data/E1.json through data/E5.json")
    parser.add_argument("--uid", action="append", choices=sorted(FIGURES), help="only regenerate this UID")
    parser.add_argument(
        "--preview-dir",
        type=Path,
        default=Path("/tmp/audit-clinical-figures"),
        help="directory for decoded WebP previews",
    )
    args = parser.parse_args()

    args.preview_dir.mkdir(parents=True, exist_ok=True)
    document = pdfium.PdfDocument(args.source)
    selected = args.uid or list(FIGURES)
    generated: dict[str, str] = {}

    for uid in selected:
        spec = FIGURES[uid]
        page = document[spec["page"]]
        rendered = page.render(scale=RENDER_DPI / 72).to_pil().convert("RGB")
        image = compose_vertical(rendered, spec["crops"])
        uri, payload = encode(image)
        generated[uid] = uri
        preview = args.preview_dir / f"{uid}.webp"
        preview.write_bytes(payload)
        print(
            f"{uid}: page index {spec['page']}, crops {spec['crops']}, "
            f"{image.width}x{image.height}, {len(payload)} bytes -> {preview}"
        )

    if not args.apply:
        return

    by_file: dict[str, dict[str, str]] = {}
    for uid, uri in generated.items():
        by_file.setdefault(FIGURES[uid]["file"], {})[uid] = uri

    for filename, replacements in by_file.items():
        path = ROOT / "data" / filename
        questions = json.loads(path.read_text(encoding="utf-8"))
        questions_by_uid = {question.get("uid"): question for question in questions}
        for uid, uri in replacements.items():
            questions_by_uid[uid]["image_base64"] = uri
        path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

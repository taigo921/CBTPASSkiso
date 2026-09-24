#!/usr/bin/env python3
"""Restore five complete source-PDF figures; no inferred labels or redrawing.

Run without --apply to inspect previews, then --apply to replace image payloads.
Coordinates were reviewed at render scale 2; output is rendered at scale 4.
"""
import argparse
import base64
import io
import json
from pathlib import Path

import pypdfium2 as pdfium

REPO = Path(__file__).resolve().parents[1]
WORKSPACE = REPO.parent
PREVIEW = WORKSPACE / 'tmp/pdfs/sep24-five'
TARGETS = (
    ('C2-078', '175-204.json', '175-204.pdf', 9, (735, 123, 923, 298)),
    ('C3-006', '175-204.json', '175-204.pdf', 18, (610, 149, 910, 428)),
    ('C3-059', 'C3-034-118.json', '205-234.pdf', 11, (576, 769, 927, 1036)),
    ('C3-114', 'C3-034-118.json', '235-264.pdf', 5, (485, 825, 924, 1160)),
    ('C3-159', 'C3-119-204.json', '235-264.pdf', 23, (490, 719, 925, 1138)),
)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    PREVIEW.mkdir(parents=True, exist_ok=True)
    files = {}
    for uid, filename, source, page_index, bounds in TARGETS:
        pdf = pdfium.PdfDocument(WORKSPACE / source)
        page = pdf[page_index].render(scale=4).to_pil().convert('RGB')
        image = page.crop(tuple(value * 2 for value in bounds))
        output = io.BytesIO()
        image.save(output, 'JPEG', quality=95, subsampling=0, optimize=True)
        payload = output.getvalue()
        (PREVIEW / f'{uid}-full.jpg').write_bytes(payload)
        print(f'{uid}: {image.width}x{image.height}, {len(payload)} bytes')
        if args.apply:
            path = REPO / 'data' / filename
            questions = files.setdefault(path, json.loads(path.read_text()))
            matches = [q for q in questions if q.get('uid') == uid]
            assert len(matches) == 1, uid
            matches[0]['image_base64'] = 'data:image/jpeg;base64,' + base64.b64encode(payload).decode('ascii')
    for path, questions in files.items():
        path.write_text(json.dumps(questions, ensure_ascii=False, indent=2) + '\n')

if __name__ == '__main__':
    main()

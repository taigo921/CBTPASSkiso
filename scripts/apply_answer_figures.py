#!/usr/bin/env python3
"""Apply reviewed ANSWER crops, changing only image_base64.

This tool is intentionally separate from regeneration. It must be invoked with
explicit UIDs or a reviewed-list file and is not run by the regeneration job.
"""

from __future__ import annotations

import argparse
import base64
import copy
import json
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IMAGES = Path("/private/tmp/answer-figs")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("uids", nargs="*", help="reviewed UIDs (comma-separated values accepted)")
    parser.add_argument("--reviewed-list", type=Path, help="text file with one UID per line; # comments allowed")
    parser.add_argument("--images-dir", type=Path, default=DEFAULT_IMAGES)
    return parser.parse_args()


def requested_uids(args: argparse.Namespace) -> list[str]:
    result = [item.strip() for value in args.uids for item in value.split(",") if item.strip()]
    if args.reviewed_list:
        for line in args.reviewed_list.read_text(encoding="utf-8").splitlines():
            value = line.split("#", 1)[0].strip()
            if value:
                result.append(value)
    result = list(dict.fromkeys(result))
    if not result:
        raise SystemExit("provide UIDs or --reviewed-list")
    return result


def find_image(directory: Path, uid: str) -> tuple[Path, str]:
    for extension, mime in ((".png", "image/png"), (".jpg", "image/jpeg"), (".jpeg", "image/jpeg")):
        path = directory / f"{uid}{extension}"
        if path.is_file():
            return path, mime
    raise SystemExit(f"reviewed crop not found for {uid} in {directory}")


def without_images(data: Any) -> Any:
    clone = copy.deepcopy(data)
    if isinstance(clone, list):
        for question in clone:
            if isinstance(question, dict) and "image_base64" in question:
                question["image_base64"] = "<image_base64>"
    return clone


def main() -> int:
    args = parse_args()
    uids = requested_uids(args)
    wanted = set(uids)
    files = sorted((ROOT / "data").glob("answer[1-4]-*.json"))
    locations: dict[str, tuple[Path, int]] = {}
    loaded: dict[Path, list[dict[str, Any]]] = {}
    originals: dict[Path, list[dict[str, Any]]] = {}
    for path in files:
        data = json.loads(path.read_text(encoding="utf-8"))
        loaded[path] = data
        originals[path] = copy.deepcopy(data)
        for index, question in enumerate(data):
            uid = question.get("uid")
            if uid in wanted:
                if uid in locations:
                    raise SystemExit(f"duplicate UID: {uid}")
                locations[uid] = (path, index)
    missing = wanted - locations.keys()
    if missing:
        raise SystemExit("UIDs not found: " + ", ".join(sorted(missing)))

    changed_files: set[Path] = set()
    for uid in uids:
        image_path, mime = find_image(args.images_dir, uid)
        payload = base64.b64encode(image_path.read_bytes()).decode("ascii")
        path, index = locations[uid]
        loaded[path][index]["image_base64"] = f"data:{mime};base64,{payload}"
        changed_files.add(path)

    # Prove before writing that the requested image fields are the only semantic
    # difference. The same verification is repeated after reading files back.
    for path in changed_files:
        if without_images(originals[path]) != without_images(loaded[path]):
            raise SystemExit(f"non-image field changed before write: {path}")
        path.write_text(json.dumps(loaded[path], ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        reread = json.loads(path.read_text(encoding="utf-8"))
        if reread != loaded[path] or without_images(originals[path]) != without_images(reread):
            raise SystemExit(f"post-write verification failed: {path}")
    print(f"updated {len(uids)} image_base64 fields in {len(changed_files)} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

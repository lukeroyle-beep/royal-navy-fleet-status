#!/usr/bin/env python3
"""Fetch, optimise and govern the 40 public shore-establishment photographs."""

from __future__ import annotations

import hashlib
import html
import json
import re
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCES_PATH = ROOT / "data" / "internal" / "provenance" / "shore-photo-sources.json"
SHORE_DATA_PATH = ROOT / "data" / "royal-navy" / "shore-establishments.json"
SHORE_PROVENANCE_PATH = ROOT / "data" / "internal" / "provenance" / "shore-establishments.json"
PHOTO_DIR = ROOT / "public" / "shore" / "photos"
USER_AGENT = "RoyalNavyStatusPhotoAudit/1.0 (local public-source image preparation)"
COMMONS_API = "https://commons.wikimedia.org/w/api.php"


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def clean_html(value: str | None) -> str:
    if not value:
        return ""
    text = re.sub(r"<[^>]+>", " ", html.unescape(value))
    return re.sub(r"\s+", " ", text).strip()


def normalise_https(value: str) -> str:
    if value.startswith("//"):
        return "https:" + value
    if value.lower().startswith("http://nationalarchives.gov.uk/"):
        return "https://www.nationalarchives.gov.uk/" + value.split("/", 3)[3]
    if value.startswith("http://"):
        return "https://" + value.removeprefix("http://")
    return value


def commons_metadata(titles: list[str]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for start in range(0, len(titles), 20):
        batch = titles[start : start + 20]
        query = urllib.parse.urlencode(
            {
                "action": "query",
                "titles": "|".join(batch),
                "prop": "imageinfo",
                "iiprop": "url|size|extmetadata",
                "iiurlwidth": "390",
                "format": "json",
                "formatversion": "2",
            }
        )
        request = urllib.request.Request(f"{COMMONS_API}?{query}", headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.load(response)
        for page in payload.get("query", {}).get("pages", []):
            if page.get("missing") or not page.get("imageinfo"):
                raise RuntimeError(f"Commons title was not found: {page.get('title')}")
            info = page["imageinfo"][0]
            meta = info.get("extmetadata", {})
            title = page["title"]
            file_name = title.removeprefix("File:")
            result[title] = {
                "sourcePageUrl": info["descriptionurl"],
                "originalImageUrl": info["url"],
                "downloadUrl": info.get("thumburl") or info["url"],
                "sourceWidth": info["width"],
                "sourceHeight": info["height"],
                "creator": clean_html(meta.get("Artist", {}).get("value")) or "Contributor named on source page",
                "credit": clean_html(meta.get("Credit", {}).get("value"))
                or clean_html(meta.get("Artist", {}).get("value"))
                or "See source page",
                "license": clean_html(meta.get("LicenseShortName", {}).get("value")) or "See source page",
                "licenseUrl": normalise_https(
                    meta.get("LicenseUrl", {}).get("value") or info["descriptionurl"]
                ),
            }
    return result


def download(url: str, destination: Path, referer: str) -> None:
    subprocess.run(
        [
            "curl.exe",
            "-L",
            "--fail",
            "--silent",
            "--show-error",
            "--retry",
            "2",
            "--retry-delay",
            "8",
            "--retry-max-time",
            "30",
            "-A",
            USER_AGENT,
            "-e",
            referer,
            url,
            "-o",
            str(destination),
        ],
        check=True,
    )
    if not destination.exists() or destination.stat().st_size == 0:
        raise RuntimeError(f"Image download did not produce a file: {url}")


def optimise(source: Path, destination: Path, max_width: int, max_height: int, quality: int) -> tuple[int, int]:
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        image.thumbnail((max_width, max_height), Image.Resampling.LANCZOS, reducing_gap=3.0)
        width, height = image.size
        image.save(destination, "WEBP", quality=quality, method=6, optimize=True)
    return width, height


def main() -> None:
    sources = read_json(SOURCES_PATH)
    shore_data = read_json(SHORE_DATA_PATH)
    shore_provenance = read_json(SHORE_PROVENANCE_PATH)
    photos = sources["photos"]
    records = shore_data["establishments"]

    if len(photos) != 40 or len(records) != 40:
        raise RuntimeError(f"Expected 40 photo selections and 40 shore records, got {len(photos)} and {len(records)}")
    record_ids = {record["id"] for record in records}
    photo_ids = {photo["establishmentId"] for photo in photos}
    if len(photo_ids) != 40 or photo_ids != record_ids:
        raise RuntimeError("Photo selections must map one-to-one to the 40 shore-establishment records")

    commons_titles = [photo["commonsTitle"] for photo in photos if photo.get("commonsTitle")]
    metadata_by_title = commons_metadata(commons_titles)
    normalised_metadata = {key.casefold(): value for key, value in metadata_by_title.items()}

    processing = sources["processing"]
    PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    work_dir = ROOT / ".shore-photo-work"
    work_dir.mkdir(exist_ok=True)
    enriched: list[dict] = []
    failures: list[str] = []

    try:
        ordered_photos = sorted(photos, key=lambda photo: bool(photo.get("commonsTitle")))
        for index, photo in enumerate(ordered_photos, start=1):
            entry = dict(photo)
            if photo.get("commonsTitle"):
                meta = normalised_metadata.get(photo["commonsTitle"].casefold())
                if not meta:
                    raise RuntimeError(f"Commons returned no metadata for {photo['commonsTitle']}")
                entry.update(meta)

            source_file = work_dir / f"{entry['establishmentId']}.source"
            output_relative = f"public/shore/photos/{entry['establishmentId']}.webp"
            output_path = ROOT / output_relative
            print(f"[{index:02d}/40] {entry['establishmentId']}")
            if output_path.exists():
                with Image.open(output_path) as existing:
                    if existing.format != "WEBP":
                        raise RuntimeError(f"Cached output is not WebP: {output_path}")
                    width, height = existing.size
            else:
                try:
                    download(entry["downloadUrl"], source_file, entry["sourcePageUrl"])
                    if "wikimedia.org" in entry["downloadUrl"]:
                        time.sleep(2.0)
                    width, height = optimise(
                        source_file,
                        output_path,
                        int(processing["maxWidth"]),
                        int(processing["maxHeight"]),
                        int(processing["quality"]),
                    )
                except Exception as error:
                    failures.append(f"{entry['establishmentId']}: {error}")
                    print(f"  deferred: {error}", file=sys.stderr)
                    continue
            payload = output_path.read_bytes()
            entry["assetPath"] = output_relative
            entry["retrievedAt"] = sources["retrievedAt"]
            entry["outputWidth"] = width
            entry["outputHeight"] = height
            entry["outputBytes"] = len(payload)
            entry["sha256"] = hashlib.sha256(payload).hexdigest()
            enriched.append(entry)
        if failures:
            raise RuntimeError("Deferred photo downloads: " + "; ".join(failures))
    finally:
        if work_dir.exists():
            for child in work_dir.iterdir():
                child.unlink()
            work_dir.rmdir()

    by_id = {entry["establishmentId"]: entry for entry in enriched}
    for record in records:
        photo = by_id[record["id"]]
        record["image"] = f"./shore/photos/{record['id']}.webp"
        record["imageAlt"] = photo["alt"]
        record["imageFocalPoint"] = photo["focalPoint"]
        record["imageCredit"] = {
            "label": photo["creator"],
            "sourceUrl": photo["sourcePageUrl"],
            "license": photo["license"],
            "licenseUrl": photo["licenseUrl"],
        }

    sources["photos"] = enriched
    shore_provenance["imageAssets"] = [
        {
            "establishmentId": photo["establishmentId"],
            "assetPath": photo["assetPath"],
            "sourcePageUrl": photo["sourcePageUrl"],
            "creator": photo["creator"],
            "credit": photo["credit"],
            "license": photo["license"],
            "licenseUrl": photo["licenseUrl"],
            "retrievedAt": photo["retrievedAt"],
            "matchRationale": photo["matchRationale"],
            "alt": photo["alt"],
            "focalPoint": photo["focalPoint"],
            "outputWidth": photo["outputWidth"],
            "outputHeight": photo["outputHeight"],
            "outputBytes": photo["outputBytes"],
            "sha256": photo["sha256"],
        }
        for photo in enriched
    ]

    write_json(SOURCES_PATH, sources)
    write_json(SHORE_DATA_PATH, shore_data)
    write_json(SHORE_PROVENANCE_PATH, shore_provenance)
    total_bytes = sum(photo["outputBytes"] for photo in enriched)
    print(f"Prepared {len(enriched)} unique photographs ({total_bytes / 1024 / 1024:.2f} MiB total).")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"shore photo preparation failed: {error}", file=sys.stderr)
        raise

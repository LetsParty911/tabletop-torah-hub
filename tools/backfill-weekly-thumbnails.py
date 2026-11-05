"""Run offline in the authorized sandbox, never in the website runtime.

Defaults to dry-run. Input is a fresh live-DOM measurement JSON, not fixed IDs.
Storage API only: create immutable derivatives; never update/delete originals.
"""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import requests
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument("measurement")
parser.add_argument("--apply", action="store_true")
args = parser.parse_args()
measurement = json.loads(Path(args.measurement).read_text())
rows = measurement["measurements"]
assert len(rows) <= 22, "Current-week backfill is capped at 22"
url = os.environ.get("EXT_SUPABASE_URL")
key = os.environ.get("EXT_SUPABASE_SERVICE_ROLE_KEY")
if not url or not key:
    raise SystemExit("External admin credentials unavailable; no writes")
headers = {"apikey": key, "Authorization": "Bearer " + key}
session = requests.Session()
session.headers.update(headers)

def inventory(bucket):
    found = []
    folders = [""]
    while folders:
        prefix = folders.pop()
        offset = 0
        while True:
            response = session.post(url + "/storage/v1/object/list/" + bucket,
                json={"prefix": prefix, "offset": offset, "limit": 1000}, timeout=20)
            response.raise_for_status()
            page = response.json()
            for item in page:
                if item.get("id") is None:
                    folders.append((prefix + "/" if prefix else "") + item["name"])
                else:
                    found.append(item)
            if len(page) < 1000:
                break
            offset += 1000
    return found

buckets_response = session.get(url + "/storage/v1/bucket", timeout=20)
buckets_response.raise_for_status()
buckets = buckets_response.json()
usage = 0
thumbs = {}
for bucket in buckets:
    objects = inventory(bucket["id"])
    usage += sum((o.get("metadata") or {}).get("size", 0) for o in objects)
    if bucket["id"] == "pdf-thumbs":
        thumbs = {o["name"]: o for o in objects}
plans = []
for row in rows:
    id = row["id"]
    original = session.get(url + "/storage/v1/object/pdf-thumbs/" + id + ".png", timeout=20)
    original.raise_for_status()
    data = original.content
    version = hashlib.md5(data).hexdigest()
    assert version == row["etag"], "Original changed since live measurement; stop and remeasure"
    image = Image.open(io.BytesIO(data)).convert("RGB")
    image.thumbnail((160, 210), Image.Resampling.LANCZOS)
    encoded = io.BytesIO()
    image.save(encoded, format="WEBP", quality=86, method=6)
    payload = encoded.getvalue()
    assert 0 < len(payload) <= 24576 and len(payload) < len(data), "Size budget exceeded; retain PNG"
    path = id + "." + version + ".small.webp"
    plans.append((path, payload, path in thumbs))
added = sum(len(data) for _, data, exists in plans if not exists)
# Conservative safety reserve below the documented 1 GB free allowance.
assert usage + added < 900_000_000, "Free storage headroom uncertain; no writes"
print(json.dumps({"mode": "apply" if args.apply else "dry-run", "storageBytes": usage,
    "newBytes": added, "newObjects": sum(not exists for _, _, exists in plans)}))
for path, data, exists in plans:
    if exists:
        response = session.get(url + "/storage/v1/object/pdf-thumbs/" + path, timeout=20)
        response.raise_for_status()
        assert response.content == data, "Existing derivative differs; never overwrite"
    elif args.apply:
        response = session.post(url + "/storage/v1/object/pdf-thumbs/" + path, data=data,
            headers={"Content-Type": "image/webp", "Cache-Control": "max-age=31536000", "x-upsert": "false"}, timeout=20)
        response.raise_for_status()
    if args.apply or exists:
        # Public readability and exact byte verification, without credentials.
        verified = requests.get(url + "/storage/v1/object/public/pdf-thumbs/" + path, timeout=20)
        verified.raise_for_status()
        assert verified.content == data, "Public derivative bytes do not match"
    print(json.dumps({"path": path, "bytes": len(data), "existing": exists, "verified": args.apply or exists}))
#!/usr/bin/env python3
"""
Reference checker for the AECS-1 conformance fixtures (specs/conformance/fixtures/*.json).

This is NOT the SDK implementation — it's an independent, minimal implementation of
AECS-1 §5 (threading) and §6 (timestamps) used only to confirm the fixtures' "expected"
values are internally consistent with the spec's own algorithm. Run it whenever a
fixture is added or changed:

    python3 specs/conformance/verify.py
"""

import glob
import hashlib
import json
import sys
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional
import unicodedata


def strip_id(raw: str) -> str:
    value = raw.strip()
    if value.startswith("<") and value.endswith(">"):
        value = value[1:-1].strip()
    return value


def valid_message_id(raw) -> Optional[str]:
    if not raw:
        return None
    value = strip_id(raw)
    if value.count("@") != 1:
        return None
    left, right = value.split("@", 1)
    if not left or not right:
        return None
    return value


def thread_id(msg: dict) -> str:
    refs = msg["references"]
    for ref in refs:
        value = valid_message_id(ref)
        if value:
            return value
    value = valid_message_id(msg["inReplyTo"])
    if value:
        return value
    value = valid_message_id(msg["messageId"])
    if value:
        return value
    subject = unicodedata.normalize("NFC", (msg["subject"] or "").strip().lower())
    from_email = unicodedata.normalize("NFC", msg["from"] or "")
    date = unicodedata.normalize("NFC", metadata_date(msg["date"]) or "")
    basis = f"{from_email}:{subject}:{date}"
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def metadata_date(date):
    if not date:
        return None
    try:
        if "T" in date:
            parsed = datetime.fromisoformat(date.replace("Z", "+00:00"))
        else:
            parsed = parsedate_to_datetime(date)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except (TypeError, ValueError):
        return None


def metadata_timestamp(date):
    normalized = metadata_date(date)
    if not normalized:
        return None
    return int(datetime.fromisoformat(normalized.replace("Z", "+00:00")).timestamp())


def main() -> int:
    fixtures = sorted(glob.glob(f"{__file__.rsplit('/', 1)[0]}/fixtures/*.json"))
    failures = 0

    for path in fixtures:
        fixture = json.load(open(path))
        name = path.rsplit("/", 1)[-1]
        got_thread_id = thread_id(fixture["input"])
        got_timestamp = metadata_timestamp(fixture["input"]["date"])
        want = fixture["expected"]

        ok = got_thread_id == want["threadId"] and got_timestamp == want["metadataTimestamp"]
        status = "ok" if ok else "FAIL"
        print(f"[{status}] {name}")
        if not ok:
            failures += 1
            print(f"         threadId:  got={got_thread_id!r} want={want['threadId']!r}")
            print(f"         timestamp: got={got_timestamp!r} want={want['metadataTimestamp']!r}")

    print(f"\n{len(fixtures) - failures}/{len(fixtures)} fixtures verified")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

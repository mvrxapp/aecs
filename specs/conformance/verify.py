#!/usr/bin/env python3
"""
Reference checker for the AECS-1 conformance fixtures (specs/conformance/fixtures/*.json).

This is NOT the SDK implementation — it's an independent, minimal implementation of
AECS-1 §5 (threading) and §6 (timestamps) used only to confirm the fixtures' "expected"
values are internally consistent with the spec's own algorithm. It also checks the
content-preservation fixtures (specs/conformance/content/*.json) against the line rules
in AECS-1 §4.3.1: every line a fixture requires to be kept must be one the spec forbids
removing, and every line it requires to be removed must be one the spec allows removing. Run it whenever a
fixture is added or changed:

    python3 specs/conformance/verify.py
"""

import glob
import hashlib
import json
import re
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


# --- AECS-1 §4.3.1 line rules (content-preservation fixtures) ---------------------

def is_attribution(lines, i):
    line = lines[i].strip()
    if re.match(r"^On\b.+wrote:$", line, re.I):
        return True
    if not re.match(r"^On\b.+", line, re.I) or i + 1 >= len(lines):
        return False
    nxt = lines[i + 1].strip()
    after = lines[i + 2].strip() if i + 2 < len(lines) else ""
    return bool(re.search(r"wrote:$", nxt, re.I)) and len(nxt) <= 80 and (after == "" or after.startswith(">"))


def is_header_block(lines, i):
    if i < 0 or i >= len(lines) or not re.match(r"^From:\s+\S+", lines[i].strip(), re.I):
        return False
    window = [l.strip() for l in lines[i + 1:i + 6] if l.strip()]
    return any(re.match(r"^(Sent|Date|To|Subject):\s+", l, re.I) for l in window)


def is_forward_marker(lines, i):
    """True when the previous non-empty line marks a forward, so the header block is forwarded content."""
    prev = next((lines[j].strip() for j in range(i - 1, -1, -1) if lines[j].strip()), "")
    return bool(re.match(r"^[-_]{2,}\s*Forwarded message\s*[-_]{2,}$", prev, re.I) or re.match(r"^Begin forwarded message:$", prev, re.I))


def history_start(lines):
    for i, raw in enumerate(lines):
        line = raw.strip()
        if re.match(r"^-{2,}\s*Original Message\s*-{2,}$", line, re.I):
            return i
        if re.match(r"^_{5,}$", line):
            nxt = next((j for j in range(i + 1, len(lines)) if lines[j].strip()), -1)
            if is_header_block(lines, nxt):
                return i
        elif is_header_block(lines, i) and not is_forward_marker(lines, i):
            return i
    return len(lines)


def classify(lines):
    """Return (kind per line, index where unprefixed history starts)."""
    end = history_start(lines)
    kinds = []
    for i, raw in enumerate(lines):
        line = raw.strip()
        if i >= end:
            kinds.append("history")
        elif not line:
            kinds.append("blank")
        elif line.startswith(">"):
            kinds.append("quoted")
        elif is_attribution(lines, i) or (i > 0 and re.search(r"wrote:$", line, re.I) and is_attribution(lines, i - 1)):
            kinds.append("attribution")
        else:
            kinds.append("authored")
    return kinds


def check_content_fixture(fixture):
    """Return a list of problems; empty means the fixture agrees with §4.3.1."""
    lines = fixture["input"]["text"].split("\n")
    kinds = classify(lines)
    authored = [i for i, k in enumerate(kinds) if k == "authored"]
    last_authored = authored[-1] if authored else -1
    problems = []

    def owning_lines(snippet):
        return [i for i, l in enumerate(lines) if snippet in l]

    for snippet in fixture["expected"].get("mustContain", []):
        idx = owning_lines(snippet)
        if not idx:
            problems.append(f"mustContain not in input: {snippet!r}")
        elif authored and not any(kinds[i] == "authored" for i in idx):
            problems.append(f"mustContain is not an authored line, so §4.3.1 allows removing it: {snippet!r}")
    for snippet in fixture["expected"].get("mustNotContain", []):
        idx = owning_lines(snippet)
        if not idx:
            problems.append(f"mustNotContain not in input: {snippet!r}")
        for i in idx:
            removable = kinds[i] in ("history", "attribution") or (kinds[i] == "quoted" and i > last_authored)
            if not removable:
                problems.append(f"mustNotContain is a line §4.3.1 requires keeping: {snippet!r}")
    return problems


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

    content = sorted(glob.glob(f"{__file__.rsplit('/', 1)[0]}/content/*.json"))
    content_failures = 0
    for path in content:
        name = path.rsplit("/", 1)[-1]
        problems = check_content_fixture(json.load(open(path)))
        print(f"[{'FAIL' if problems else 'ok'}] content/{name}")
        for problem in problems:
            print(f"         {problem}")
        content_failures += bool(problems)

    print(f"\n{len(content) - content_failures}/{len(content)} content fixtures verified")
    return 1 if failures or content_failures else 0


if __name__ == "__main__":
    sys.exit(main())

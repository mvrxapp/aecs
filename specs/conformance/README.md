# AECS-1 Conformance Fixtures

AECS-1 §5 makes a hard determinism claim: `threadId` "must be identical for all
messages in the same conversation, across implementations." A claim like that is only
useful if implementations can check themselves against it — so this directory is a
small, versioned set of test vectors covering the threading algorithm (§5) and the
timestamp rules (§6), independent of any particular implementation or programming
language.

This mirrors how other structural specs (CommonMark, JSON:API, JSON Schema) ship
fixture suites alongside prose: the prose says what MUST happen, the fixtures say
exactly what that means for concrete input.

## Format

Each file in `fixtures/*.json` has the shape:

```json
{
  "description": "human-readable summary of what this fixture exercises",
  "specSection": "AECS-1 §5.1",
  "input": {
    "messageId": "string | null — Message-ID header, angle brackets stripped",
    "inReplyTo": "string | null — In-Reply-To header, angle brackets stripped",
    "references": ["string, ...", "— References header, in order, angle brackets stripped"],
    "from": "string | null — From header, email address only",
    "subject": "string | null — Subject header, as received",
    "date": "string | null — Date header, RFC 5322 or ISO 8601"
  },
  "expected": {
    "threadId": "string",
    "metadataDate": "string | null — ISO 8601 UTC, or null if Date was absent/unparseable",
    "metadataTimestamp": "number | null — Unix epoch seconds, or null"
  }
}
```

`input` is deliberately the already-decoded header values (not raw RFC 5322 bytes) —
these fixtures test the threading/timestamp algorithm in AECS-1 §5–§6, not MIME
parsing, which AECS-1 does not specify byte-for-byte.

## Running against an implementation

[`verify.py`](./verify.py) is an independent reference implementation of §5/§6 (not the
SDK — a second, from-scratch implementation) that checks each fixture's `expected`
values are internally consistent with the spec's own algorithm. Run it whenever a fixture
is added or changed:

`@mvrx/mail` also runs every fixture in `packages/mail/test/core.test.mjs` via
`pnpm --filter @mvrx/mail test`. Both checkers are CI-gated.

```bash
python3 specs/conformance/verify.py
```

This is CI-gated (`.github/workflows/ci.yml`) so a fixture with a typo'd expected value
can't merge.

## Fixtures

| File | Covers |
|---|---|
| [`references-present.json`](./fixtures/references-present.json) | §5 rule 1 — `References` present, multiple IDs |
| [`in-reply-to-only.json`](./fixtures/in-reply-to-only.json) | §5 rule 2 — no `References`, `In-Reply-To` present |
| [`root-message.json`](./fixtures/root-message.json) | §5 rule 3 — neither header present, own `Message-ID` used |
| [`fallback-hash.json`](./fixtures/fallback-hash.json) | §5 rule 4 — no valid `Message-ID` anywhere, SHA-256 fallback |
| [`fallback-hash-missing-date.json`](./fixtures/fallback-hash-missing-date.json) | §5 rule 4 + §5.4 — fallback hash when `Date` is absent (empty date component) |
| [`invalid-reference-skipped.json`](./fixtures/invalid-reference-skipped.json) | §5 rule 1 — invalid `References` entries skipped until first valid ID |
| [`angle-brackets-and-whitespace.json`](./fixtures/angle-brackets-and-whitespace.json) | §5 requirement — angle brackets stripped, whitespace trimmed before comparison |
| [`missing-date.json`](./fixtures/missing-date.json) | §6 — absent/unparseable `Date` header → `metadata.date`/`metadata.timestamp` are `null` |

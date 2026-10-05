# AECS-1 Conformance Fixtures

AECS-1 §5 makes a hard determinism claim: `threadId` "must be identical for all
messages in the same conversation, across implementations." A claim like that is only
useful if implementations can check themselves against it — so this directory is a
small, versioned set of test vectors covering the threading algorithm (§5), the
timestamp rules (§6) and, since AECS-1 1.1.0, the content-preservation rules (§4.3.1),
independent of any particular implementation or programming language.

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

## Content-preservation fixtures

Each file in `content/*.json` tests AECS-1 §4.3.1: cleanup may remove quoted history and
signatures, but never the sender's own (authored) lines.

```json
{
  "description": "human-readable summary of what this fixture exercises",
  "specSection": "AECS-1 §4.3.1",
  "input": { "text": "decoded plain-text body, lines separated by \n" },
  "expected": {
    "nonEmpty": true,
    "mustContain": ["substrings content.clean and content.forAI MUST keep"],
    "mustNotContain": ["substrings content.clean and content.forAI MUST drop"]
  }
}
```

The expectations are substring checks, not exact output, so implementations can use
their own heuristics and formatting as long as they keep and drop the listed lines.
`verify.py` checks each fixture against the §4.3.1 line kinds: every `mustContain` line
must be an authored line (or, when the body has none, any line, per the empty-result
fallback), and every `mustNotContain` line must be one the spec allows removing.

| File | Covers |
|---|---|
| [`inline-reply.json`](./content/inline-reply.json) | Rule 1 — answers between quoted questions are kept |
| [`bottom-post.json`](./content/bottom-post.json) | Rule 1 — answer below attribution and quote is kept |
| [`leading-quote.json`](./content/leading-quote.json) | Rules 1 and 6 — body opens with a quote; the answer is kept and the result is not empty |
| [`top-post-gmail.json`](./content/top-post-gmail.json) | Rule 2 — trailing attribution and quote are removed |
| [`wrapped-attribution.json`](./content/wrapped-attribution.json) | Rule 2 — attribution wrapped onto two lines is removed |
| [`outlook-history.json`](./content/outlook-history.json) | Rule 2 — unprefixed history from a `From:`/`Sent:` header block is removed |
| [`outlook-web-divider.json`](./content/outlook-web-divider.json) | Rule 2 — underscore divider directly above a header block starts history |
| [`newsletter-divider.json`](./content/newsletter-divider.json) | Rule 4 — a divider on its own is not a quote boundary |
| [`forwarded-message.json`](./content/forwarded-message.json) | Rule 1 — a header block under a forwarded-message marker is forwarded content, not history |
| [`all-quoted.json`](./content/all-quoted.json) | Rule 6 — an all-quoted body falls back to `text` |
| [`signature-lookalike.json`](./content/signature-lookalike.json) | Rule 5 — a signature marker followed by long authored text is a lookalike |

## Running against an implementation

[`verify.py`](./verify.py) is an independent reference implementation of §5/§6 (not the
SDK — a second, from-scratch implementation) that checks each fixture's `expected`
values are internally consistent with the spec's own algorithm. Run it whenever a fixture
is added or changed:

`@mvrx/aecs` also runs every fixture: `test/core.test.mjs` for `fixtures/` and
`test/content.test.mjs` for `content/`, via `pnpm test`. Both checkers are CI-gated.

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

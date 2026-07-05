---
title: "6. Timestamps"
---


- All timestamps in `NormalizedEmail` MUST be in UTC.
- `metadata.date` MUST be ISO 8601 with explicit UTC offset (`Z` or `+00:00`).
- `metadata.timestamp` MUST be Unix epoch seconds derived from `metadata.date` (integer,
  floor of UTC seconds — no fractional component).
- `processing.processedAt` MUST be ISO 8601 UTC.
- If the `Date` header is absent or unparseable, `metadata.date` and `metadata.timestamp`
  MUST be `null`. Implementations MUST NOT substitute processing time, receipt time, or
  any other guessed value.

### 6.1 `Date` Header Parsing

When normalizing from RFC 5322 messages, implementations MUST parse the `Date` header
and produce `metadata.date` in the form `YYYY-MM-DDTHH:MM:SSZ` with **no fractional
seconds**. Implementations MAY also accept values already in ISO 8601 form.

`metadata.timestamp` MUST be the integer Unix epoch second corresponding to that instant
in UTC. Two implementations parsing the same `Date` header MUST produce identical
`metadata.date` and `metadata.timestamp` values.

---

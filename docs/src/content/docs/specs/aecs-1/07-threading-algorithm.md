---
title: "5. Threading Algorithm"
---


### 5.1 Validity of a Message-ID

A **valid Message-ID** is a value that, after trimming surrounding whitespace and stripping
one optional pair of enclosing angle brackets, is non-empty and contains exactly one `@`
character with a non-empty sequence of characters on each side (informally following the
`msg-id` grammar of [RFC 5322 §3.6.4](https://www.rfc-editor.org/rfc/rfc5322#section-3.6.4)).
Implementations MAY apply the full RFC 5322 `msg-id` ABNF for stricter validation — the rule
above is the minimum bar and is sufficient to satisfy this specification's determinism
requirements. A header value that is absent, empty, or fails this test is **not valid** and
MUST be treated as if that header were absent for the purposes of [§5.2](/aecs/specs/aecs-1/07-threading-algorithm/#52-algorithm).

### 5.2 Algorithm

All implementations MUST calculate `threadId` using the following deterministic algorithm, evaluated in order:

1. If a `References` header is present, scan its entries in order and use the **first entry
   that is a valid Message-ID** ([§5.1](/aecs/specs/aecs-1/07-threading-algorithm/#51-validity-of-a-message-id)) as `threadId`. An invalid entry is skipped, not
   treated as ending the header — e.g. `References: garbage, <valid@example.com>` resolves
   to `valid@example.com`, not to rule 2.
2. Otherwise, if an `In-Reply-To` header is present and is a valid Message-ID, use it as `threadId`.
3. Otherwise, if the message's own `Message-ID` header is present and valid, use it as `threadId`.
4. Otherwise (no valid Message-ID found anywhere on the message), generate a deterministic
   fallback: `SHA-256(from_email + ":" + subject_lowercased_trimmed + ":" + date_utc_iso8601)`,
   encoded as lowercase hex. See [§5.4](/aecs/specs/aecs-1/07-threading-algorithm/#54-encoding-for-the-fallback-hash-rule-4) for the exact encoding this hash MUST use.

### 5.3 Requirements

- The result MUST be identical for every message in the same conversation, regardless of the order messages are processed — [§5.2](/aecs/specs/aecs-1/07-threading-algorithm/#52-algorithm) depends only on one message's own headers, never on other messages that have or haven't been seen.
- Angle brackets in Message-IDs MUST be stripped before comparison or storage (`<abc@example.com>` → `abc@example.com`).
- Whitespace in Message-IDs MUST be trimmed.
- The fallback hash (rule 4) is a last resort. Implementations SHOULD log a warning when it is used.

### 5.4 Encoding for the Fallback Hash (Rule 4)

The fallback hash is only reproducible across independently-written implementations if every
input to it is normalized identically first:

- `from_email` is the addr-spec portion of the `From` header (display name excluded).
  Implementations SHOULD normalize it to lowercase. A missing `From` address contributes
  the empty string.
- `from_email`, `subject_lowercased_trimmed`, and `date_utc_iso8601` MUST each be Unicode
  normalized to [NFC](https://unicode.org/reports/tr15/) before concatenation. Two visually
  identical strings can have different byte sequences (e.g. a precomposed vs. combining
  diacritic) — without NFC normalization, two correct implementations can hash the same
  logical subject to different values.
- The concatenated string MUST be UTF-8 encoded before hashing.
- `subject_lowercased_trimmed` MUST use the fully decoded Unicode subject (RFC 2047
  encoded-words decoded first, if present), lowercased using the **locale-independent**
  Unicode default case mapping (e.g. JavaScript `String.prototype.toLowerCase()`, not
  `toLocaleLowerCase()` — the Turkish locale's dotless-ı mapping for `I`/`i` is a well-known
  source of divergence), with leading/trailing whitespace trimmed. A missing subject
  contributes the empty string, not the text `"null"`.
- `date_utc_iso8601` MUST be formatted exactly as `metadata.date` ([§6](/aecs/specs/aecs-1/08-timestamps/)): ISO 8601, UTC, `Z`
  suffix, second precision — e.g. `2026-06-29T10:00:00Z`. When `metadata.date` is `null`,
  `date_utc_iso8601` contributes the empty string (the separating `:` in the concatenation
  is still present).

### 5.5 Design Rationale: Static vs. Dynamic (JWZ-Style) Threading

Mail clients implementing the Jamie Zawinski ("JWZ") threading algorithm build a container
tree incrementally and *re-parent* messages as earlier context arrives out of order — an
orphaned reply gets retroactively attached once its missing parent finally shows up. AECS-1
deliberately does not do this: `threadId` ([§5.2](/aecs/specs/aecs-1/07-threading-algorithm/#52-algorithm)) is a pure function of one message's own
headers and never depends on which other messages have or haven't been seen. This is a
narrower guarantee than JWZ reparenting, traded for the property this spec is built around —
`threadId` is computable from a single message in isolation, with no external state, and is
guaranteed stable regardless of processing order ([§5.3](/aecs/specs/aecs-1/07-threading-algorithm/#53-requirements)). An implementation that wants
JWZ-style merge-on-discovery behavior MAY build it as an application-layer feature that
groups AECS-1 `threadId`s together after the fact; that grouping logic is out of scope here.

---

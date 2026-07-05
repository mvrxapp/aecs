---
title: "10. Conformance"
---


Requiredness is stated throughout this document as it comes up ([§2](/aecs/specs/aecs-1/04-core-principles/), [§4](/aecs/specs/aecs-1/06-field-definitions/), [§5](/aecs/specs/aecs-1/07-threading-algorithm/), [§6](/aecs/specs/aecs-1/08-timestamps/)). This
section collects it into one checklist. An implementation is **AECS-1-conformant** if and
only if it satisfies every point below:

1. Every produced object has non-null `messageId` and `threadId` ([§4.1](/aecs/specs/aecs-1/06-field-definitions/#41-top-level)) — these are the only
   two fields this spec requires to always be present and non-null. When no valid
   `Message-ID` header exists, `messageId` MUST be synthetic per [§4.1.1](/aecs/specs/aecs-1/06-field-definitions/#411-synthetic-messageid).
2. Producers SHOULD represent unpopulated optional fields as explicit `null` (or, for
   `attachments`, an empty array). A conformant consumer MUST treat an omitted field and an
   explicit `null` identically ([§2](/aecs/specs/aecs-1/04-core-principles/), [§4.1](/aecs/specs/aecs-1/06-field-definitions/#41-top-level)).
3. `threadId` is computed using the exact algorithm in [§5.2](/aecs/specs/aecs-1/07-threading-algorithm/#52-algorithm), including the validity
   definition in [§5.1](/aecs/specs/aecs-1/07-threading-algorithm/#51-validity-of-a-message-id) and the encoding rules in [§5.4](/aecs/specs/aecs-1/07-threading-algorithm/#54-encoding-for-the-fallback-hash-rule-4) for the fallback hash — not an
   approximation that happens to agree on common-case input.
4. `thread.position` is `null` unless computed from a fully-available, timestamp-sorted
   thread per [§4.4](/aecs/specs/aecs-1/06-field-definitions/#44-thread) — never a value guessed from a single message.
5. All timestamps satisfy [§6](/aecs/specs/aecs-1/08-timestamps/) exactly: UTC, ISO 8601 with explicit offset, Unix epoch
   seconds, and `null`-not-guessed when the source `Date` header is absent or unparseable.
6. Unknown/custom fields are namespaced per [§9](/aecs/specs/aecs-1/11-extensibility/) when producing, and ignored (not an error,
   not a validation failure) when consuming.
7. `content.rawFull`, if populated, is byte-faithful to the original message — conformance
   does not require populating it ([§2](/aecs/specs/aecs-1/04-core-principles/)'s "flexible by design"), but if present it MUST NOT be
   normalized, re-encoded, or otherwise altered from the source.

A conformant implementation is NOT required to populate every `content.*` level ([§4.3](/aecs/specs/aecs-1/06-field-definitions/#43-content)
already says implementations SHOULD populate what they're capable of, not MUST populate
all) — the bar is that *whatever* is populated follows the rules above, not that everything
is populated. See [`specs/conformance/`](./conformance/) for machine-checkable fixtures
covering points 3–5, and [`specs/schema/normalized-email.schema.json`](./schema/normalized-email.schema.json)
for a JSON Schema covering points 1, 2, and 6 (shape and nullability).

---

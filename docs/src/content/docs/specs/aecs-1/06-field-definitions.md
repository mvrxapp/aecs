---
title: "4. Field Definitions"
---


### 4.1 Top-Level

| Field | Type | Required | Description |
|---|---|---|---|
| `messageId` | string | **Yes** | The value of the `Message-ID` header, normalized (angle brackets stripped). When the header is absent or invalid ([§5.1](/aecs/specs/aecs-1/07-threading-algorithm/#51-validity-of-a-message-id)), implementations MUST assign a synthetic ID per [§4.1.1](/aecs/specs/aecs-1/06-field-definitions/#411-synthetic-messageid). Unique per message. |
| `threadId` | string | **Yes** | Stable conversation identifier. Calculated deterministically — see [Section 5](/aecs/specs/aecs-1/07-threading-algorithm/). |
| `metadata` | object | No | Parsed header fields. |
| `content` | object | No | Message body at multiple processing levels. |
| `thread` | object | No | Threading position and header chain. |
| `attachments` | array | No | Metadata for each MIME attachment. Empty array if none. |
| `processing` | object | No | Normalization provenance. |

#### 4.1.1 Synthetic `messageId`

When the `Message-ID` header is absent or not valid ([§5.1](/aecs/specs/aecs-1/07-threading-algorithm/#51-validity-of-a-message-id)), implementations MUST still
produce a non-null `messageId`. It MUST be deterministic: the same source message MUST
always yield the same ID.

When the complete original message is available, the RECOMMENDED form is:

```
generated-{prefix}@aecs.local
```

where `{prefix}` is the first 32 characters of the lowercase hex SHA-256 digest of the
message's original octets (the same bytes represented by `content.rawFull` when
populated).

Implementations that normalize without access to full message octets MUST document their
deterministic scheme. A synthetic ID MUST NOT be used when a valid `Message-ID` header is
present.

---

### 4.2 `metadata`

| Field | Type | Description |
|---|---|---|
| `metadata.from` | Address | Parsed `From` header. |
| `metadata.to` | Address[] | Parsed `To` header recipients. |
| `metadata.cc` | Address[] | Parsed `CC` header recipients. |
| `metadata.bcc` | Address[] | Parsed `BCC` header. Typically absent from received messages. |
| `metadata.subject` | string \| null | Decoded `Subject` header value. |
| `metadata.date` | string \| null | `Date` header value normalized to ISO 8601 UTC. `null` if the header is absent or unparseable — see [§6](/aecs/specs/aecs-1/08-timestamps/). |
| `metadata.timestamp` | number \| null | Unix epoch (seconds, UTC). Parsed from `metadata.date`; `null` under the same conditions as `metadata.date` — see [§6](/aecs/specs/aecs-1/08-timestamps/). |

**Address object:**
```json
{ "name": "Alice Smith", "email": "alice@example.com" }
```
`name` is `null` when no display name is present.

---

### 4.3 `content`

The content object provides the same message body at six processing levels. Implementations SHOULD populate all levels they are capable of producing. Fields the implementation cannot produce MUST be `null`.

| Field | Description |
|---|---|
| `content.rawFull` | Complete original RFC 5322 message — all headers, MIME parts, encodings, exactly as received. Suitable for archival and re-parsing. |
| `content.raw` | The latest message body only. Quoted reply history is stripped at the MIME level. Headers are excluded. |
| `content.html` | HTML rendition of the latest message content. `null` if the message has no HTML part. |
| `content.text` | Plain text rendition of the latest message content, decoded from any transfer encoding. |
| `content.clean` | Plain text with email signatures and quoted reply chains removed using heuristic detection. May be imperfect. |
| `content.forAI` | Derived from `clean`. Additionally: whitespace normalised, inline image references removed, forwarded-message headers collapsed to a single summary line. This is the field AI consumers SHOULD use as their primary input. |

Consumers preferring minimal context window usage should use `content.forAI`. Consumers requiring fidelity to the original should use `content.rawFull`.

---

### 4.4 `thread`

| Field | Type | Description |
|---|---|---|
| `thread.position` | number \| null | Position of this message within the conversation, ordered by ascending `metadata.timestamp` (the `Date` header value — see note below), where `0` = earliest. `null` when the implementation cannot determine position without loading the rest of the thread (see below). |
| `thread.inReplyTo` | string \| null | The raw value of the `In-Reply-To` header (Message-ID, angle brackets stripped). |
| `thread.references` | string[] | Ordered list of Message-IDs from the `References` header, earliest first. |

**On `thread.position`:**

- `thread.position` cannot be computed from a single message — it requires knowing every
  other message in the thread. An implementation normalizing one message in isolation
  (e.g. as it arrives) MUST set `thread.position` to `null`; it MUST only be populated once
  the full set of messages sharing a `threadId` is available and sorted.
- The ordering key is `metadata.timestamp` (i.e. the sender-supplied `Date` header),
  **not** the order in which an implementation received or processed each message.
  These are different orderings whenever mail is delayed, backdated, or a sender's clock is
  skewed — and per [§7](/aecs/specs/aecs-1/09-security-considerations/), `Date` is sender-controlled, untrusted input. Implementations that
  need true receipt/processing order for robustness against clock skew or spoofing SHOULD
  use `processing.processedAt` ([§4.6](/aecs/specs/aecs-1/06-field-definitions/#46-processing)) for that purpose instead of `thread.position`.
- Ties (two messages with identical `metadata.timestamp`) MAY be broken by `messageId`
  string comparison for a stable, deterministic sort; this spec does not mandate a specific
  tiebreak beyond requiring one to exist so position assignment is reproducible.

---

### 4.5 `attachments`

Each element in the `attachments` array describes one MIME attachment.

| Field | Type | Description |
|---|---|---|
| `id` | string \| null | Optional stable identifier for this attachment within the message. RECOMMENDED derivation: `` `${messageId}:${index}` `` where `index` is the attachment's 0-based position in MIME order. Implementations that don't populate this MUST use `null`, not a random value that would change between normalizations of the same message. |
| `filename` | string | Decoded filename from `Content-Disposition` or `Content-Type` `name` parameter. |
| `contentType` | string | MIME type (e.g. `application/pdf`). |
| `size` | number | Size in bytes. |
| `cid` | string \| null | Content-ID for inline attachments (`Content-ID` header, angle brackets stripped). `null` for non-inline attachments. |

Attachment binary content is not included in `NormalizedEmail`. Implementations store and reference it separately.

---

### 4.6 `processing`

| Field | Type | Description |
|---|---|---|
| `processing.processedAt` | string | ISO 8601 UTC timestamp of when this normalization was produced. |
| `processing.specVersion` | string | The AECS version used (e.g. `"1.0"`). |

---

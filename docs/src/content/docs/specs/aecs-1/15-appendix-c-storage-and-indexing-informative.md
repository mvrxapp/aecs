---
title: "Appendix C: Storage and Indexing (Informative)"
---


This appendix is informative. Conformance ([§10](/aecs/specs/aecs-1/12-conformance/)) does not depend on it. It describes how to
store `NormalizedEmail` objects so that the common reads — a thread for an LLM, an inbox page,
mail with one person — touch only small, indexed rows. It applies to any database. Worked
schemas for SQLite / Cloudflare D1, PostgreSQL, MySQL, MongoDB and DynamoDB are in the
repository's [`examples/storage/`](https://github.com/mvrxapp/aecs/tree/main/examples/storage) directory.

### C.1 Split by Access Pattern

A `NormalizedEmail` holds the same body up to six times ([§4.3](/aecs/specs/aecs-1/06-field-definitions/#43-content)). Storing every level in
one row makes every list query read megabytes it does not use. Store each field in the tier
that matches how often it is read:

| Tier | Holds | Read when | Typical size |
|---|---|---|---|
| **Hot** — message row | `messageId`, `threadId`, `metadata.*` (sender, subject, dates), `thread.inReplyTo`, `content.forAI`, attachment count, `processing.specVersion`, `processing.cleanFallback`, a pointer to cold storage | Every list, thread and LLM-context query | A few KB; bounded by `forAIMaxChars` |
| **Warm** — body row | `content.text`, `content.clean` | One message is opened, or `forAI` is not enough ([§4.3](/aecs/specs/aecs-1/06-field-definitions/#43-content)) | Up to the body size |
| **Cold** — object storage | `content.rawFull`, `content.html`, attachment bytes | Re-parsing, rendering, download | Unbounded |
| **Derived** — side tables | One row per participant, per `References` entry, per attachment; one row per thread | Participant search, reply lookup, conversation list | Tens of bytes each |

`content.raw` need not be stored: it can be regenerated from `rawFull` ([§4.3](/aecs/specs/aecs-1/06-field-definitions/#43-content)), and `text` covers the
same need for most readers.

### C.2 Keys and Sort Order

- **Scope every key by mailbox.** The same message can arrive in many mailboxes, and a
  `threadId` is only meaningful within one. Use `(mailbox, messageId)` as the identity, and
  lead every index with the mailbox. A database-per-mailbox layout (common on Cloudflare D1)
  makes the mailbox column constant but keeps rows portable.
- **Use fixed-length hashed keys.** Message-IDs can be up to 998 bytes and may contain any
  printable character. A lowercase hex SHA-256 of `messageId` (and of `threadId`) gives a
  64-character key that keeps indexes small, is safe as an object-storage path segment, and
  fits stores with short key limits (for example a 64-byte vector ID). Keep the original IDs
  as ordinary columns for display and export. To look a message up by Message-ID, hash it
  first.
- **Never store `thread.position`.** It changes whenever an earlier-dated message arrives
  ([§4.4](/aecs/specs/aecs-1/06-field-definitions/#44-thread)). Compute it at read time from the sort order.
- **Sort by a non-null timestamp.** `metadata.timestamp` can be `null` ([§6](/aecs/specs/aecs-1/08-timestamps/)). Store a separate sort
  key that falls back to `processing.processedAt`, and keep the true `metadata.date` (which
  may be `null`) in its own column. Break ties with the message key so every ordering is
  total and pagination is stable.
- **Lowercase stored email addresses** in index columns, so lookups match regardless of how a
  sender capitalised their address.

### C.3 Indexes for the Core Reads

| Read | Index (after the mailbox prefix) | Notes |
|---|---|---|
| Thread for an LLM: last N messages, oldest first | messages `(threadKey, sortTs, messageKey)` | Select `forAI` only; read newest N with the index, then reverse |
| Inbox page, newest first | messages `(sortTs DESC, messageKey DESC)` | Keyset pagination on `(sortTs, messageKey)`; never `OFFSET` |
| Conversation list | threads `(lastTs DESC)` | One summary row per thread: subject, first/last timestamp, count, last message |
| Mail with one person | participants `(email, sortTs DESC)` | One row per from/to/cc/bcc address; copy the sort key so the index covers ordering |
| Replies to a Message-ID | references `(refId)` | One row per `thread.references` entry |
| Lookup by Message-ID | messages primary key `(mailbox, messageKey)` | Hash the Message-ID first |

Full-text search, if needed, indexes `subject` and `content.clean` (not `forAI`, which may
be truncated, and not `html`). Semantic search embeds `content.forAI` and stores one vector
per message keyed by the message key, with the mailbox and thread key as filterable
metadata.

### C.4 Writing

- **Idempotent writes.** Mail is delivered at least once. Insert the message row with
  "insert if absent" semantics on `(mailbox, messageKey)`, and update the thread summary only
  when that insert created a row, so re-delivery never double-counts.
- **Cold tier first.** Write object-storage blobs before the row that points at them, so a
  stored row never references a missing blob.
- **Atomic per message.** Write the hot row, body row, side-table rows and thread summary in
  one transaction or batch.
- **Record the spec version.** Store `processing.specVersion` in the hot row. When a later
  AECS-1 version changes derived fields (for example 1.1.0's cleanup rules, [§4.3.1](/aecs/specs/aecs-1/06-field-definitions/#431-content-preservation)), find
  rows with an older version and re-parse them from `rawFull`. This is the main reason to
  keep `rawFull`.

### C.5 Payload Budgets

- Keep the hot row small enough that a page of 50 rows is cheap to read: metadata plus a
  bounded `forAI`. Set `forAIMaxChars` to what the consuming model needs, not more.
- Do not put `rawFull`, `html` or attachment bytes in a row or document. Respect per-store
  limits: for example 2 MB per row on Cloudflare D1, 400 KB per item on DynamoDB, 16 MB
  per document on MongoDB.
- Bound `extractedText` on attachments (see the SDK's `attachmentsForAIOptions`), or keep
  it in object storage.

### C.6 Security and Retention

- Every stored field is untrusted input ([§7](/aecs/specs/aecs-1/09-security-considerations/)). Use parameterised queries, and never interpolate email
  content into SQL, filter expressions or object keys. Hashed keys avoid the last case.
- `metadata.bcc` reveals hidden recipients. Store it only where the mailbox owner is the
  sender, and exclude it from shared or multi-user views.
- Deleting a message means deleting it from every tier: the hot, warm and side-table rows,
  the object-storage prefix, the search index and any vector index. Keying every tier by the
  same message key makes this one operation per store.

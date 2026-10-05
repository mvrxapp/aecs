---
title: "Storing AECS email"
description: "How to structure NormalizedEmail data in a database for small payloads and indexed retrieval (AECS-1 Appendix C)."
---

AECS gives every email the same shape. That makes storage predictable: the same tables,
keys and indexes work for every mailbox. This section turns
[AECS-1 Appendix C](/aecs/specs/aecs-1/15-appendix-c-storage-and-indexing-informative/) into
ready-to-use schemas.

## The layout in one picture

| Tier | Where | Holds | Read by |
|---|---|---|---|
| **Hot** | `aecs_messages` | IDs, sender, subject, dates, `forAI`, counts, spec version | Every list, thread and LLM query |
| **Warm** | `aecs_bodies` | `text`, `clean` | Opening one message |
| **Cold** | Object storage (R2, S3, GCS) | `raw.eml`, `body.html`, attachment bytes | Re-parsing, rendering, download |
| **Derived** | `aecs_addresses`, `aecs_references`, `aecs_threads`, `aecs_attachments` | One row per participant, reference, thread, attachment | Participant search, replies, conversation list |

Lists and LLM context read only the hot row: metadata plus a bounded `forAI`, a few KB.
The full body is a single primary-key read away when someone opens the message, and the
raw message sits in object storage for re-parsing.

## Keys

- Every key starts with **`mailbox_id`**. The same message can land in many mailboxes.
- **`message_key`** = lowercase hex SHA-256 of `messageId`, and **`thread_key`** likewise for
  `threadId`. Fixed 64-character keys keep indexes small, are safe in object-storage paths,
  and fit Cloudflare Vectorize's 64-byte ID limit. To find a message by Message-ID, hash it
  first.
- **`ts`** is the sort key: `metadata.timestamp`, or `processedAt` when the `Date` header is
  missing. The true `metadata.date` is kept in its own column.
- **`thread.position` is never stored.** It is computed when a thread is read.

## The reads, and the index behind each

| Read | Index |
|---|---|
| Last N messages of a thread, for an LLM | `aecs_messages (mailbox_id, thread_key, ts, message_key)` |
| Inbox page, newest first, keyset-paginated | `aecs_messages (mailbox_id, ts DESC, message_key DESC)` |
| Conversation list | `aecs_threads (mailbox_id, last_ts DESC)` |
| All mail with one person | `aecs_addresses (mailbox_id, email, ts DESC)` |
| Replies to a Message-ID | `aecs_references (mailbox_id, ref_id)` |
| One message by Message-ID | primary key `(mailbox_id, message_key)` |

## From `NormalizedEmail` to rows

[`to-rows.mjs`](https://github.com/mvrxapp/aecs/blob/main/examples/storage/to-rows.mjs) maps a parsed email to exactly these rows and blobs. It has
no dependencies and runs in Node 18+, Workers, Deno and browsers.

```ts
import { parse } from "@mvrx/aecs";
import { toRows } from "./to-rows.mjs";

const email = await parse(raw);
const rows = await toRows(email, { mailboxId: "user-123" });
// rows.message, rows.body, rows.addresses, rows.references, rows.attachments, rows.blobs
```

## Writing rules

1. **Blobs first:** write `rows.blobs` and attachment bytes to object storage before the rows.
2. **One transaction per message.**
3. **Idempotent:** "insert if absent" on the message; bump the thread summary only if that
   insert created a row. Re-delivered mail changes nothing.
4. **Keep `spec_version`:** when AECS changes derived fields, find older rows and re-parse
   them from `raw.eml`.

## Pick your database

| Database | Guide | Example files |
|---|---|---|
| Cloudflare (D1 + R2 + Vectorize) | [Cloudflare](/aecs/storage/cloudflare/) | `sqlite.sql`, `sqlite-queries.sql`, `cloudflare-worker.ts` |
| SQLite | [SQLite](/aecs/storage/sqlite/) | `sqlite.sql`, `sqlite-queries.sql` |
| PostgreSQL | [PostgreSQL](/aecs/storage/postgresql/) | `postgresql.sql` |
| MySQL | [MySQL](/aecs/storage/mysql/) | `mysql.sql` |
| MongoDB | [MongoDB](/aecs/storage/mongodb/) | `mongodb.js` |
| DynamoDB | [DynamoDB](/aecs/storage/dynamodb/) | `dynamodb.md` |

The SQLite / D1 schema and every query in `sqlite-queries.sql` run in this repository's
test suite, including a check that no read scans the messages table.

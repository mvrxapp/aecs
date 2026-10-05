---
title: "Cloudflare (D1, R2, Vectorize)"
description: "Store AECS email on Cloudflare: D1 for indexed rows, R2 for raw messages and attachments, Vectorize for semantic search."
---

Cloudflare covers every tier on one platform:

| Tier | Product | Notes |
|---|---|---|
| Hot, warm, derived | **D1** | The SQLite schema below. One database per mailbox or tenant is the D1-native layout (10 GB per database, 2 MB per row, 100 bound parameters per query). |
| Cold | **R2** | `raw.eml`, `body.html`, attachment bytes under `blob_prefix`. |
| Semantic search | **Vectorize** (optional) | One vector per message: `id` = `message_key` (64 hex characters, exactly the ID limit), embedding of `forAI`, metadata `mailbox_id` / `thread_key` / `ts`. |
| Inbound | **Email Routing** → Email Worker | `parse(message.raw)` then store. |

## 1. Create the resources

```sh
npx wrangler d1 create mail
npx wrangler r2 bucket create mail-blobs
mkdir -p migrations && cp examples/storage/sqlite.sql migrations/0001_aecs.sql
npx wrangler d1 migrations apply mail --remote

# Optional semantic search (bge-m3 produces 1,024-dimension vectors)
npx wrangler vectorize create mail-forai --dimensions=1024 --metric=cosine
npx wrangler vectorize create-metadata-index mail-forai --property-name=mailbox_id --type=string
npx wrangler vectorize create-metadata-index mail-forai --property-name=thread_key --type=string
```

Apply the schema as a migration. Re-running `CREATE INDEX` on every request costs writes.

## 2. Schema (`sqlite.sql`)

```sql
-- AECS storage schema for SQLite and Cloudflare D1 (AECS-1 Appendix C).
-- Run once as a migration (wrangler d1 migrations apply), not on every request.
--
-- Hot  : aecs_messages   one small row per message; holds forAI; every list/thread query reads only this
-- Warm : aecs_bodies     text + clean; read when a single message is opened
-- Cold : object storage  rawFull (raw.eml), html (body.html), attachment bytes, under blob_prefix
--
-- Keys: message_key / thread_key are lowercase hex SHA-256 of messageId / threadId.
-- Fixed 64-char keys keep indexes small, are safe as object-storage paths, and fit
-- Vectorize's 64-byte vector ID limit. The original IDs are kept for display and export.
--
-- On D1, prefer one database per mailbox or tenant (10 GB per database). mailbox_id then
-- holds a single value; keep it so rows stay portable.

CREATE TABLE IF NOT EXISTS aecs_messages (
  mailbox_id       TEXT    NOT NULL,
  message_key      TEXT    NOT NULL,            -- sha256(messageId)
  message_id       TEXT    NOT NULL,            -- NormalizedEmail.messageId
  thread_key       TEXT    NOT NULL,            -- sha256(threadId)
  thread_id        TEXT    NOT NULL,            -- NormalizedEmail.threadId
  ts               INTEGER NOT NULL,            -- metadata.timestamp, or processedAt when null (sort key only)
  date             TEXT,                        -- metadata.date (true value, may be null)
  from_email       TEXT    NOT NULL,            -- lowercased
  from_name        TEXT,
  subject          TEXT,
  in_reply_to      TEXT,
  forai            TEXT,                        -- content.forAI (bounded by forAIMaxChars)
  attachment_count INTEGER NOT NULL DEFAULT 0,
  size_bytes       INTEGER,                     -- byte length of rawFull
  clean_fallback   INTEGER NOT NULL DEFAULT 0,  -- processing.cleanFallback
  spec_version     TEXT    NOT NULL,            -- processing.specVersion; re-parse rows from older versions
  processed_at     TEXT    NOT NULL,
  blob_prefix      TEXT,                        -- object-storage prefix for raw.eml / body.html / att/<n>
  x_fields         TEXT,                        -- JSON object of x_ extension fields
  PRIMARY KEY (mailbox_id, message_key)
);

-- Thread view: newest-first or oldest-first messages of one thread.
CREATE INDEX IF NOT EXISTS aecs_messages_thread ON aecs_messages (mailbox_id, thread_key, ts, message_key);
-- Inbox view: keyset pagination, newest first.
CREATE INDEX IF NOT EXISTS aecs_messages_inbox  ON aecs_messages (mailbox_id, ts DESC, message_key DESC);

CREATE TABLE IF NOT EXISTS aecs_bodies (
  mailbox_id  TEXT NOT NULL,
  message_key TEXT NOT NULL,
  text        TEXT,                             -- content.text (full body, quotes included)
  clean       TEXT,                             -- content.clean
  PRIMARY KEY (mailbox_id, message_key)
);

CREATE TABLE IF NOT EXISTS aecs_addresses (
  mailbox_id  TEXT    NOT NULL,
  message_key TEXT    NOT NULL,
  role        TEXT    NOT NULL CHECK (role IN ('from', 'to', 'cc', 'bcc')),
  email       TEXT    NOT NULL,                 -- lowercased
  name        TEXT,
  ts          INTEGER NOT NULL,                 -- copy of aecs_messages.ts, so the index below covers ordering
  thread_key  TEXT    NOT NULL,
  PRIMARY KEY (mailbox_id, message_key, role, email)
);

-- "All mail with alice@example.com", newest first.
CREATE INDEX IF NOT EXISTS aecs_addresses_email ON aecs_addresses (mailbox_id, email, ts DESC);

CREATE TABLE IF NOT EXISTS aecs_references (
  mailbox_id  TEXT    NOT NULL,
  message_key TEXT    NOT NULL,
  position    INTEGER NOT NULL,                 -- 0 = earliest, as in thread.references
  ref_id      TEXT    NOT NULL,
  PRIMARY KEY (mailbox_id, message_key, position)
);

-- "Which stored messages reference this Message-ID?" (replies, re-threading).
CREATE INDEX IF NOT EXISTS aecs_references_ref ON aecs_references (mailbox_id, ref_id);

CREATE TABLE IF NOT EXISTS aecs_threads (
  mailbox_id      TEXT    NOT NULL,
  thread_key      TEXT    NOT NULL,
  thread_id       TEXT    NOT NULL,
  subject         TEXT,                         -- subject of the earliest stored message
  first_ts        INTEGER NOT NULL,
  last_ts         INTEGER NOT NULL,
  message_count   INTEGER NOT NULL DEFAULT 0,
  last_message_key TEXT   NOT NULL,
  PRIMARY KEY (mailbox_id, thread_key)
);

-- Conversation list, most recently active first.
CREATE INDEX IF NOT EXISTS aecs_threads_recent ON aecs_threads (mailbox_id, last_ts DESC);

CREATE TABLE IF NOT EXISTS aecs_attachments (
  mailbox_id     TEXT    NOT NULL,
  message_key    TEXT    NOT NULL,
  idx            INTEGER NOT NULL,              -- 0-based MIME order
  attachment_id  TEXT    NOT NULL,              -- Attachment.id ("<messageId>:<idx>")
  filename       TEXT    NOT NULL,
  content_type   TEXT    NOT NULL,
  size           INTEGER NOT NULL,
  cid            TEXT,
  blob_key       TEXT,                          -- object-storage key of the bytes
  extracted_text TEXT,                          -- optional; keep it bounded or move it to object storage
  PRIMARY KEY (mailbox_id, message_key, idx)
);

-- Optional full-text search over subject + clean. Costs storage and writes; add it
-- only if you search. message_key is stored but not tokenized.
CREATE VIRTUAL TABLE IF NOT EXISTS aecs_search USING fts5 (
  mailbox_id UNINDEXED,
  message_key UNINDEXED,
  subject,
  body,
  tokenize = 'unicode61 remove_diacritics 2'
);
```

## 3. Email Worker (`cloudflare-worker.ts`)

Writes R2 first, then all rows in one atomic, idempotent `DB.batch()`, then the optional
vector in `waitUntil`. The SQL comes from [`sqlite-queries.sql`](https://github.com/mvrxapp/aecs/blob/main/examples/storage/sqlite-queries.sql),
bundled as text.

```ts
// Cloudflare Email Worker: parse inbound mail with AECS and store it per AECS-1 Appendix C.
//
//   D1        aecs_* tables from sqlite.sql (hot rows, bodies, addresses, threads, search)
//   R2        raw.eml, body.html and attachment bytes under blob_prefix
//   Vectorize optional: one vector per message, embedding of content.forAI
//
// wrangler.jsonc (excerpt):
//   "d1_databases": [{ "binding": "DB", "database_name": "mail", "database_id": "…", "migrations_dir": "migrations" }],
//   "r2_buckets":   [{ "binding": "BLOBS", "bucket_name": "mail-blobs" }],
//   "vectorize":    [{ "binding": "VECTORS", "index_name": "mail-forai" }],          // optional
//   "ai":           { "binding": "AI" },                                              // optional, for embeddings
//   "rules":        [{ "type": "Text", "globs": ["**/*.sql"], "fallthrough": true }]
//
// Setup, once:
//   cp examples/storage/sqlite.sql migrations/0001_aecs.sql && npx wrangler d1 migrations apply mail
//   npx wrangler vectorize create mail-forai --dimensions=1024 --metric=cosine
//   npx wrangler vectorize create-metadata-index mail-forai --property-name=mailbox_id --type=string
//   npx wrangler vectorize create-metadata-index mail-forai --property-name=thread_key --type=string

import { parse, wrappers } from "@mvrx/aecs";
import queriesSql from "./sqlite-queries.sql";
import { toRows } from "./to-rows.mjs";

interface Env {
  DB: D1Database;
  BLOBS: R2Bucket;
  VECTORS?: VectorizeIndex;
  AI?: Ai;
}

const Q: Record<string, string> = Object.fromEntries(
  queriesSql
    .split(/^-- name: /m)
    .slice(1)
    .map((block) => {
      const [name, ...rest] = block.split("\n");
      return [name.trim(), rest.filter((line) => !line.startsWith("--")).join("\n").trim()];
    }),
);

export default {
  async email(message, env, ctx): Promise<void> {
    // One database per mailbox is the D1-native layout; mailbox_id still keeps rows portable.
    const mailboxId = message.to.toLowerCase();

    const email = await parse(message.raw, { wrapper: wrappers.xml("email") });
    const rows = await toRows(email, { mailboxId });
    const m = rows.message;

    // 1. Cold tier first, so a stored row never points at a missing blob.
    await Promise.all([
      ...rows.blobs.map((b) => env.BLOBS.put(b.key, b.body, { httpMetadata: { contentType: b.contentType } })),
      ...email.attachments.map(async (att, i) =>
        env.BLOBS.put(rows.attachments[i].blob_key!, await att.content(), {
          httpMetadata: { contentType: att.contentType },
        }),
      ),
    ]);

    // 2. Hot and warm tiers in one atomic, idempotent batch (at most 100 bound parameters each).
    const stmt = (name: string, ...params: unknown[]) => env.DB.prepare(Q[name]).bind(...params);
    await env.DB.batch([
      stmt("insert_message", m.mailbox_id, m.message_key, m.message_id, m.thread_key, m.thread_id, m.ts, m.date,
        m.from_email, m.from_name, m.subject, m.in_reply_to, m.forai, m.attachment_count, m.size_bytes,
        m.clean_fallback, m.spec_version, m.processed_at, m.blob_prefix, m.x_fields),
      stmt("upsert_thread", m.mailbox_id, m.thread_key, m.thread_id, m.subject, m.ts, m.message_key),
      stmt("insert_body", rows.body.mailbox_id, rows.body.message_key, rows.body.text, rows.body.clean),
      ...rows.addresses.map((a) =>
        stmt("insert_address", a.mailbox_id, a.message_key, a.role, a.email, a.name, a.ts, a.thread_key)),
      ...rows.references.map((r) => stmt("insert_reference", r.mailbox_id, r.message_key, r.position, r.ref_id)),
      ...rows.attachments.map((a) =>
        stmt("insert_attachment", a.mailbox_id, a.message_key, a.idx, a.attachment_id, a.filename, a.content_type,
          a.size, a.cid, a.blob_key, a.extracted_text)),
      stmt("insert_search", m.mailbox_id, m.message_key, rows.body.clean),
    ]);

    // 3. Optional semantic index. message_key is 64 hex characters, exactly Vectorize's ID limit.
    if (env.VECTORS && env.AI && m.forai) {
      ctx.waitUntil(
        (async () => {
          const { data } = (await env.AI!.run("@cf/baai/bge-m3", { text: [m.forai!] })) as { data: number[][] };
          await env.VECTORS!.upsert([
            { id: m.message_key, values: data[0], metadata: { mailbox_id: m.mailbox_id, thread_key: m.thread_key, ts: m.ts } },
          ]);
        })(),
      );
    }
  },
} satisfies ExportedHandler<Env>;
```

## 4. Reading

All of these are in [`sqlite-queries.sql`](https://github.com/mvrxapp/aecs/blob/main/examples/storage/sqlite-queries.sql) and run against D1 with
`env.DB.prepare(sql).bind(...).all()`:

| Query | Use |
|---|---|
| `thread_context` | Last N messages of a thread with `forai` and computed position, for an LLM |
| `inbox_first_page` / `inbox_next_page` | Inbox, keyset-paginated |
| `threads_recent` | Conversation list |
| `messages_with_participant` | All mail with one address |
| `message_by_id` | One message with its body (`sha256Hex(messageId)` first) |
| `replies_to` | Messages that reference a Message-ID |
| `search` | FTS5 full-text search with snippets |
| `stale_spec_version` | Rows to re-parse from R2 after a spec upgrade |

Semantic search: embed the query with the same model, then
`env.VECTORS.query(vector, { topK: 20, filter: { mailbox_id } })` and load the hot rows
for the returned `message_key`s. Vectorize indexes the first 64 bytes of a string metadata
value, so filter on `mailbox_id` values shorter than that, or on a hash.

## 5. Deleting a message

Delete the D1 rows for `(mailbox_id, message_key)`, the R2 objects under `blob_prefix`
(`BLOBS.list({ prefix })` then `delete`), and the vector with `VECTORS.deleteByIds([message_key])`.

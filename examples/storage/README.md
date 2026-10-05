# Storage examples

Schemas and code for storing AECS `NormalizedEmail` objects, following
[AECS-1 Appendix C](../../specs/AECS-1-ai-email-consumption.md#appendix-c-storage-and-indexing-informative).
The docs site has a guide for each: <https://mvrxapp.github.io/aecs/storage/>.

| File | What it is | Tested here |
|---|---|---|
| [`to-rows.mjs`](./to-rows.mjs) | Maps a `NormalizedEmail` to hot/warm/derived rows and object-storage blobs | Yes |
| [`sqlite.sql`](./sqlite.sql) | Schema for SQLite and Cloudflare D1 | Yes, applied in `node:sqlite` |
| [`sqlite-queries.sql`](./sqlite-queries.sql) | Named store and read statements for SQLite / D1 | Yes, every query, plus a no-table-scan check |
| [`cloudflare-worker.ts`](./cloudflare-worker.ts) | Email Worker: parse → R2 + D1 batch (+ optional Vectorize) | No (needs Workers runtime) |
| [`postgresql.sql`](./postgresql.sql) | Schema and queries for PostgreSQL 13+ | Checked by hand against PostgreSQL (PGlite); not in CI |
| [`mysql.sql`](./mysql.sql) | Schema and queries for MySQL 8.0.19+ | No |
| [`mongodb.js`](./mongodb.js) | Collections, indexes and queries for MongoDB 6+ | No |
| [`dynamodb.md`](./dynamodb.md) | Single-table design for DynamoDB | No |

`test/storage.test.mjs` runs the tested files and checks that each docs page embeds its
example file verbatim, so the docs and the files cannot drift apart.

The layout in short:

- **Hot** `aecs_messages`: one small row per message with `forai`. Every list, thread and
  LLM query reads only this.
- **Warm** `aecs_bodies`: `text` and `clean`, read when one message is opened.
- **Cold** object storage: `raw.eml`, `body.html`, attachment bytes, under `blob_prefix`.
- **Derived**: participants, references, thread summaries, attachment metadata.
- Keys: `(mailbox_id, message_key)`, where `message_key` is SHA-256 of the Message-ID.

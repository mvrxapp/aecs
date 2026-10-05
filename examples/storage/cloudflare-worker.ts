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

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parse } from "../dist/index.js";
import { sha256Hex, toRows } from "../examples/storage/to-rows.mjs";

// node:sqlite ships with Node 22.5+. On older Node the SQL tests skip; the docs check still runs.
const { DatabaseSync } = await import("node:sqlite").catch(() => ({ DatabaseSync: null }));
const sqliteTest = DatabaseSync ? test : test.skip;

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

async function loadQueries() {
  const queries = {};
  for (const block of (await read("../examples/storage/sqlite-queries.sql")).split(/^-- name: /m).slice(1)) {
    const [name, ...rest] = block.split("\n");
    queries[name.trim()] = rest.filter((line) => !line.startsWith("--")).join("\n").trim();
  }
  return queries;
}

function message({ id, inReplyTo, refs = [], from, to, date, subject, body, cc }) {
  return [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc ? [`Cc: ${cc}`] : []),
    `Subject: ${subject}`,
    `Date: ${date}`,
    `Message-ID: <${id}>`,
    ...(inReplyTo ? [`In-Reply-To: <${inReplyTo}>`] : []),
    ...(refs.length ? [`References: ${refs.map((r) => `<${r}>`).join(" ")}`] : []),
    "Content-Type: text/plain; charset=UTF-8",
    "",
    ...body,
  ].join("\r\n");
}

const thread = [
  message({
    id: "root@example.com",
    from: "Alice <Alice@Example.com>",
    to: "Bob <bob@example.com>",
    date: "Mon, 28 Sep 2026 09:00:00 +0000",
    subject: "Q4 budget",
    body: ["Can you approve the Q4 budget of $40,000 by Friday?"],
  }),
  message({
    id: "reply1@example.com",
    inReplyTo: "root@example.com",
    refs: ["root@example.com"],
    from: "Bob <bob@example.com>",
    to: "Alice <alice@example.com>",
    cc: "Carol <carol@example.com>",
    date: "Mon, 28 Sep 2026 10:30:00 +0000",
    subject: "Re: Q4 budget",
    body: ["> Can you approve the Q4 budget of $40,000 by Friday?", "Approved, but cap travel at $5,000."],
  }),
  message({
    id: "reply2@example.com",
    inReplyTo: "reply1@example.com",
    refs: ["root@example.com", "reply1@example.com"],
    from: "Alice <alice@example.com>",
    to: "Bob <bob@example.com>",
    date: "Tue, 29 Sep 2026 08:15:00 +0000",
    subject: "Re: Q4 budget",
    body: ["Thanks, I will update the travel line."],
  }),
];

async function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(await read("../examples/storage/sqlite.sql"));
  const q = await loadQueries();
  const store = async (raw) => {
    const email = await parse(raw);
    const r = await toRows(email, { mailboxId: "mbx-1" });
    const m = r.message;
    // Same order as the Worker's D1 batch: message, guarded thread upsert, then the rest.
    // Every statement runs on every store; re-storing a message changes nothing.
    const inserted = db
      .prepare(q.insert_message)
      .run(
        m.mailbox_id, m.message_key, m.message_id, m.thread_key, m.thread_id, m.ts, m.date, m.from_email,
        m.from_name, m.subject, m.in_reply_to, m.forai, m.attachment_count, m.size_bytes, m.clean_fallback,
        m.spec_version, m.processed_at, m.blob_prefix, m.x_fields,
      ).changes;
    db.prepare(q.upsert_thread).run(m.mailbox_id, m.thread_key, m.thread_id, m.subject, m.ts, m.message_key);
    db.prepare(q.insert_body).run(r.body.mailbox_id, r.body.message_key, r.body.text, r.body.clean);
    for (const a of r.addresses) {
      db.prepare(q.insert_address).run(a.mailbox_id, a.message_key, a.role, a.email, a.name, a.ts, a.thread_key);
    }
    for (const ref of r.references) {
      db.prepare(q.insert_reference).run(ref.mailbox_id, ref.message_key, ref.position, ref.ref_id);
    }
    db.prepare(q.insert_search).run(m.mailbox_id, m.message_key, r.body.clean);
    return { email, rows: r, inserted: Boolean(inserted) };
  };
  return { db, q, store };
}

sqliteTest("storage example: schema applies and messages round-trip through toRows", async () => {
  const { db, q, store } = await setup();
  const stored = [];
  for (const raw of thread) stored.push(await store(raw));

  const threadKey = stored[0].rows.message.thread_key;
  assert.equal(threadKey, await sha256Hex("root@example.com"));
  assert.ok(stored.every((s) => s.rows.message.thread_key === threadKey));
  assert.match(stored[0].rows.message.blob_prefix, /^aecs\/[0-9a-f]{64}\/[0-9a-f]{64}\/$/);
  assert.deepEqual(stored[0].rows.blobs.map((b) => b.key.split("/").pop()), ["raw.eml"]);

  // Idempotent: storing a message again inserts nothing and leaves counts alone.
  assert.equal((await store(thread[1])).inserted, false);
  const t = db.prepare(q.threads_recent).all("mbx-1", 10);
  assert.equal(t.length, 1);
  assert.equal(t[0].message_count, 3);
  assert.equal(t[0].subject, "Q4 budget");
  assert.equal(t[0].last_message_key, stored[2].rows.message.message_key);

  const ctx = db.prepare(q.thread_context).all("mbx-1", threadKey, 2);
  assert.deepEqual(ctx.map((r) => [r.message_id, r.position]), [["reply1@example.com", 1], ["reply2@example.com", 2]]);
  assert.match(ctx[0].forai, /cap travel at \$5,000/);

  const page1 = db.prepare(q.inbox_first_page).all("mbx-1", 2);
  assert.deepEqual(page1.map((r) => r.message_id), ["reply2@example.com", "reply1@example.com"]);
  const last = page1.at(-1);
  const page2 = db.prepare(q.inbox_next_page).all("mbx-1", last.ts, last.message_key, 2);
  assert.deepEqual(page2.map((r) => r.message_id), ["root@example.com"]);

  const carol = db.prepare(q.messages_with_participant).all("mbx-1", "carol@example.com", 10);
  assert.deepEqual(carol.map((r) => [r.message_id, r.role]), [["reply1@example.com", "cc"]]);
  const alice = db.prepare(q.messages_with_participant).all("mbx-1", "alice@example.com", 10);
  assert.equal(alice.length, 3, "sender addresses are lowercased, so Alice@Example.com matches");

  const one = db.prepare(q.message_by_id).get("mbx-1", await sha256Hex("reply1@example.com"));
  assert.equal(one.subject, "Re: Q4 budget");
  assert.match(one.text, /^> Can you approve/);

  const replies = db.prepare(q.replies_to).all("mbx-1", "root@example.com");
  assert.deepEqual(replies.map((r) => r.message_id), ["reply1@example.com", "reply2@example.com"]);

  assert.equal(db.prepare("SELECT count(*) AS n FROM aecs_search").get().n, 3, "re-storing does not duplicate search rows");
  const hits = db.prepare(q.search).all("mbx-1", "travel", 10);
  assert.deepEqual(hits.map((r) => r.message_id).sort(), ["reply1@example.com", "reply2@example.com"]);

  assert.equal(db.prepare(q.stale_spec_version).all("mbx-1", "1.1", 10).length, 0);
  assert.equal(db.prepare(q.stale_spec_version).all("mbx-1", "1.2", 10).length, 3);
});

sqliteTest("storage example: read queries use indexes, never a full scan of aecs_messages", async () => {
  const { db, q } = await setup();
  const args = {
    thread_context: ["m", "t", 5],
    inbox_first_page: ["m", 10],
    inbox_next_page: ["m", 0, "k", 10],
    threads_recent: ["m", 10],
    messages_with_participant: ["m", "a@b.c", 10],
    message_by_id: ["m", "k"],
    replies_to: ["m", "r@x"],
  };
  for (const [name, params] of Object.entries(args)) {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${q[name]}`).all(...params).map((r) => r.detail).join("\n");
    assert.doesNotMatch(plan, /SCAN aecs_messages\b/, `${name} scans aecs_messages:\n${plan}`);
    // thread_context re-sorts only the N rows its indexed subquery returned (newest N → oldest first);
    // replies_to sorts only the replies its indexed lookup found. Neither sort touches the table.
    if (!["thread_context", "replies_to"].includes(name)) {
      assert.doesNotMatch(plan, /USE TEMP B-TREE FOR ORDER BY/, `${name} sorts without an index:\n${plan}`);
    }
  }
});

test("storage docs embed the example files verbatim", async () => {
  const pairs = [
    ["../docs/src/content/docs/storage/sqlite.md", "../examples/storage/sqlite.sql"],
    ["../docs/src/content/docs/storage/cloudflare.md", "../examples/storage/sqlite.sql"],
    ["../docs/src/content/docs/storage/postgresql.md", "../examples/storage/postgresql.sql"],
    ["../docs/src/content/docs/storage/mysql.md", "../examples/storage/mysql.sql"],
    ["../docs/src/content/docs/storage/mongodb.md", "../examples/storage/mongodb.js"],
  ];
  for (const [doc, file] of pairs) {
    assert.ok((await read(doc)).includes((await read(file)).trim()), `${doc} is out of date with ${file}`);
  }
});

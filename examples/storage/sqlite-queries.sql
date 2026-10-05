-- Named queries for examples/storage/sqlite.sql (SQLite and Cloudflare D1).
-- Every read uses an index; none scans aecs_messages. test/storage.test.mjs runs each one.
-- Parameters are positional (?1, ?2 …) so they work with D1's .bind() and node:sqlite.

-- name: insert_message
-- Idempotent: storing the same message twice is a no-op. Follow it directly with upsert_thread.
INSERT INTO aecs_messages (
  mailbox_id, message_key, message_id, thread_key, thread_id, ts, date, from_email, from_name,
  subject, in_reply_to, forai, attachment_count, size_bytes, clean_fallback, spec_version,
  processed_at, blob_prefix, x_fields
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
ON CONFLICT (mailbox_id, message_key) DO NOTHING;

-- name: insert_body
INSERT INTO aecs_bodies (mailbox_id, message_key, text, clean) VALUES (?1, ?2, ?3, ?4)
ON CONFLICT (mailbox_id, message_key) DO NOTHING;

-- name: insert_address
INSERT INTO aecs_addresses (mailbox_id, message_key, role, email, name, ts, thread_key)
VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
ON CONFLICT DO NOTHING;

-- name: insert_reference
INSERT INTO aecs_references (mailbox_id, message_key, position, ref_id) VALUES (?1, ?2, ?3, ?4)
ON CONFLICT DO NOTHING;

-- name: insert_attachment
INSERT INTO aecs_attachments (
  mailbox_id, message_key, idx, attachment_id, filename, content_type, size, cid, blob_key, extracted_text
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
ON CONFLICT DO NOTHING;

-- name: insert_search
-- The search row shares the message row's rowid, so re-storing replaces it instead of
-- adding a duplicate. Params: mailbox_id, message_key, clean body
INSERT OR REPLACE INTO aecs_search (rowid, mailbox_id, message_key, subject, body)
SELECT rowid, mailbox_id, message_key, subject, ?3 FROM aecs_messages
WHERE mailbox_id = ?1 AND message_key = ?2;

-- name: upsert_thread
-- Run immediately after insert_message, in the same batch or transaction. The
-- "WHERE changes() = 1" guard makes it a no-op when the message was already stored, so
-- re-delivering a message never double-counts it. That lets the whole store be one
-- D1 batch() with no application-side branching.
-- Params: mailbox_id, thread_key, thread_id, subject, ts, message_key
INSERT INTO aecs_threads (mailbox_id, thread_key, thread_id, subject, first_ts, last_ts, message_count, last_message_key)
SELECT ?1, ?2, ?3, ?4, ?5, ?5, 1, ?6 WHERE changes() = 1
ON CONFLICT (mailbox_id, thread_key) DO UPDATE SET
  message_count    = message_count + 1,
  subject          = CASE WHEN excluded.first_ts < first_ts THEN excluded.subject ELSE subject END,
  first_ts         = MIN(first_ts, excluded.first_ts),
  last_message_key = CASE WHEN excluded.last_ts >= last_ts THEN excluded.last_message_key ELSE last_message_key END,
  last_ts          = MAX(last_ts, excluded.last_ts);

-- name: thread_context
-- The last N messages of a thread, oldest first, with thread.position computed at read
-- time (AECS-1 §4.4). This is what you hand to an LLM. Params: mailbox_id, thread_key, N
SELECT message_id, from_email, from_name, date, ts, forai,
       (SELECT COUNT(*) FROM aecs_messages p
         WHERE p.mailbox_id = m.mailbox_id AND p.thread_key = m.thread_key
           AND (p.ts < m.ts OR (p.ts = m.ts AND p.message_key < m.message_key))) AS position
FROM (
  SELECT * FROM aecs_messages
  WHERE mailbox_id = ?1 AND thread_key = ?2
  ORDER BY ts DESC, message_key DESC
  LIMIT ?3
) AS m
ORDER BY ts ASC, message_key ASC;

-- name: inbox_first_page
-- Params: mailbox_id, page size
SELECT message_key, message_id, thread_key, ts, from_email, from_name, subject, attachment_count
FROM aecs_messages
WHERE mailbox_id = ?1
ORDER BY ts DESC, message_key DESC
LIMIT ?2;

-- name: inbox_next_page
-- Keyset pagination: pass the (ts, message_key) of the last row of the previous page.
-- Stable under concurrent inserts, and never uses OFFSET. Params: mailbox_id, last_ts, last_key, page size
SELECT message_key, message_id, thread_key, ts, from_email, from_name, subject, attachment_count
FROM aecs_messages
WHERE mailbox_id = ?1 AND (ts, message_key) < (?2, ?3)
ORDER BY ts DESC, message_key DESC
LIMIT ?4;

-- name: threads_recent
-- Conversation list. Params: mailbox_id, page size
SELECT thread_key, thread_id, subject, first_ts, last_ts, message_count, last_message_key
FROM aecs_threads
WHERE mailbox_id = ?1
ORDER BY last_ts DESC
LIMIT ?2;

-- name: messages_with_participant
-- Every message to, from or copied to one address, newest first. Params: mailbox_id, email (lowercased), page size
SELECT m.message_key, m.message_id, m.thread_key, m.ts, m.from_email, m.subject, a.role
FROM aecs_addresses AS a
JOIN aecs_messages AS m ON m.mailbox_id = a.mailbox_id AND m.message_key = a.message_key
WHERE a.mailbox_id = ?1 AND a.email = ?2
ORDER BY a.ts DESC
LIMIT ?3;

-- name: message_by_id
-- Look up by Message-ID: hash it first (sha256Hex in to-rows.mjs). Params: mailbox_id, message_key
SELECT m.*, b.text, b.clean
FROM aecs_messages AS m
LEFT JOIN aecs_bodies AS b ON b.mailbox_id = m.mailbox_id AND b.message_key = m.message_key
WHERE m.mailbox_id = ?1 AND m.message_key = ?2;

-- name: replies_to
-- Stored messages whose References include a Message-ID. Params: mailbox_id, Message-ID
SELECT DISTINCT m.message_id, m.ts, m.from_email
FROM aecs_references AS r
JOIN aecs_messages AS m ON m.mailbox_id = r.mailbox_id AND m.message_key = r.message_key
WHERE r.mailbox_id = ?1 AND r.ref_id = ?2
ORDER BY m.ts;

-- name: search
-- Full-text search, best match first. Params: mailbox_id, FTS5 query, page size
SELECT m.message_id, m.thread_key, m.ts, m.subject, snippet(aecs_search, 3, '[', ']', '…', 12) AS snippet
FROM aecs_search AS s
JOIN aecs_messages AS m ON m.rowid = s.rowid
WHERE aecs_search MATCH ?2 AND m.mailbox_id = ?1
ORDER BY rank
LIMIT ?3;

-- name: stale_spec_version
-- Rows normalized under an older spec version (for example before AECS-1 1.1 changed
-- cleanup). Re-parse them from <blob_prefix>raw.eml. Params: mailbox_id, current version, batch size
SELECT message_key, blob_prefix, spec_version
FROM aecs_messages
WHERE mailbox_id = ?1 AND spec_version <> ?2
LIMIT ?3;

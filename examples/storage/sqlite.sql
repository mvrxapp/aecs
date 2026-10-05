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

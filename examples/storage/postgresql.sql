-- AECS storage schema for PostgreSQL 13+ (AECS-1 Appendix C).
-- Same tables and keys as sqlite.sql; rows come from examples/storage/to-rows.mjs.
-- Keep raw.eml, body.html and attachment bytes in object storage (S3, R2, GCS) under blob_prefix.

CREATE TABLE IF NOT EXISTS aecs_messages (
  mailbox_id       text     NOT NULL,
  message_key      char(64) NOT NULL,           -- sha256(messageId), lowercase hex
  message_id       text     NOT NULL,
  thread_key       char(64) NOT NULL,           -- sha256(threadId)
  thread_id        text     NOT NULL,
  ts               bigint   NOT NULL,           -- metadata.timestamp, or processedAt when null (sort key only)
  date             timestamptz,                 -- metadata.date (true value, may be null)
  from_email       text     NOT NULL,           -- lowercased
  from_name        text,
  subject          text,
  in_reply_to      text,
  forai            text,                        -- content.forAI
  attachment_count smallint NOT NULL DEFAULT 0,
  size_bytes       integer,
  clean_fallback   boolean  NOT NULL DEFAULT false,
  spec_version     text     NOT NULL,
  processed_at     timestamptz NOT NULL,
  blob_prefix      text,
  x_fields         jsonb,
  PRIMARY KEY (mailbox_id, message_key)
);

CREATE INDEX IF NOT EXISTS aecs_messages_thread ON aecs_messages (mailbox_id, thread_key, ts, message_key);
CREATE INDEX IF NOT EXISTS aecs_messages_inbox  ON aecs_messages (mailbox_id, ts DESC, message_key DESC);

CREATE TABLE IF NOT EXISTS aecs_bodies (
  mailbox_id  text     NOT NULL,
  message_key char(64) NOT NULL,
  text        text,
  clean       text,
  -- Full-text search over the cleaned body. 'simple' avoids language-specific stemming;
  -- use a language config (e.g. 'english') if your mail is mostly one language.
  search      tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(clean, ''))) STORED,
  PRIMARY KEY (mailbox_id, message_key),
  FOREIGN KEY (mailbox_id, message_key) REFERENCES aecs_messages ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS aecs_bodies_search ON aecs_bodies USING gin (search);

CREATE TABLE IF NOT EXISTS aecs_addresses (
  mailbox_id  text     NOT NULL,
  message_key char(64) NOT NULL,
  role        text     NOT NULL CHECK (role IN ('from', 'to', 'cc', 'bcc')),
  email       text     NOT NULL,
  name        text,
  ts          bigint   NOT NULL,
  thread_key  char(64) NOT NULL,
  PRIMARY KEY (mailbox_id, message_key, role, email),
  FOREIGN KEY (mailbox_id, message_key) REFERENCES aecs_messages ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS aecs_addresses_email ON aecs_addresses (mailbox_id, email, ts DESC);

CREATE TABLE IF NOT EXISTS aecs_references (
  mailbox_id  text     NOT NULL,
  message_key char(64) NOT NULL,
  position    smallint NOT NULL,
  ref_id      text     NOT NULL,
  PRIMARY KEY (mailbox_id, message_key, position),
  FOREIGN KEY (mailbox_id, message_key) REFERENCES aecs_messages ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS aecs_references_ref ON aecs_references (mailbox_id, ref_id);

CREATE TABLE IF NOT EXISTS aecs_threads (
  mailbox_id       text     NOT NULL,
  thread_key       char(64) NOT NULL,
  thread_id        text     NOT NULL,
  subject          text,
  first_ts         bigint   NOT NULL,
  last_ts          bigint   NOT NULL,
  message_count    integer  NOT NULL DEFAULT 0,
  last_message_key char(64) NOT NULL,
  PRIMARY KEY (mailbox_id, thread_key)
);

CREATE INDEX IF NOT EXISTS aecs_threads_recent ON aecs_threads (mailbox_id, last_ts DESC);

CREATE TABLE IF NOT EXISTS aecs_attachments (
  mailbox_id     text     NOT NULL,
  message_key    char(64) NOT NULL,
  idx            smallint NOT NULL,
  attachment_id  text     NOT NULL,
  filename       text     NOT NULL,
  content_type   text     NOT NULL,
  size           integer  NOT NULL,
  cid            text,
  blob_key       text,
  extracted_text text,
  PRIMARY KEY (mailbox_id, message_key, idx),
  FOREIGN KEY (mailbox_id, message_key) REFERENCES aecs_messages ON DELETE CASCADE
);

-- Optional semantic search with pgvector. Embed content.forAI; set the dimension to your model's.
-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE TABLE IF NOT EXISTS aecs_embeddings (
--   mailbox_id  text     NOT NULL,
--   message_key char(64) NOT NULL,
--   thread_key  char(64) NOT NULL,
--   ts          bigint   NOT NULL,
--   embedding   vector(1024) NOT NULL,
--   PRIMARY KEY (mailbox_id, message_key),
--   FOREIGN KEY (mailbox_id, message_key) REFERENCES aecs_messages ON DELETE CASCADE
-- );
-- CREATE INDEX IF NOT EXISTS aecs_embeddings_hnsw ON aecs_embeddings USING hnsw (embedding vector_cosine_ops);

-- ── Queries ───────────────────────────────────────────────────────────────────────────

-- Store (one transaction per message; run the thread upsert only if the message row was new):
--   INSERT INTO aecs_messages (...) VALUES (...) ON CONFLICT DO NOTHING RETURNING message_key;
--   INSERT INTO aecs_threads (mailbox_id, thread_key, thread_id, subject, first_ts, last_ts, message_count, last_message_key)
--   VALUES ($1, $2, $3, $4, $5, $5, 1, $6)
--   ON CONFLICT (mailbox_id, thread_key) DO UPDATE SET
--     message_count    = aecs_threads.message_count + 1,
--     subject          = CASE WHEN EXCLUDED.first_ts < aecs_threads.first_ts THEN EXCLUDED.subject ELSE aecs_threads.subject END,
--     first_ts         = LEAST(aecs_threads.first_ts, EXCLUDED.first_ts),
--     last_message_key = CASE WHEN EXCLUDED.last_ts >= aecs_threads.last_ts THEN EXCLUDED.last_message_key ELSE aecs_threads.last_message_key END,
--     last_ts          = GREATEST(aecs_threads.last_ts, EXCLUDED.last_ts);

-- Thread context for an LLM: last N messages, oldest first, position computed at read time.
--   SELECT * FROM (
--     SELECT message_id, from_email, date, ts, message_key, forai,
--            count(*) OVER (ORDER BY ts, message_key ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) - 1 AS position
--     FROM aecs_messages WHERE mailbox_id = $1 AND thread_key = $2
--   ) t ORDER BY ts DESC, message_key DESC LIMIT $3;          -- reverse in the application

-- Inbox, keyset pagination:
--   SELECT message_key, message_id, thread_key, ts, from_email, from_name, subject
--   FROM aecs_messages
--   WHERE mailbox_id = $1 AND (ts, message_key) < ($2, $3)
--   ORDER BY ts DESC, message_key DESC LIMIT $4;

-- Full-text search:
--   SELECT m.message_id, m.subject, ts_rank(b.search, q) AS rank
--   FROM aecs_bodies b JOIN aecs_messages m USING (mailbox_id, message_key),
--        websearch_to_tsquery('simple', $2) q
--   WHERE b.mailbox_id = $1 AND b.search @@ q
--   ORDER BY rank DESC LIMIT $3;

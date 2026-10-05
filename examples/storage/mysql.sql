-- AECS storage schema for MySQL 8.0.19+ / InnoDB (AECS-1 Appendix C).
-- Same tables and keys as sqlite.sql; rows come from examples/storage/to-rows.mjs.
-- Keys are CHAR(64) ASCII hashes: raw Message-IDs can be up to 998 bytes, which would not
-- fit InnoDB's 3072-byte index key limit as utf8mb4. Bodies go in TEXT columns, so the
-- 65,535-byte row limit is not a concern; keep raw.eml and body.html in object storage.

CREATE TABLE IF NOT EXISTS aecs_messages (
  mailbox_id       VARCHAR(191) CHARACTER SET ascii NOT NULL,
  message_key      CHAR(64)     CHARACTER SET ascii NOT NULL,  -- sha256(messageId)
  message_id       VARCHAR(998) NOT NULL,
  thread_key       CHAR(64)     CHARACTER SET ascii NOT NULL,  -- sha256(threadId)
  thread_id        VARCHAR(998) NOT NULL,
  ts               BIGINT       NOT NULL,                      -- metadata.timestamp, or processedAt when null
  date             DATETIME,                                   -- metadata.date in UTC (may be null)
  from_email       VARCHAR(320) NOT NULL,                      -- lowercased
  from_name        VARCHAR(998),
  subject          TEXT,
  in_reply_to      VARCHAR(998),
  forai            MEDIUMTEXT,                                 -- content.forAI
  attachment_count SMALLINT     NOT NULL DEFAULT 0,
  size_bytes       INT,
  clean_fallback   BOOLEAN      NOT NULL DEFAULT FALSE,
  spec_version     VARCHAR(16)  NOT NULL,
  processed_at     DATETIME     NOT NULL,
  blob_prefix      VARCHAR(255),
  x_fields         JSON,
  PRIMARY KEY (mailbox_id, message_key),
  KEY aecs_messages_thread (mailbox_id, thread_key, ts, message_key),
  KEY aecs_messages_inbox  (mailbox_id, ts DESC, message_key DESC)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS aecs_bodies (
  mailbox_id  VARCHAR(191) CHARACTER SET ascii NOT NULL,
  message_key CHAR(64)     CHARACTER SET ascii NOT NULL,
  text        MEDIUMTEXT,
  clean       MEDIUMTEXT,
  PRIMARY KEY (mailbox_id, message_key),
  FULLTEXT KEY aecs_bodies_search (clean),
  CONSTRAINT aecs_bodies_msg FOREIGN KEY (mailbox_id, message_key)
    REFERENCES aecs_messages (mailbox_id, message_key) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS aecs_addresses (
  mailbox_id  VARCHAR(191) CHARACTER SET ascii NOT NULL,
  message_key CHAR(64)     CHARACTER SET ascii NOT NULL,
  role        ENUM('from', 'to', 'cc', 'bcc') NOT NULL,
  email       VARCHAR(320) NOT NULL,
  name        VARCHAR(998),
  ts          BIGINT       NOT NULL,
  thread_key  CHAR(64)     CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (mailbox_id, message_key, role, email),
  KEY aecs_addresses_email (mailbox_id, email, ts DESC),
  CONSTRAINT aecs_addresses_msg FOREIGN KEY (mailbox_id, message_key)
    REFERENCES aecs_messages (mailbox_id, message_key) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS aecs_references (
  mailbox_id  VARCHAR(191) CHARACTER SET ascii NOT NULL,
  message_key CHAR(64)     CHARACTER SET ascii NOT NULL,
  position    SMALLINT     NOT NULL,
  ref_id      VARCHAR(998) CHARACTER SET ascii NOT NULL,
  ref_key     CHAR(64)     CHARACTER SET ascii NOT NULL,       -- sha256(ref_id): indexable stand-in for ref_id
  PRIMARY KEY (mailbox_id, message_key, position),
  KEY aecs_references_ref (mailbox_id, ref_key),
  CONSTRAINT aecs_references_msg FOREIGN KEY (mailbox_id, message_key)
    REFERENCES aecs_messages (mailbox_id, message_key) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;

CREATE TABLE IF NOT EXISTS aecs_threads (
  mailbox_id       VARCHAR(191) CHARACTER SET ascii NOT NULL,
  thread_key       CHAR(64)     CHARACTER SET ascii NOT NULL,
  thread_id        VARCHAR(998) NOT NULL,
  subject          TEXT,
  first_ts         BIGINT       NOT NULL,
  last_ts          BIGINT       NOT NULL,
  message_count    INT          NOT NULL DEFAULT 0,
  last_message_key CHAR(64)     CHARACTER SET ascii NOT NULL,
  PRIMARY KEY (mailbox_id, thread_key),
  KEY aecs_threads_recent (mailbox_id, last_ts DESC)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS aecs_attachments (
  mailbox_id     VARCHAR(191) CHARACTER SET ascii NOT NULL,
  message_key    CHAR(64)     CHARACTER SET ascii NOT NULL,
  idx            SMALLINT     NOT NULL,
  attachment_id  VARCHAR(1010) NOT NULL,
  filename       VARCHAR(1024) NOT NULL,
  content_type   VARCHAR(255) NOT NULL,
  size           INT          NOT NULL,
  cid            VARCHAR(998),
  blob_key       VARCHAR(255),
  extracted_text MEDIUMTEXT,
  PRIMARY KEY (mailbox_id, message_key, idx),
  CONSTRAINT aecs_attachments_msg FOREIGN KEY (mailbox_id, message_key)
    REFERENCES aecs_messages (mailbox_id, message_key) ON DELETE CASCADE
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_ai_ci;

-- ── Queries ───────────────────────────────────────────────────────────────────────────

-- Store: INSERT IGNORE INTO aecs_messages (...) VALUES (...);  then, only if ROW_COUNT() = 1:
--   INSERT INTO aecs_threads (mailbox_id, thread_key, thread_id, subject, first_ts, last_ts, message_count, last_message_key)
--   VALUES (?, ?, ?, ?, ?, ?, 1, ?) AS new
--   ON DUPLICATE KEY UPDATE
--     message_count    = aecs_threads.message_count + 1,
--     subject          = IF(new.first_ts < aecs_threads.first_ts, new.subject, aecs_threads.subject),
--     last_message_key = IF(new.last_ts >= aecs_threads.last_ts, new.last_message_key, aecs_threads.last_message_key),
--     first_ts         = LEAST(aecs_threads.first_ts, new.first_ts),
--     last_ts          = GREATEST(aecs_threads.last_ts, new.last_ts);
-- MySQL applies these assignments left to right, so the columns that compare against the
-- old first_ts/last_ts are listed before first_ts/last_ts themselves.

-- Inbox, keyset pagination (expanded form, which MySQL plans as an index range):
--   SELECT message_key, message_id, thread_key, ts, from_email, from_name, subject
--   FROM aecs_messages
--   WHERE mailbox_id = ? AND (ts < ? OR (ts = ? AND message_key < ?))
--   ORDER BY ts DESC, message_key DESC LIMIT ?;

-- Thread context for an LLM (last N, reverse in the application; position = ROW_NUMBER() - 1):
--   SELECT * FROM (
--     SELECT message_id, from_email, date, ts, message_key, forai,
--            ROW_NUMBER() OVER (ORDER BY ts, message_key) - 1 AS position
--     FROM aecs_messages WHERE mailbox_id = ? AND thread_key = ?
--   ) t ORDER BY ts DESC, message_key DESC LIMIT ?;

-- Full-text search:
--   SELECT m.message_id, m.subject, MATCH(b.clean) AGAINST (? IN NATURAL LANGUAGE MODE) AS score
--   FROM aecs_bodies b JOIN aecs_messages m USING (mailbox_id, message_key)
--   WHERE b.mailbox_id = ? AND MATCH(b.clean) AGAINST (? IN NATURAL LANGUAGE MODE)
--   ORDER BY score DESC LIMIT ?;

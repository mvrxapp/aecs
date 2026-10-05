---
title: "3. Core API"
---


### 3.1 `parse(source, options?)`

The primary entry point. Accepts a Cloudflare `ForwardableEmailMessage`, a raw RFC 5322 string, or a `ReadableStream<Uint8Array>`.

```typescript
function parse(
  source: ForwardableEmailMessage | ReadableStream<Uint8Array> | string,
  options?: ParseOptions
): Promise<NormalizedEmail>
```

Returns a `NormalizedEmail` object (AECS-1 schema). All fields are populated where source data permits; unavailable fields are `null`.

---

### 3.2 `NormalizedEmail`

```typescript
interface NormalizedEmail {
  messageId: string;
  threadId: string;

  metadata: {
    from:      Address;
    to:        Address[];
    cc:        Address[];
    bcc:       Address[];
    subject:   string | null;
    date:      string | null;    // ISO 8601 UTC; null if Date header absent/unparseable (AECS-1 §6)
    timestamp: number | null;    // Unix epoch seconds; null under the same condition as date
  };

  content: {
    rawFull: string | null;      // complete RFC 5322 message
    raw:     string | null;      // body only, quoted history present
    html:    string | null;      // HTML part of latest content
    text:    string | null;      // plain text of latest content
    clean:   string | null;      // quotes and signatures stripped; authored lines always kept (AECS-1 §4.3.1)
    forAI:   string | null;      // LLM-optimised (see Section 4)
  };

  thread: {
    position:  number | null;    // 0 = earliest by metadata.timestamp; null until thread-reconciled (see §5.2)
    inReplyTo: string | null;
    references: string[];
  };

  attachments: Attachment[];

  processing: {
    processedAt:      string;             // ISO 8601 UTC
    specVersion:      string;             // "1.1"
    cleanFallback?:   boolean;            // true when clean fell back to text (AECS-1 §4.3.1 rule 6)
    attachmentErrors: AttachmentError[];  // non-fatal errors during onAttachment
  };
}

interface Address {
  name:  string | null;
  email: string;
}

interface AttachmentError {
  filename: string;
  message:  string;   // plain error message — not a native Error (must stay JSON-serializable)
}

interface Attachment {
  id:          string;               // stable within-message id: `${messageId}:${index}` (0-based MIME order)
  filename:    string;
  contentType: string;
  size:        number;               // bytes
  cid:         string | null;        // content-ID for inline attachments
  content():   Promise<Uint8Array>;  // lazy — not loaded until called
  extractedText?: string | null;     // populated by AI processor if used
  blobKey?:    string | null;        // BlobStore key, populated by processors.storeToR2
}
```

`Attachment` is a TypeScript runtime type, not identical to AECS-1 [§4.5](/aecs/specs/aecs-1/06-field-definitions/#45-attachments)'s JSON `attachments[]`
element — it's a superset for SDK ergonomics. When a `NormalizedEmail` is serialized to the
AECS-1 JSON wire form (stored, sent over the network, hashed, etc.), only the fields AECS-1
[§4.5](/aecs/specs/aecs-1/06-field-definitions/#45-attachments) defines are part of that form: `id` (promoted into AECS-1 [§4.5](/aecs/specs/aecs-1/06-field-definitions/#45-attachments) as an optional field —
see below), `filename`, `contentType`, `size`, `cid`. `content()` (a function — never
JSON-serializable), `blobKey` (meaningful only relative to whichever `BlobStore` you
configured), and `extractedText` (an SDK attachment-processing feature, [§9](/aecs/specs/aecs-sdk-1/09-attachment-handling/)) are SDK-runtime
fields that exist on the TypeScript object but are not part of the AECS-1 core schema. This
keeps `Attachment.id` compliant with AECS-1 [§9](/aecs/specs/aecs-1/11-extensibility/)'s extensibility rule (custom fields MUST be
`x_`-namespaced) without requiring `x_` prefixes on fields that are broadly useful enough to
belong in the core spec, while fields that are genuinely SDK/backend-specific stay out of the
wire format instead of being smuggled in unprefixed.

The wire form itself is validated by [`specs/schema/normalized-email.schema.json`](./schema/normalized-email.schema.json)
(JSON Schema, draft 2020-12) — useful for confirming `d1Store`/`getThread`/`getMessage`
output, or any other producer, actually matches AECS-1 before debugging further downstream.

---

### 3.3 `EmailThread`

```typescript
class EmailThread {
  readonly threadId: string;
  readonly messages: NormalizedEmail[];  // sorted by timestamp ascending

  static from(emails: NormalizedEmail[]): EmailThread;

  get root(): NormalizedEmail;           // first message
  get latest(): NormalizedEmail;         // most recent
  get participants(): Address[];         // unique across thread

  forAI(options?: ThreadForAIOptions): string;
}
```

```typescript
const thread = EmailThread.from(messages);
const context = thread.forAI({ maxMessages: 10, maxCharsPerMessage: 2000 });
// "Alice (2026-06-29 09:00 UTC): Hi Bob, checking in.\n\nBob (2026-06-29 14:32 UTC): Looks good, let's go."
```

---

### 3.4 `ParseOptions`

```typescript
interface ParseOptions {
  maxBodyBytes?:     number;                              // default: 1_000_000
  forAIMaxChars?:    number;                              // default: 8_000
  cleaner?:          (text: string) => string | Promise<string>;
  wrapper?:          ForAIWrapper;
  onAttachment?:     AttachmentHandler;
  threadIdResolver?: (headers: RawHeaders) => string;
  specVersion?:      string;
}
```

---

### 3.5 `EmailTransport`

> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

Abstracts the outbound delivery layer so the SDK is not tied to the CF `SendEmail` binding.

```typescript
interface OutboundEmail {
  from:         Address;
  to:           Address[];
  cc?:          Address[];
  bcc?:         Address[];
  subject:      string;
  text?:        string;
  html?:        string;
  inReplyTo?:   string;            // Message-ID of parent
  references?:  string[];          // full References chain
  attachments?: OutboundAttachment[];
  headers?:     Record<string, string>;
}

interface OutboundAttachment {
  filename:    string;
  contentType: string;
  content:     Uint8Array | string;   // string = base64
  cid?:        string;                // content-ID for inline images
}

interface EmailTransport {
  send(message: OutboundEmail): Promise<{ messageId: string }>;
}
```

Pre-built transports ship in `@mvrx/mail/transports`:

```typescript
import { cfTransport, smtpTransport } from "@mvrx/mail/transports";

// Cloudflare Email Service binding (Workers only)
const transport = cfTransport(env.EMAIL);

// SMTP — Node.js, Bun, Deno; also works with CF Email Service via smtp.mx.cloudflare.net:587
const transport = smtpTransport({
  host: "smtp.mx.cloudflare.net",
  port: 587,
  auth: { user: "your@domain.com", pass: env.SMTP_PASS },
});
```

---

### 3.6 `sendEmail(message, transport)`

> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

Standalone outbound send for forwarding, rule-triggered delivery, and programmatic sends without the compose layer.

```typescript
function sendEmail(
  message:   OutboundEmail,
  transport: EmailTransport
): Promise<{ messageId: string }>
```

```typescript
import { sendEmail } from "@mvrx/mail";
import { cfTransport } from "@mvrx/mail/transports";

await sendEmail(
  {
    from:       { name: "Support", email: "support@example.com" },
    to:         [email.metadata.from],
    subject:    `Re: ${email.metadata.subject}`,
    text:       "Thanks for reaching out — we'll reply within 24 hours.",
    inReplyTo:  email.messageId,
    references: [...email.thread.references, email.messageId],
  },
  cfTransport(env.EMAIL)
);
```

---

### 3.7 Storage — `d1Init` + `d1Store`

> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

Helpers for persisting `NormalizedEmail` objects to D1. The schema is fixed and deterministic — columns are documented below so you can query the tables directly without going through the SDK.

```typescript
// Create tables — idempotent, safe to call on every Worker startup
function d1Init(db: D1Database): Promise<void>

// Insert or update a message (upserts thread row, inserts attachment rows)
function d1Store(db: D1Database, email: NormalizedEmail): Promise<void>
```

**D1 schema created by `d1Init()`:** the tables in
[`examples/storage/sqlite.sql`](https://github.com/mvrxapp/aecs/blob/main/examples/storage/sqlite.sql),
which follow [AECS-1 Appendix C](/aecs/specs/aecs-1/15-appendix-c-storage-and-indexing-informative/) (storage and indexing). `d1Store()` writes the rows
produced by [`examples/storage/to-rows.mjs`](https://github.com/mvrxapp/aecs/blob/main/examples/storage/to-rows.mjs)
with the statements in [`examples/storage/sqlite-queries.sql`](https://github.com/mvrxapp/aecs/blob/main/examples/storage/sqlite-queries.sql).
Both files are run by the reference implementation's test suite.

| Table | Tier | Holds |
|---|---|---|
| `aecs_messages` | Hot | One small row per message: IDs, hashed keys, sender, subject, dates, `forai`, attachment count, `spec_version`, `clean_fallback`, `blob_prefix`, `x_fields` |
| `aecs_bodies` | Warm | `text` and `clean`, read when one message is opened |
| `aecs_addresses` | Derived | One row per from/to/cc/bcc address, indexed by `(email, ts)` |
| `aecs_references` | Derived | One row per `thread.references` entry, indexed by `ref_id` |
| `aecs_threads` | Derived | One summary row per thread: subject, first/last timestamp, count, last message |
| `aecs_attachments` | Derived | Attachment metadata and `blob_key` |
| `aecs_search` | Optional | FTS5 index over subject and clean body |
| R2 (`BlobStore`) | Cold | `raw.eml` (`content.rawFull`), `body.html` (`content.html`), attachment bytes, under `blob_prefix` |

Every table is keyed by `(mailbox_id, message_key)`, where `message_key` is the lowercase hex
SHA-256 of `messageId` (`thread_key` likewise for `threadId`). `thread.position` has no
column: per [§5.2](/aecs/specs/aecs-sdk-1/05-threading/#52-position), it is a property of a query result, not of a stored row, and
`getThread()` computes it at read time. The `ts` sort column is `NOT NULL`; when
`metadata.timestamp` is `null` (AECS-1 [§6](/aecs/specs/aecs-1/08-timestamps/)), `d1Store()` uses `processing.processedAt` for this column
only, and the true value stays in `date`.

`d1Store()` is idempotent: the message insert is "insert if absent", and the thread
summary is updated only when that insert created a row. Blobs are written to R2 before the
D1 batch, so a row never points at a missing blob. Run `d1Init()` as a migration
(`wrangler d1 migrations apply`), not on every request: re-running `CREATE INDEX` on the hot
path costs writes.

---

### 3.8 Query API

> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

```typescript
import { getThread, getMessage, listMessages } from "@mvrx/mail";

// All messages in a thread, sorted by timestamp ascending
function getThread(db: D1Database, threadId: string): Promise<NormalizedEmail[]>

// Single message by Message-ID
function getMessage(db: D1Database, messageId: string): Promise<NormalizedEmail | null>

// Paginated message list — cursor-based, stable under concurrent inserts
function listMessages(
  db:       D1Database,
  options?: ListMessagesOptions
): Promise<MessagePage>

interface ListMessagesOptions {
  cursor?:   string;          // opaque cursor from a previous page's nextCursor
  limit?:    number;          // default: 50, max: 100
  from?:     string;          // filter by exact sender email
  threadId?: string;          // restrict to one thread
  since?:    number;          // Unix timestamp lower bound (inclusive)
  until?:    number;          // Unix timestamp upper bound (exclusive)
  order?:    "asc" | "desc"; // default: "desc" (newest first)
}

interface MessagePage {
  messages:   NormalizedEmail[];
  nextCursor: string | null;  // null = this is the last page
}
```

All three functions return objects reconstructed from the [§3.7](/aecs/specs/aecs-sdk-1/03-core-api/#37-storage--d1init--d1store) schema — every AECS-1 field
is populated except `content.rawFull` and `content.html` (fetch them from your `BlobStore`
at `<blob_prefix>raw.eml` and `<blob_prefix>body.html` if you need them). `listMessages()`
reads only the hot `aecs_messages` row, so its results carry `content.forAI` but not
`text`/`clean`; `getMessage()` and `getThread()` also read `aecs_bodies`. `thread.position` specifically: `getThread()` populates it (it has every
message in the thread, per [§5.2](/aecs/specs/aecs-sdk-1/05-threading/#52-position)); `getMessage()` and `listMessages()` always return
`thread.position: null`, because a single-row lookup or an arbitrary page of messages from
different threads doesn't have each message's siblings available to compute it against.

```typescript
// Paginate the inbox, newest first
const page1 = await listMessages(env.DB, { limit: 25 });
const page2 = await listMessages(env.DB, { limit: 25, cursor: page1.nextCursor });

// Load a full thread and build an AI-ready context string
const messages = await getThread(env.DB, email.threadId);
const thread   = EmailThread.from(messages);
const context  = thread.forAI({ maxMessages: 20 });
```

---

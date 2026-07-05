---
title: "2. Installation & Setup"
---


### 2.1 Install

```bash
npm install @mvrx/mail
# or
pnpm add @mvrx/mail
```

### 2.2 Cloudflare Workers — Full Setup

> **Note:** this shows the full target setup. Today only the parse core is implemented —
> the bindings below for storage (`DB`, `BLOBS`), outbound send (`EMAIL`), AI, the hub,
> and credential caching serve roadmap modules (see the Implementation Status note above).

The SDK integrates natively with every Cloudflare service used in an email platform. Configure `wrangler.jsonc` with the bindings you need:

```jsonc
{
  "name": "my-mail-worker",
  "main": "src/index.ts",
  "compatibility_date": "2025-06-01",
  "compatibility_flags": ["nodejs_compat"],

  // Outbound email — Workers Paid required
  "send_email": [{ "name": "EMAIL" }],

  // Message + thread storage
  "d1_databases": [{ "binding": "DB", "database_name": "mail", "database_id": "<id>" }],

  // Raw email + attachment storage (zero egress fees)
  "r2_buckets": [{ "binding": "BLOBS", "bucket_name": "mail-blobs" }],

  // Session cache, credential cache, hot-path KV
  "kv_namespaces": [{ "binding": "CACHE", "id": "<id>" }],

  // Real-time SSE fan-out — see §16.4 for the cost caveat vs. WebSocket hibernation
  "durable_objects": {
    "bindings": [{ "name": "HUB", "class_name": "UserHub" }]
  },

  // Workers AI — for built-in compose + classify tools
  "ai": { "binding": "AI" },

  // Async classification pipeline
  "queues": {
    "producers": [{ "binding": "CLASSIFY_Q", "queue": "mail-classify" }],
    "consumers": [{ "queue": "mail-classify", "max_batch_size": 10 }]
  }
}
```

**What each binding is used for:**

| Binding | SDK usage |
|---|---|
| `EMAIL` | `sendEmail()`, `compose.send()`, auto-replies |
| `DB` | Thread/message persistence via built-in D1 helpers |
| `BLOBS` | Raw email archival, attachment storage, sent-copy archival |
| `CACHE` | EAS credential caching, hot-path lookups |
| `HUB` | Real-time `new_message` / `rule_fired` events to connected clients |
| `AI` | Workers AI provider — classify, summarise, draft, improve |
| `CLASSIFY_Q` | Async spam/category classification without blocking ingest |

All bindings are optional — use only what your application needs.

### 2.3 Minimal Worker — Receive, Parse, Store

```typescript
import { parse, d1Store } from "@mvrx/mail";

interface Env {
  DB: D1Database;
  BLOBS: R2Bucket;
  AI: Ai;
  EMAIL: SendEmail;
}

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const email = await parse(message);

    // Attachment content is lazy (Attachment.content() — see §3.2) so it's cheap
    // to loop after parse() resolves, rather than wiring an onAttachment callback.
    for (const att of email.attachments) {
      const bytes = await att.content();
      await env.BLOBS.put(`att/${email.messageId}/${att.filename}`, bytes);
    }

    // Store to D1 using built-in schema helpers
    await d1Store(env.DB, email);
  },
};
```

### 2.4 Inbound via SMTP

CF Email Routing can also forward to verified email addresses — useful when not using Workers for processing. For Workers-based processing, use the `email()` handler as above. For SMTP submission of outbound mail from non-Workers environments, use `smtp.mx.cloudflare.net` on port 587 with your CF credentials.

---

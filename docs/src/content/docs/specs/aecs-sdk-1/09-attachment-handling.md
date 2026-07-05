---
title: "9. Attachment Handling"
---


### 9.1 Lazy Content Loading

Attachment bytes are not loaded during `parse()`. Call `content()` explicitly:

```typescript
for (const att of email.attachments) {
  if (att.size > 10 * 1024 * 1024) continue;      // skip > 10 MB

  const bytes = await att.content();
  await env.BLOBS.put(
    `att/${email.messageId}/${att.filename}`,
    bytes,
    { httpMetadata: { contentType: att.contentType } }
  );
}
```

### 9.2 `AttachmentHandler`

```typescript
type AttachmentHandler = (
  att: Attachment,
  ctx: { messageId: string }   // headers (incl. Message-ID) are parsed before attachments,
                                // so messageId is available here — the outer `email` binding is not
) => Promise<void> | void;
```

Process attachments automatically during parsing via `onAttachment`. The callback receives
a `ctx` argument rather than relying on the `email` returned by `parse()`, since that
binding doesn't exist yet while `parse()` is still running:

```typescript
const email = await parse(message, {
  onAttachment: async (att, { messageId }) => {
    const bytes = await att.content();
    await env.BLOBS.put(`att/${messageId}/${att.filename}`, bytes);
  },
});
// Errors in onAttachment do not fail the parse — collected in email.processing.attachmentErrors
```

### 9.3 Built-in CF Processor — Store to R2

> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`. (Sections [9.1](/aecs/specs/aecs-sdk-1/09-attachment-handling/#91-lazy-content-loading)–[9.2](/aecs/specs/aecs-sdk-1/09-attachment-handling/#92-attachmenthandler) above — lazy `content()` loading and the `onAttachment` callback — are implemented today; [9.3](/aecs/specs/aecs-sdk-1/09-attachment-handling/#93-built-in-cf-processor--store-to-r2)–[9.8](/aecs/specs/aecs-sdk-1/09-attachment-handling/#98-async-extraction-large-files-via-queue) below describe the planned attachment-processor pipeline.)

```typescript
import { processors } from "@mvrx/mail/attachments";

const email = await parse(message, {
  // Final key is `${keyPrefix}/${ctx.messageId}/${att.filename}` — storeToR2 receives
  // ctx internally (see AttachmentHandler, §9.2), so messageId never needs to be
  // interpolated by the caller.
  onAttachment: processors.storeToR2(env.BLOBS, {
    keyPrefix: "att",   // default: "att"
    // Returns a public or signed URL in att.url after storing
    publicUrl: (key) => `https://cdn.example.com/${key}`,
  }),
});

// att.blobKey is set to the stored key for every attachment that was written
for (const att of email.attachments) {
  console.log(att.blobKey);   // "att/<messageId>/invoice.pdf"
}
```

### 9.4 AI-Powered Attachment Processors

Extract meaning from attachment content using Workers AI or any `AiProvider`:

```typescript
import { processors } from "@mvrx/mail/attachments";

const ai = cfProvider(env.AI);

const email = await parse(message, {
  onAttachment: processors.chain(
    // 1. Store to R2 — key is `att/<messageId>/<filename>`, namespaced internally (§9.3)
    processors.storeToR2(env.BLOBS, { keyPrefix: "att" }),

    // 2. Extract text from PDFs
    processors.pdfToText({
      // Runs CF Workers AI document intelligence, or provide your own extractor
      extractor: processors.cfPdfExtractor(env.AI),
    }),

    // 3. OCR images (PNG, JPG, WEBP, TIFF)
    processors.ocr({
      ai,
      model: "@cf/llava-hf/llava-1.5-7b-hf",   // CF vision model
      prompt: "Extract all text visible in this image.",
    }),

    // 4. Transcribe audio attachments (MP3, WAV, M4A)
    processors.transcribe({
      ai,
      model: "@cf/openai/whisper",
      language: "en",
    }),
  ),
});

// Extracted text is available on the attachment after processing
for (const att of email.attachments) {
  console.log(att.extractedText);  // null if processor didn't apply or failed
}
```

### 9.5 Custom Processor

```typescript
import type { AttachmentProcessor } from "@mvrx/mail/attachments";

const icalProcessor: AttachmentProcessor = {
  accepts: (att) => att.contentType === "text/calendar",
  process: async (att) => {
    const bytes = await att.content();
    const text = new TextDecoder().decode(bytes);
    att.extractedText = parseIcalSummary(text);
  },
};
```

---

### 9.6 `attachmentsForAI(attachments, options?)` — LLM Context Aggregator

Once processors have populated `att.extractedText`, this function aggregates all attachment text into a single LLM-ready string with proper delimiters and size bounds.

```typescript
import { attachmentsForAI } from "@mvrx/mail/attachments";

function attachmentsForAI(
  attachments: Attachment[],
  options?:   AttachmentsForAIOptions
): string | null   // null if no attachment has extractedText
```

```typescript
interface AttachmentsForAIOptions {
  /** Max characters per attachment. Default: 4_000. */
  maxCharsPerAttachment?: number;

  /** Max total characters across all attachments. Default: 16_000. */
  maxTotalChars?: number;

  /**
   * Wrap each attachment's text block. Default: wrappers.xml("attachment").
   * Set to null to disable wrapping.
   */
  wrapper?: ForAIWrapper | null;

  /**
   * Which content types to include. Accepts exact types or glob patterns.
   * Default: include all attachments that have extractedText set.
   * Example: ["application/pdf", "image/*", "audio/*"]
   */
  include?: string[];

  /**
   * Label format for each attachment block.
   * Default: (att) => att.filename
   */
  label?: (att: Attachment) => string;
}
```

**Default output format:**

```
<attachment name="invoice.pdf" type="application/pdf">
This invoice is issued to Acme Corp for services rendered...
[truncated — 4000 chars shown of 12483]
</attachment>

<attachment name="photo.jpg" type="image/jpeg">
Text visible in image: "Meeting Room B — Capacity 12 — Floor 3"
</attachment>
```

**Usage:**

```typescript
const email = await parse(message, {
  onAttachment: processors.chain(
    processors.storeToR2(env.BLOBS, { keyPrefix: "att" }),
    processors.pdfToText({ extractor: processors.cfPdfExtractor(env.AI) }),
    processors.ocr({ ai, model: "@cf/llava-hf/llava-1.5-7b-hf" }),
    processors.transcribe({ ai, model: "@cf/openai/whisper" }),
  ),
});

const attContext = attachmentsForAI(email.attachments);

const response = await ai.run(model, [
  { role: "system",  content: "You are a helpful assistant. Summarise the email and any attachments." },
  { role: "user",    content: `${email.content.forAI}\n\n${attContext ?? ""}`.trim() },
]);
```

---

### 9.7 Auto-Include Attachment Text in `content.forAI`

Set `attachmentsInForAI: true` on `ParseOptions` to automatically append extracted attachment text to `content.forAI` after the body:

```typescript
const email = await parse(message, {
  attachmentsInForAI: true,          // appends att.extractedText to forAI
  attachmentsForAIOptions: {
    maxCharsPerAttachment: 2_000,
    maxTotalChars: 8_000,
  },
  onAttachment: processors.chain(
    processors.pdfToText({ extractor: processors.cfPdfExtractor(env.AI) }),
    processors.ocr({ ai }),
  ),
});

// email.content.forAI now includes:
// "Hi Bob, please see the attached invoice.\n\n<attachment name=\"invoice.pdf\">..."
```

This is the simplest integration path — `email.content.forAI` becomes the single string to pass to any LLM tool or compose function.

---

### 9.8 Async Extraction (Large Files via Queue)

For large attachments (multi-MB PDFs, long audio) that should not block the ingest path, defer extraction to a Queue consumer:

```typescript
// In the email() handler — store only, enqueue extraction job
export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const email = await parse(message, {
      onAttachment: processors.storeToR2(env.BLOBS, { keyPrefix: "att" }),
    });
    await d1Store(env.DB, email);

    // userId is app-defined (see §16) — carried through the queue message so the
    // consumer can notify the right client without a second lookup.
    const userId = message.to;

    // Enqueue each attachment for async extraction
    for (const att of email.attachments) {
      if (att.blobKey) {
        await env.CLASSIFY_Q.send({
          type: "extract_attachment",
          messageId: email.messageId,
          attachmentId: att.id,
          blobKey: att.blobKey,
          contentType: att.contentType,
          userId,
        });
      }
    }
  },

  // Queue consumer — runs extraction without blocking ingest
  async queue(batch: MessageBatch, env: Env) {
    for (const msg of batch.messages) {
      const { messageId, attachmentId, blobKey, contentType, userId } = msg.body;
      const ai = cfProvider(env.AI);

      const bytes = await env.BLOBS.get(blobKey).then((r) => r?.arrayBuffer());
      if (!bytes) { msg.ack(); continue; }

      let extractedText: string | null = null;

      if (contentType === "application/pdf") {
        extractedText = await processors.cfPdfExtractor(env.AI)(new Uint8Array(bytes));
      } else if (contentType.startsWith("image/")) {
        extractedText = await processors.runOcr(ai, new Uint8Array(bytes));
      } else if (contentType.startsWith("audio/")) {
        extractedText = await processors.runTranscribe(ai, new Uint8Array(bytes));
      }

      if (extractedText) {
        await env.DB.prepare(
          "UPDATE mvrx_attachments SET extracted_text = ? WHERE id = ?"
        ).bind(extractedText, attachmentId).run();

        // Notify connected clients that extracted text is ready
        await publishEvent(env.HUB, userId, {
          type: "attachment_ready",
          payload: { messageId, attachmentId, extractedText: true },
        });
      }

      msg.ack();
    }
  },
};
```

---

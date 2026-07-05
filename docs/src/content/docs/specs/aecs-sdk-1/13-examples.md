---
title: "13. Examples"
---


> **Note:** examples below freely combine implemented core APIs (`parse`, `EmailThread`,
> wrappers) with roadmap APIs (`d1Store`, `aiTools.*`, `compose.*`, `evaluateRules`,
> `UserHub`); they illustrate the target developer experience, not current capability.

### 13.1 Parse, Store to D1 + R2

```typescript
import { parse, d1Store } from "@mvrx/mail";

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const email = await parse(message, {
      onAttachment: async (att, { messageId }) => {
        await env.BLOBS.put(`att/${messageId}/${att.filename}`, await att.content());
      },
    });
    await d1Store(env.DB, email);
  },
};
```

### 13.2 Auto-Classify + Auto-Reply with Workers AI

```typescript
import { parse, aiTools, compose } from "@mvrx/mail";
import { cfProvider } from "@mvrx/mail/providers";
import { cfTransport } from "@mvrx/mail/transports";

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const ai = cfProvider(env.AI);
    const email = await parse(message);

    const category = await aiTools.classify(email, ai, {
      categories: ["support", "sales", "billing", "spam", "other"],
    });

    if (category.category === "support") {
      const draft = await compose.reply(email, ai, {
        intent: "Acknowledge the support request, tell them we will respond within 24 hours.",
        tone: "empathetic",
      });

      await compose.send(
        { from: { email: "support@example.com" }, to: [email.metadata.from],
          subject: `Re: ${email.metadata.subject}`, inReplyTo: email.messageId },
        draft.body,
        cfTransport(env.EMAIL)
      );
    }
  },
};
```

### 13.3 Thread Summary with Anthropic

```typescript
import { EmailThread, aiTools } from "@mvrx/mail";
import { anthropicProvider } from "@mvrx/mail/providers";

async function summariseThread(messages: NormalizedEmail[], env: Env) {
  const ai = anthropicProvider({ apiKey: env.ANTHROPIC_KEY });
  const thread = EmailThread.from(messages);

  return aiTools.summarize(
    { content: { forAI: thread.forAI({ maxMessages: 20 }) } } as NormalizedEmail,
    ai,
    { maxSentences: 3 }
  );
}
```

### 13.4 Extract Text from PDF Attachments

```typescript
import { parse } from "@mvrx/mail";
import { processors } from "@mvrx/mail/attachments";
import { cfProvider } from "@mvrx/mail/providers";

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const ai = cfProvider(env.AI);

    const email = await parse(message, {
      onAttachment: processors.chain(
        processors.storeToR2(env.BLOBS, { keyPrefix: "att" }),
        processors.pdfToText({ extractor: processors.cfPdfExtractor(env.AI) }),
        processors.ocr({ ai, model: "@cf/llava-hf/llava-1.5-7b-hf" }),
      ),
    });

    // att.extractedText is populated for PDF and image attachments
    for (const att of email.attachments) {
      if (att.extractedText) {
        console.log(`${att.filename}: ${att.extractedText.slice(0, 200)}`);
      }
    }
  },
};
```

### 13.5 Attachments → LLM Pipeline (PDF Invoice + Image)

Complete pipeline: receive email with attachments → extract text → answer questions and draft a reply that references the attachment content.

```typescript
import { parse, d1Store, aiTools, compose } from "@mvrx/mail";
import { tools } from "@mvrx/mail/tools";
import { processors } from "@mvrx/mail/attachments";
import { cfProvider } from "@mvrx/mail/providers";
import { cfTransport } from "@mvrx/mail/transports";
import { wrappers } from "@mvrx/mail/wrappers";

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const ai = cfProvider(env.AI);

    // 1. Parse + extract all attachment text inline
    const email = await parse(message, {
      wrapper: wrappers.xml("email"),
      attachmentsInForAI: true,          // body + attachment text in one field
      attachmentsForAIOptions: {
        maxCharsPerAttachment: 4_000,
        maxTotalChars: 12_000,
      },
      onAttachment: processors.chain(
        processors.storeToR2(env.BLOBS, { keyPrefix: "att" }),
        processors.pdfToText({ extractor: processors.cfPdfExtractor(env.AI) }),
        processors.ocr({ ai, model: "@cf/llava-hf/llava-1.5-7b-hf" }),
        processors.transcribe({ ai, model: "@cf/openai/whisper" }),
      ),
    });

    // 2. Persist (extractedText is stored in mvrx_attachments.extracted_text)
    await d1Store(env.DB, email);

    // 3. At this point email.content.forAI contains the body + all extracted attachment text.
    //    All AI tools below receive the full context automatically.

    // Classify — does this need a reply?
    const intent = tools.detectIntent(email);
    if (!intent.required) return;

    // Summarise body + attachments in 2 sentences
    const summary = await aiTools.summarize(email, ai, {
      maxSentences: 2,
      includeAttachments: true,
    });

    // Answer a specific question about the attachment
    const answer = await aiTools.ask(email, ai, {
      question: "What is the total amount due and the payment deadline?",
      includeAttachments: true,
    });

    // Draft a reply that references the invoice details
    const reply = await compose.reply(email, ai, {
      intent: `Acknowledge receipt of the invoice. Confirm payment. Include: ${answer}`,
      tone: "professional",
      includeAttachments: true,
    });

    // Send
    await compose.send(
      {
        from:      { name: "Accounts", email: "accounts@example.com" },
        to:        [email.metadata.from],
        subject:   `Re: ${email.metadata.subject}`,
        inReplyTo: email.messageId,
        references: [...email.thread.references, email.messageId],
      },
      reply.body,
      cfTransport(env.EMAIL)
    );
  },
};
```

### 13.6 Improve a Draft with Multiple Providers

```typescript
import { compose } from "@mvrx/mail/compose";
import { openaiProvider, cfProvider } from "@mvrx/mail/providers";

// Use OpenAI for compose, CF Workers AI for classification
const composeAi = openaiProvider({ apiKey: env.OPENAI_KEY });
const classifyAi = cfProvider(env.AI);

const improved = await compose.improve(userDraft, composeAi, {
  tone: "professional",
  model: "gpt-4o",              // override provider default
});

const short = await compose.shorten(improved, composeAi, { targetWords: 100 });
const subjects = await compose.suggestSubjects(short, composeAi, { count: 3 });
```

---

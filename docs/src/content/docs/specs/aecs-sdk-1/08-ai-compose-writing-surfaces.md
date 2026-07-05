---
title: "8. AI Compose — Writing Surfaces"
---


> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

The compose module provides AI-assisted writing tools for drafting, replying, and improving email content. All methods accept an `AiProvider` and optional `model` override.

```typescript
import { compose } from "@mvrx/mail/compose";
```

### 8.1 Draft from Scratch

Generate a new email from a prompt or structured input:

```typescript
const draft = await compose.draft(
  "Write a follow-up email to Alice about the Q3 budget proposal we discussed Monday.",
  ai,
  {
    from: { name: "Bob", email: "bob@example.com" },
    tone: "professional",
    length: "concise",           // "concise" | "standard" | "detailed"
    format: "text",              // "text" | "html"
  }
);
// → { subject: "Follow-up: Q3 Budget Proposal", body: "Hi Alice, ..." }
```

### 8.2 Reply Assistance

Generate a reply to an existing email or thread:

```typescript
// Reply to a single email — include attachment context so the LLM can reference it
const reply = await compose.reply(email, ai, {
  intent: "Accept the meeting invitation and suggest Tuesday at 2pm instead.",
  tone: "friendly",
  includeAttachments: true,   // att.extractedText is passed as context to the LLM
});
// → { body: "Hi Alice, Thanks for the invite — Tuesday at 2pm works great for me. ..." }

// Reply in context of a full thread
const thread = EmailThread.from(messages);
const reply = await compose.replyToThread(thread, ai, {
  intent: "Provide a status update — development is 80% complete, on track for Friday.",
  tone: "professional",
  includeGreeting: true,
});
```

### 8.3 Improve Existing Copy

Rewrite or enhance a piece of email text:

```typescript
// General improvement — clarity, grammar, flow
const improved = await compose.improve(
  "hey can u send me the report by friday pls its quite urgent",
  ai
);
// → "Could you please send me the report by Friday? It's quite urgent. Thank you."

// Adjust tone
const adjusted = await compose.tone(
  "Send me the report by Friday.",
  ai,
  { tone: "friendly" }
);
// → "Would you mind sending over the report by Friday? That would be really helpful!"

// Tone options: "professional" | "friendly" | "formal" | "casual" | "empathetic" | "assertive"
```

### 8.4 Shorten or Expand

```typescript
// Shorten — preserve meaning, cut length
const shorter = await compose.shorten(longEmail, ai, { targetWords: 80 });

// Expand — add detail, context, politeness
const longer = await compose.expand(briefNote, ai, {
  addContext: "This is going to a new enterprise client.",
});
```

### 8.5 Subject Line Generation

```typescript
const subjects = await compose.suggestSubjects(body, ai, { count: 3 });
// → [
//     "Q3 Budget Proposal — Follow-up",
//     "Next steps on Q3 budget",
//     "Following up from Monday's meeting"
//   ]
```

### 8.6 Translation

```typescript
const translated = await compose.translate(email.content.clean, ai, {
  targetLanguage: "es",         // ISO 639-1
  preserveFormatting: true,
});
// → "Hola Alice, solo quería hacer un seguimiento sobre..."
```

### 8.7 `ComposeOptions`

All compose methods accept these common options:

```typescript
interface ComposeOptions {
  model?:          string;        // override the provider's default model
  tone?:           Tone;          // "professional" | "friendly" | "formal" | "casual" | "empathetic" | "assertive"
  length?:         Length;        // "concise" | "standard" | "detailed"
  format?:         "text" | "html";
  language?:       string;        // ISO 639-1, defaults to detected input language
  systemPrompt?:   string;        // prepend additional instructions to every compose call
  maxTokens?:      number;        // cap response tokens (default: 1024)
}
```

### 8.8 Send Composed Email

```typescript
import { cfTransport } from "@mvrx/mail/transports";

// Compose + send in one call
await compose.send(
  {
    from: { email: "support@example.com" },
    to: [email.metadata.from],
    subject: `Re: ${email.metadata.subject}`,
    inReplyTo: email.messageId,
  },
  draft.body,
  cfTransport(env.EMAIL)        // any EmailTransport (§3.5) — cfTransport wraps the CF binding
);
```

---

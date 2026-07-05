---
title: "14. Extensibility"
---


> **Note:** the extension points below (`createTools`, custom processors, custom
> providers) belong to roadmap modules (§6–§9). The implemented core's extension
> points are `ParseOptions.cleaner`, `wrapper`, `onAttachment`, and `threadIdResolver` (§12.1).

### 14.1 Custom AI Tools

```typescript
import { createTools } from "@mvrx/mail/tools";

const myTools = createTools({
  extractTicketId: (email) => {
    const match = email.metadata.subject?.match(/\[TICKET-(\d+)\]/);
    return match ? { ticketId: match[1] } : null;
  },
});
```

### 14.2 Custom Compose Strategy

```typescript
import { createCompose } from "@mvrx/mail/compose";

const myCompose = createCompose({
  systemPrompt: "You are a terse, no-nonsense email assistant. Use plain English. No filler phrases.",
  defaultTone: "casual",
  defaultLength: "concise",
});

const draft = await myCompose.draft("Follow up with Alice about invoices.", ai);
```

### 14.3 Custom Attachment Processor

```typescript
import type { AttachmentProcessor } from "@mvrx/mail/attachments";

const calendarProcessor: AttachmentProcessor = {
  accepts: (att) => att.contentType === "text/calendar",
  process: async (att) => {
    const text = new TextDecoder().decode(await att.content());
    att.extractedText = parseIcalSummary(text);
  },
};
```

### 14.4 Extending `NormalizedEmail`

```typescript
interface AppEmail extends NormalizedEmail {
  x_ticket_id:  string | null;
  x_category:   string | null;
}

const email = await parse(message) as AppEmail;
email.x_ticket_id = myTools.extractTicketId(email)?.ticketId ?? null;
```

Custom fields must use the `x_` prefix per AECS-1 §9.

---

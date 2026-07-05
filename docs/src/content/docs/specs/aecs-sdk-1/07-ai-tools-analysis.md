---
title: "7. AI Tools — Analysis"
---


> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

Deterministic tools run locally with no external calls. AI-powered tools require an `AiProvider`.

### 7.1 Deterministic Tools

```typescript
import { tools } from "@mvrx/mail/tools";

tools.extractAddresses(email);
// → [{ name: "Alice", email: "alice@example.com" }]

tools.detectIntent(email);
// → { type: "question" | "request" | "confirmation" | "notification" | "other", confidence: 0.87 }

tools.requiresReply(email);
// → { required: true, urgency: "high" | "normal" | "low" }

tools.extractDates(email);
// → [{ raw: "Thursday at 3pm", iso: "2026-07-03T15:00:00Z", confidence: 0.91 }]

tools.extractLinks(email);
// → [{ url: "https://example.com", text: "view invoice", type: "link" | "unsubscribe" | "tracking" }]
```

### 7.2 AI-Powered Analysis Tools

```typescript
import { aiTools } from "@mvrx/mail/ai-tools";

// Summarise in N sentences — optionally include extracted attachment text
await aiTools.summarize(email, ai, {
  maxSentences: 2,
  includeAttachments: true,   // appends att.extractedText to the LLM context
});
// → "Bob confirmed the update looks good and the attached invoice shows $4,200 due."

// Extract structured action — works across body + attachments
await aiTools.extractAction(email, ai, { includeAttachments: true });
// → { action: "schedule_meeting", params: { date: "2026-07-03", time: "15:00", participants: [...] } }

// Sentiment
await aiTools.sentiment(email, ai);
// → { sentiment: "positive", confidence: 0.94 }

// Classify into custom categories
await aiTools.classify(email, ai, {
  categories: ["sales", "support", "billing", "spam", "other"],
});
// → { category: "support", confidence: 0.91 }

// Extract key entities — pulls from body and all attachment extractedText
await aiTools.extractEntities(email, ai, { includeAttachments: true });
// → { people: [...], companies: [...], products: [...], amounts: ["$4,200"] }

// Answer a question about the email and its attachments
await aiTools.ask(email, ai, {
  question: "What is the total amount due on the invoice?",
  includeAttachments: true,
});
// → "The invoice attached to this email shows a total of $4,200 due by July 15."
```

---

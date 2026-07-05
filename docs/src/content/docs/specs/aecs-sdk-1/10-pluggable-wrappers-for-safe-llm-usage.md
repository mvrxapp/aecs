---
title: "10. Pluggable Wrappers for Safe LLM Usage"
---


### 10.1 Built-in Wrappers

```typescript
import { wrappers } from "@mvrx/mail/wrappers";

// XML — strongly recommended for Claude and models that follow XML instructions
const email = await parse(message, { wrapper: wrappers.xml("email") });
// forAI → "<email>\nHi Bob...\n</email>"

// Markdown blockquote
const email = await parse(message, { wrapper: wrappers.markdown() });
// forAI → "> Hi Bob..."

// Named block
const email = await parse(message, { wrapper: wrappers.block("UNTRUSTED EMAIL") });
// forAI → "--- UNTRUSTED EMAIL ---\nHi Bob...\n--- END UNTRUSTED EMAIL ---"
```

### 10.2 Custom Wrapper

```typescript
interface ForAIWrapper {
  wrap(content: string, email: NormalizedEmail): string;
}

const email = await parse(message, {
  wrapper: {
    wrap: (content, email) =>
      `[EMAIL FROM: ${email.metadata.from.email}]\n${content}\n[/EMAIL]`,
  },
});
```

### 10.3 Thread-Level Wrapping

```typescript
const thread = EmailThread.from(messages);

const prompt = thread.forAI({
  wrapper:            wrappers.xml("message"),
  maxMessages:        10,
  maxCharsPerMessage: 1500,
  includeMetadata:    true,   // prepend "From: X | Date: Y" to each message
  order:              "asc",
});
```

---

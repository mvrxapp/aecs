---
title: "4. Content Levels"
---


```
rawFull  →  raw  →  text  →  clean  →  forAI
                  ↘  html
```

| Level | Description |
|---|---|
| `rawFull` | Complete RFC 5322 bytes — all headers, MIME parts, encodings. For archival. |
| `raw` | Latest body only — headers removed, quoted history present, transfer encoding decoded. |
| `html` | HTML part of latest content. `null` for plain-text messages. |
| `text` | Plain text of latest content. Derived from `html` if no plain-text part. |
| `clean` | `text` with quoted reply chains and email signatures removed. |
| `forAI` | `clean` with whitespace normalised, inline image references removed, forwarded headers collapsed, optional delimiters applied, truncated to `forAIMaxChars`. |

The default cleaner detects quoted history using `>` prefix patterns, `On [date] wrote:` markers, `-----Original Message-----` delimiters, and heuristic signature detection (`-- ` RFC 3676 delimiter + trailing short-block patterns). When confidence is low, content is retained.

```typescript
// Replace the default cleaner
const email = await parse(message, {
  cleaner: (text) => myCustomCleaner(text),   // sync or async
});
```

---

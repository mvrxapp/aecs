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
| `clean` | `text` with quoted reply history and email signatures removed. Authored lines are never removed ([AECS-1 §4.3.1](/aecs/specs/aecs-1/06-field-definitions/#431-content-preservation)). |
| `forAI` | `clean` with whitespace normalised, inline image references removed, forwarded headers collapsed, optional delimiters applied, truncated to `forAIMaxChars`. |

The default cleaner follows the content-preservation rules in [AECS-1 §4.3.1](/aecs/specs/aecs-1/06-field-definitions/#431-content-preservation):

- **Quoted lines** (`>` prefix) and **attribution lines** (`On [date] … wrote:`, including a version wrapped onto two lines) are removed only after the sender's last authored line. Bottom-posted and inline answers are kept.
- **Context:** up to 3 quoted lines directly above each authored line are kept, so "No." keeps its question. Longer quotes are cut down, with a `> [N quoted lines omitted]` marker.
- **Unprefixed history** starts at a `-----Original Message-----` separator, or a `From:` line followed by `Sent:`/`Date:`/`To:`/`Subject:`, and is removed to the end. An underscore divider counts only when such a header block follows it; a divider on its own is kept. A header block under a `Forwarded message` marker is forwarded content and is kept.
- **Signatures:** the `-- ` delimiter, `Sent from my …`, confidentiality disclaimers and closing salutations are removed only as a short trailing block (at most 10, 2 and 14 non-empty lines after the marker respectively). Longer text after a lookalike marker is kept.
- **Fallback:** if cleanup would leave nothing, `clean` is set to `text` and `processing.cleanFallback` is `true`.

A custom `cleaner` receives the full `text`, quotes included, and replaces both quote and signature removal. The empty-result fallback still applies to its output.

```typescript
// Replace the default cleaner
const email = await parse(message, {
  cleaner: (text) => myCustomCleaner(text),   // sync or async
});
```

---

---
title: "12. Configuration Reference"
---


### 12.1 `ParseOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxBodyBytes` | `number` | `1_000_000` | Max bytes read from message body |
| `forAIMaxChars` | `number` | `8_000` | Max chars in `content.forAI` |
| `cleaner` | `fn` | built-in | Custom quote/signature stripper |
| `wrapper` | `ForAIWrapper` | none | Delimiter wrapper for `forAI` |
| `onAttachment` | `fn` | none | Callback per attachment during parse |
| `attachmentsInForAI` | `boolean` | `false` | Append `att.extractedText` to `content.forAI` *(roadmap — attachment processors, §9.3–9.8; not in the current `ParseOptions` type)* |
| `attachmentsForAIOptions` | `AttachmentsForAIOptions` | defaults | Controls per-attachment limits and wrapping *(roadmap — attachment processors, §9.3–9.8; not in the current `ParseOptions` type)* |
| `threadIdResolver` | `fn` | AECS-1 §5 | Custom `threadId` calculation |
| `specVersion` | `string` | SDK default | Stamp in `processing.specVersion` |

### 12.2 `ThreadForAIOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `maxMessages` | `number` | all | Limit to N most recent messages |
| `maxCharsPerMessage` | `number` | `2_000` | Truncate each message |
| `wrapper` | `ForAIWrapper` | none | Per-message wrapper |
| `includeMetadata` | `boolean` | `true` | Prepend sender + date per message |
| `order` | `"asc" \| "desc"` | `"asc"` | Chronological or reverse |

### 12.3 `ComposeOptions`

> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

| Option | Type | Default | Description |
|---|---|---|---|
| `model` | `string` | provider default | Override model for this call |
| `tone` | `Tone` | `"professional"` | Writing tone |
| `length` | `Length` | `"standard"` | Response length target |
| `format` | `"text" \| "html"` | `"text"` | Output format |
| `language` | `string` | auto-detect | ISO 639-1 target language |
| `systemPrompt` | `string` | SDK default | Prepend to system instructions |
| `maxTokens` | `number` | `1024` | Cap LLM response tokens |
| `includeAttachments` | `boolean` | `false` | Pass `att.extractedText` from all attachments as additional LLM context |

---

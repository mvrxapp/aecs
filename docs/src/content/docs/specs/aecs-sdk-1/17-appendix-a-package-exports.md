---
title: "Appendix A: Package Exports"
---


> **Implementation note:** this appendix documents the target export surface for the
> full SDK described in this document. Today, only `@mvrx/mail` (core) and the
> `@mvrx/mail/adapters`, `@mvrx/mail/content`, `@mvrx/mail/thread`,
> `@mvrx/mail/threading`, `@mvrx/mail/wrappers`, and `@mvrx/mail/types` subpaths are
> published, and only the `parse()`/`NormalizedEmail`/`EmailThread`/threading/content-level/
> wrapper exports listed under `@mvrx/mail` below actually exist. `sendEmail`, `d1Init`,
> `d1Store`, `getThread`, `getMessage`, `listMessages`, `evaluateRules`, `Rule`, `Action`,
> `Condition`, `OutboundEmail`, and every other subpath below (`/providers`, `/transports`,
> `/hub`, `/tools`, `/ai-tools`, `/compose`, `/attachments`) are roadmap — see the
> Implementation Status note near the top of this document.

```
@mvrx/mail              — parse(), sendEmail(), d1Init(), d1Store(), getThread(),
                          getMessage(), listMessages(), evaluateRules(),
                          NormalizedEmail, EmailThread, OutboundEmail, Rule, Action, Condition

@mvrx/mail/providers    — cfProvider, openaiProvider, anthropicProvider, geminiProvider,
                          mistralProvider, azureProvider, ollamaProvider, openaiCompatProvider

@mvrx/mail/transports   — cfTransport, smtpTransport, EmailTransport (interface)

@mvrx/mail/hub          — UserHub (DO class), publishEvent(), hubRouter(), MailEvent

@mvrx/mail/tools        — deterministic tools: extractAddresses, detectIntent,
                          requiresReply, extractDates, extractLinks

@mvrx/mail/ai-tools     — AI analysis: summarize, classify, extractAction,
                          sentiment, extractEntities, ask;
                          all accept includeAttachments?: boolean

@mvrx/mail/compose      — compose.draft, reply, replyToThread, improve, tone,
                          shorten, expand, suggestSubjects, translate, send;
                          all accept includeAttachments?: boolean;
                          createCompose() for custom strategies

@mvrx/mail/attachments  — AttachmentProcessor, attachmentsForAI(),
                          processors.chain, storeToR2, pdfToText, ocr,
                          transcribe, cfPdfExtractor, runOcr, runTranscribe

@mvrx/mail/wrappers     — wrappers.xml, markdown, block; ForAIWrapper (interface)

@mvrx/mail/thread       — EmailThread (also re-exported from main)
```

---

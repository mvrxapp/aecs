---
title: "Appendix C: Versioning"
---


The SDK follows semantic versioning independently from the AECS-1 spec.

- `@mvrx/mail` `0.x` — implements AECS-1 `1.0.0` core (parser, threading, content levels)
- `@mvrx/mail` `1.0.0` — released when the full SDK surface in this document is stable

The spec version implemented is declared in `package.json`:
```json
{ "aecs": "1.0" }
```

### Release History

| Version | Date | Notes |
|---|---|---|
| 0.3.1-draft | 2026-10-05 | Synced to [AECS-1 v1.1.0](./AECS-1-ai-email-consumption.md) (content preservation). [§4](/aecs/specs/aecs-sdk-1/04-content-levels/) now describes the default cleaner accurately: authored lines after quotes are kept, quoted context is bounded, dividers are not quote boundaries, signature removal is size-limited, and an empty result falls back to `text`. Removed the incorrect claim that content is retained "when confidence is low". `processing.specVersion` is `"1.1"`; adds `processing.cleanFallback`. A custom `cleaner` now receives the full `text` instead of quote-stripped text. |
| 0.3.0-draft | 2026-07-03 | Synced to [AECS-1 v1.0.0 (Final, 2026-07-03)](./AECS-1-ai-email-consumption.md). Added the Implementation Status note (near the top of this document) and `Status: Roadmap` banners on every section that specifies a module not yet implemented in `@mvrx/mail`, roadmap annotations on the [§2.2](/aecs/specs/aecs-sdk-1/02-installation-setup/#22-cloudflare-workers--full-setup) setup bindings and [§13](/aecs/specs/aecs-sdk-1/13-examples/)–[§14](/aecs/specs/aecs-sdk-1/14-extensibility/) examples/extensibility, plus a [§11](/aecs/specs/aecs-sdk-1/11-security-best-practices/) cross-reference to AECS-1 [§7](/aecs/specs/aecs-1/09-security-considerations/)'s security guidance. No normative algorithm text changed. |
| 0.2.0-draft | 2026-06-29 | Prior draft, written before AECS-1 was finalized. |

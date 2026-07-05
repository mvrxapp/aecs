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
| 0.3.0-draft | 2026-07-03 | Synced to [AECS-1 v1.0.0 (Final, 2026-07-03)](./AECS-1-ai-email-consumption.md). Added the Implementation Status note (near the top of this document) and `Status: Roadmap` banners on every section that specifies a module not yet implemented in `@mvrx/mail`, roadmap annotations on the §2.2 setup bindings and §13–§14 examples/extensibility, plus a §11 cross-reference to AECS-1 §7's security guidance. No normative algorithm text changed. |
| 0.2.0-draft | 2026-06-29 | Prior draft, written before AECS-1 was finalized. |

---
title: "8. Versioning"
---


This specification follows semantic versioning (`MAJOR.MINOR.PATCH`).

- Breaking changes to the `NormalizedEmail` schema increment the major version.
- Additive, non-breaking changes increment the minor version.
- The `processing.specVersion` field in each normalized object SHOULD record the major and minor version used (e.g. `"1.1"`).

Current version: **1.1.1**

### Release History

| Version | Date | Notes |
|---|---|---|
| 1.1.1 | 2026-10-05 | Adds informative [Appendix C](/aecs/specs/aecs-1/15-appendix-c-storage-and-indexing-informative/) (storage and indexing): hot/warm/cold split by access pattern, mailbox-scoped hashed keys, indexes for the core reads, idempotent writes, payload budgets, security and retention. No normative change; `processing.specVersion` stays `"1.1"`. |
| 1.1.0 | 2026-10-05 | Adds [§4.3.1](/aecs/specs/aecs-1/06-field-definitions/#431-content-preservation) (content preservation): cleanup MUST NOT remove authored lines, including bottom-posted and inline replies; divider lines are not quote boundaries; signature removal is limited to short trailing blocks; an empty cleanup result falls back to `text`. Adds optional `processing.cleanFallback`. Fixes the contradiction between §4.3 and Appendix A over `content.raw`, which retains quoted history. Adds §10 conformance points 8–9 and content-preservation fixtures. Implementations that keep only the text above the first quote marker were AECS-1.0-conformant and are not AECS-1.1-conformant. |
| 1.0.0 | 2026-07-03 | First stable release. Adds [§4.1.1](/aecs/specs/aecs-1/06-field-definitions/#411-synthetic-messageid) (synthetic `messageId`), [§6.1](/aecs/specs/aecs-1/08-timestamps/#61-date-header-parsing) (`Date` parsing), and clarifies [§5.4](/aecs/specs/aecs-1/07-threading-algorithm/#54-encoding-for-the-fallback-hash-rule-4) fallback-hash inputs. |
| 1.0.0-draft | 2026-06-29 | Initial public draft. |

---

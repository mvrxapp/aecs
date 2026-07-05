---
title: "8. Versioning"
---


This specification follows semantic versioning (`MAJOR.MINOR.PATCH`).

- Breaking changes to the `NormalizedEmail` schema increment the major version.
- Additive, non-breaking changes increment the minor version.
- The `processing.specVersion` field in each normalized object SHOULD record the major and minor version used (e.g. `"1.0"`).

Current version: **1.0.0**

### Release History

| Version | Date | Notes |
|---|---|---|
| 1.0.0 | 2026-07-03 | First stable release. Adds §4.1.1 (synthetic `messageId`), §6.1 (`Date` parsing), and clarifies §5.4 fallback-hash inputs. |
| 1.0.0-draft | 2026-06-29 | Initial public draft. |

---

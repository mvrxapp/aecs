---
title: "Appendix B: Reference Implementation"
---


`@mvrx/mail` is the TypeScript reference implementation of AECS-1. Core modules:

| Module | Spec coverage |
|---|---|
| `parse()` | Full `NormalizedEmail` production from RFC 5322/MIME ([§3](/aecs/specs/aecs-1/05-normalizedemail-schema/)–[§4](/aecs/specs/aecs-1/06-field-definitions/), [§6](/aecs/specs/aecs-1/08-timestamps/)) |
| `resolveThreadId()` | Threading algorithm ([§5](/aecs/specs/aecs-1/07-threading-algorithm/)) |
| `normalizeDate()` | Timestamp rules ([§6](/aecs/specs/aecs-1/08-timestamps/)) |
| `EmailThread` | `thread.position` assignment ([§4.4](/aecs/specs/aecs-1/06-field-definitions/#44-thread)) |

Conformance tests in `packages/mail/test/core.test.mjs` run every fixture in
[`specs/conformance/fixtures/`](./conformance/fixtures/).

- GitHub: [github.com/mvrxapp/mail](https://github.com/mvrxapp/mail)
- npm: [`@mvrx/mail`](https://npmjs.com/package/@mvrx/mail)

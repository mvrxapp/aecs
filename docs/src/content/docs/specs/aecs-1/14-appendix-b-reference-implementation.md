---
title: "Appendix B: Reference Implementation"
---


`@mvrx/mail` is the TypeScript reference implementation of AECS-1. Core modules:

| Module | Spec coverage |
|---|---|
| `parse()` | Full `NormalizedEmail` production from RFC 5322/MIME (§3–§4, §6) |
| `resolveThreadId()` | Threading algorithm (§5) |
| `normalizeDate()` | Timestamp rules (§6) |
| `EmailThread` | `thread.position` assignment (§4.4) |

Conformance tests in `packages/mail/test/core.test.mjs` run every fixture in
[`specs/conformance/fixtures/`](./conformance/fixtures/).

- GitHub: [github.com/mvrxapp/mail](https://github.com/mvrxapp/mail)
- npm: [`@mvrx/mail`](https://npmjs.com/package/@mvrx/mail)

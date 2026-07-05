---
title: "Appendix B: Runtime Compatibility"
---


| Runtime | Supported | Notes |
|---|---|---|
| Cloudflare Workers | ✓ | Primary target. All features. CF bindings resolve natively. |
| Node.js 18+ | ✓ | All features except `ForwardableEmailMessage` input and CF-specific bindings |
| Deno | ✓ | Via npm compatibility |
| Bun | ✓ | Full support |
| Browser | Partial | `parse(string)` + compose only — no stream, attachment, or DO support |

---

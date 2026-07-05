---
title: "1. Purpose"
---


Raw email is noisy, inconsistently encoded, and poorly suited for direct consumption by AI systems or modern applications. A single message may contain quoted reply chains, HTML markup, MIME multipart boundaries, base64-encoded content, and legacy header formats.

AECS-1 defines a normalized representation that:

- Provides multiple content levels from raw to AI-optimized
- Preserves the original message when required
- Establishes a deterministic, stable threading model
- Remains flexible — no field beyond `messageId` and `threadId` is mandatory

---

### 1.1 Relation to Prior Art

The obvious prior art here is **JMAP** (RFC 8620 core protocol, RFC 8621 mail data
model) — the IETF standard for structured, JSON-based email access. AECS-1 is not a
replacement for it and deliberately does not compete on the same axis:

- **JMAP defines a transport and sync protocol** — how a client fetches, pushes, and
  incrementally syncs mailbox state over HTTP. AECS-1 defines none of that; it's
  transport-agnostic and only describes the shape of one already-fetched message.
  A JMAP client's `Email` object is a legitimate AECS-1 `parse()` input source, same as
  a raw RFC 5322 stream.
- **JMAP's `Email` object is a fidelity-preserving mirror of the message.** It doesn't
  define an AI/LLM-optimized content level — there's no equivalent of `content.clean`
  or `content.forAI` (quote-stripped, signature-stripped, bounded, prompt-injection-aware
  output). That gap is the entire reason AECS-1 exists.
- **Adopting JMAP is a much bigger commitment** — a full client/server sync protocol —
  than most AI-on-email use cases need. AECS-1 is scoped to the one narrow problem of
  "given a message, produce a normalized, AI-ready shape for it," so it can sit
  downstream of *any* transport: IMAP, JMAP, a raw inbound webhook, or Cloudflare Email
  Routing.

If you're building a full mail client, JMAP is very likely still the right protocol
choice for sync — AECS-1 is complementary, not a competitor, at the normalization layer.

---

---
title: "7. Security Considerations"
---


This specification defines data structure only. It does not mandate sanitization rules, output delimiters, or content filtering.

**Implementers and consumers should note:**

- All email content — including `subject`, sender names, and body fields at every level — originates from an untrusted external source.
- The `forAI` field reduces noise but does not sanitize for prompt injection. An adversary can craft email content designed to manipulate an AI system that processes it as instructions.
- Safe usage of any `content.*` field with an LLM is the responsibility of the consuming application.
- Implementations are encouraged to offer an optional scanning layer and attach findings as metadata outside this core schema. This spec does not define that layer.
- `content.rawFull` in particular MUST be treated as fully untrusted input if re-parsed downstream.
- **`content.html` is live, attacker-influenced markup, not just an LLM-injection vector.**
  It commonly contains remote-resource references (`<img src>`, tracking pixels, remote
  CSS `url()`). A consuming application that renders `content.html` directly, or that
  eagerly fetches URLs found in it (e.g. for a link-preview feature), is exposed to
  SSRF (the fetch can target internal/private network addresses reachable from the
  fetching service) and to the classic email tracking-pixel privacy leak (fetching the URL
  confirms to the sender that the message was opened, and from roughly where). Consumers
  rendering `content.html` SHOULD do so in a sandboxed context (e.g. a sandboxed iframe with
  remote image loading disabled by default) and SHOULD NOT server-side fetch URLs discovered
  in email content without the same allow-listing/network-egress controls used for any other
  untrusted-URL-fetching feature.

---

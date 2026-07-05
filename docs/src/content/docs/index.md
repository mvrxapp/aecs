---
title: AECS
description: AI Email Consumption Specification — an open standard for normalizing raw RFC 5322/MIME email into AI-ready JSON.
---

**AECS** (AI Email Consumption Specification) defines `NormalizedEmail`: a deterministic
representation of a parsed email message — schema, threading algorithm, timestamp
normalization, and six content levels — suitable for AI/LLM consumption, storage, and
threading.

The specification is published under **CC0 1.0** (public domain): implement it in any
language, without asking permission.

## Specification

- [**AECS-1**](/aecs/specs/aecs-1/) (v1.0.0, Final) — the normative document
- [**AECS-SDK-1**](/aecs/specs/aecs-sdk-1/) (v0.3.0-draft) — the SDK surface implementations target

## Reference

- [JSON Schema](/aecs/reference/schema/) — machine-checkable `NormalizedEmail` shape
- [Conformance suite](/aecs/reference/conformance/) — fixtures and an independent checker

## Implementations

- [`@mvrx/aecs`](https://www.npmjs.com/package/@mvrx/aecs) — the framework-agnostic, MIT-licensed reference implementation ([source](https://github.com/mvrxapp/aecs))
- [`@mvrx/mail`](https://www.npmjs.com/package/@mvrx/mail) — a Cloudflare Email Routing SDK built on `@mvrx/aecs` ([source](https://github.com/mvrxapp/mail))

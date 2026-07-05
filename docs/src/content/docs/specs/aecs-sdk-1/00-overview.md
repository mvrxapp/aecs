---
title: "Overview"
---

# AECS SDK Specification

**Document:** AECS-SDK-1  
**Version:** 0.3.0-draft  
**Status:** Draft  
**Date:** 2026-07-03  
**Authors:** MVRX Group  
**Implements:** [AECS-1 v1.0.0 (Final, 2026-07-03)](./AECS-1-ai-email-consumption.md)

---

> ## Implementation Status
>
> **Implemented today in `@mvrx/mail`:** `parse()`, `NormalizedEmail`, deterministic
> threading, UTC timestamps, content levels including `forAI` (`rawFull` / `raw` /
> `html` / `text` / `clean` / `forAI`), `EmailThread`, the built-in `forAI` wrappers
> (`xml`, `markdown`, `block`), and lazy attachment metadata + `content()` loading
> (including the basic `onAttachment` callback).
>
> **Roadmap — specified in this document but not yet implemented:** D1 storage
> (`d1Init`/`d1Store`/query API, §3.7–3.8), `EmailTransport` implementations and
> `sendEmail()` (§3.5–3.6), AI provider connectors (§6), deterministic and
> AI-powered analysis tools (§7), AI compose (§8), attachment processors and the
> attachment-to-LLM aggregation helpers (§9.3–9.8), the rules engine (§15), the
> real-time `UserHub`/SSE hub (§16), and EAS/MCP/hosted-service surfaces. These
> MUST be implemented through the public SDK surface described here rather than
> bypassed in commercial code once built. Sections below that specify a roadmap
> module carry a `Status: Roadmap` banner.

---

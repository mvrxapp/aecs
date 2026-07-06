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
> (`d1Init`/`d1Store`/query API, [§3.7](/aecs/specs/aecs-sdk-1/03-core-api/#37-storage--d1init--d1store)–[3.8](/aecs/specs/aecs-sdk-1/03-core-api/#38-query-api)), `EmailTransport` implementations and
> `sendEmail()` ([§3.5](/aecs/specs/aecs-sdk-1/03-core-api/#35-emailtransport)–[3.6](/aecs/specs/aecs-sdk-1/03-core-api/#36-sendemailmessage-transport)), AI provider connectors ([§6](/aecs/specs/aecs-sdk-1/06-ai-provider-interface/)), deterministic and
> AI-powered analysis tools ([§7](/aecs/specs/aecs-sdk-1/07-ai-tools-analysis/)), AI compose ([§8](/aecs/specs/aecs-sdk-1/08-ai-compose-writing-surfaces/)), attachment processors and the
> attachment-to-LLM aggregation helpers ([§9.3](/aecs/specs/aecs-sdk-1/09-attachment-handling/#93-built-in-cf-processor--store-to-r2)–[9.8](/aecs/specs/aecs-sdk-1/09-attachment-handling/#98-async-extraction-large-files-via-queue)), the rules engine ([§15](/aecs/specs/aecs-sdk-1/15-rules-engine/)), the
> real-time `UserRelay`/SSE relay ([§16](/aecs/specs/aecs-sdk-1/16-real-time-events-userhub/)), and EAS/MCP/hosted-service surfaces. These
> MUST be implemented through the public SDK surface described here rather than
> bypassed in commercial code once built. Sections below that specify a roadmap
> module carry a `Status: Roadmap` banner.

---

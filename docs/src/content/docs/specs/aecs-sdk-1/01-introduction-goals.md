---
title: "1. Introduction & Goals"
---


The AECS SDK (`@mvrx/mail`) is the TypeScript reference implementation of the AECS-1 specification. It provides a single, composable API for receiving, parsing, threading, storing, and acting on emails — with first-class AI surfaces for drafting, improving, replying to, and analysing email content.

### Design Goals

- **Dead simple defaults.** A single `parse()` call produces a fully normalized, AI-ready email. No configuration required to get started.
- **Cloudflare-native, not locked in.** Deep integration with CF Email Routing, Email Service, Workers AI, D1, R2, KV, Durable Objects, and Queues. Core parsing runs anywhere (Node.js, Deno, Bun, browser).
- **Bring your own AI.** Every AI surface accepts an `AiProvider` interface. Pre-built connectors ship for Cloudflare Workers AI, OpenAI, Anthropic, Google Gemini, Mistral, Azure OpenAI, Ollama, and any OpenAI-compatible endpoint.
- **Safe for LLMs by default.** `forAI` output is cleaned, bounded, and optionally wrapped without configuration.
- **Fully typed.** Every object, option, and callback has precise TypeScript types. No `any`.
- **Pluggable everywhere.** Content cleaners, AI connectors, attachment handlers, compose strategies, and LLM wrappers are all replaceable without forking.

---

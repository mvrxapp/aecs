<img src="./assets/logo.svg" width="48" height="48" alt="AECS logo" />

# AECS

[![CI](https://github.com/mvrxapp/aecs/actions/workflows/ci.yml/badge.svg)](https://github.com/mvrxapp/aecs/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@mvrx/aecs.svg?label=%40mvrx%2Faecs)](https://www.npmjs.com/package/@mvrx/aecs)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![Spec: CC0](https://img.shields.io/badge/spec-CC0--1.0-lightgrey.svg)](./specs/AECS-1-ai-email-consumption.md)

**AECS-1** (AI Email Consumption Specification) is an open standard for deterministically
normalizing raw RFC 5322/MIME email into AI-ready JSON — the schema, the threading
algorithm, and the six content levels. It is published under **CC0 1.0** (public domain):
implement it in any language, without asking permission.

`@mvrx/aecs` is the framework-agnostic, zero-infrastructure-dependency MIT reference
implementation of that spec: parsing, content cleaning, threading, and message
normalization, with no Cloudflare or storage assumptions baked in.

- [AECS-1 specification](./specs/AECS-1-ai-email-consumption.md) — the normative document
- [AECS-SDK-1 specification](./specs/AECS-SDK-1-specification.md) — the target SDK surface for implementations
- [JSON Schema](./specs/schema/normalized-email.schema.json) — machine-checkable `NormalizedEmail` shape
- [Conformance suite](./specs/conformance/) — fixtures + an independent checker (`verify.py`)
- [Docs site](https://mvrxapp.github.io/aecs/) — browsable version of the above

## Install

```bash
npm install @mvrx/aecs
```

## Usage

```typescript
import { parse } from "@mvrx/aecs";

const email = await parse(rawRfc5322Message);

console.log(email.messageId);       // normalized Message-ID
console.log(email.threadId);        // deterministic thread identifier
console.log(email.content.clean);   // quote-stripped, signature-stripped body
console.log(email.content.forAI);   // wrapped, AI-ready representation
```

`parse()` accepts a raw message as a `string`, `ArrayBuffer`, `Uint8Array`, or a
`ReadableStream<Uint8Array>`.

## License

MIT. See [`LICENSE`](./LICENSE).

# MVRX Specifications

Open specifications published by MVRX Group. These are intended as community standards,
not just internal implementation docs. Implementations in `@mvrx/*` packages follow these specs.

| Spec | Status | Description |
|---|---|---|
| [AECS-1](./AECS-1-ai-email-consumption.md) | **1.0.0 Final** | AI Email Consumption Specification — NormalizedEmail schema |
| [AECS-SDK-1](./AECS-SDK-1-specification.md) | Draft | AECS SDK — TypeScript reference implementation spec |

## Machine-checkable artifacts

- [`AECS-1-ai-email-consumption.pdf`](./AECS-1-ai-email-consumption.pdf) — print-ready PDF (RFC/W3C-inspired layout). Regenerate with `node specs/publication/build-aecs-1-pdf.mjs`.
- [`schema/normalized-email.schema.json`](./schema/normalized-email.schema.json) — JSON Schema (draft 2020-12) for AECS-1's `NormalizedEmail`. Validates shape, required fields, and the `x_`-namespacing rule (§9).
- [`conformance/`](./conformance/) — fixture suite for AECS-1's threading algorithm (§5) and timestamp rules (§6), with an independent reference checker (`verify.py`). See AECS-1 §10 (Conformance).

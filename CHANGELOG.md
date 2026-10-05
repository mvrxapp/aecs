# Changelog

All notable changes to `@mvrx/aecs` and the AECS specifications in this repository.
Spec release history is also kept in each spec's Versioning section
([AECS-1 §8](./specs/AECS-1-ai-email-consumption.md#8-versioning),
[AECS-SDK-1 Appendix C](./specs/AECS-SDK-1-specification.md)).

## 0.3.0 — 2026-10-05

Implements **AECS-1 1.1.0** and **AECS-SDK-1 0.4.0-draft**.

### Fixed
- **Cleanup no longer deletes the sender's reply.** `content.clean` and `content.forAI`
  used to keep only the text above the first quote marker, so bottom-posted and inline
  answers were lost. A body that opened with a quote came out empty. Authored lines are
  now always kept, with up to 3 quoted lines above each one as context (longer quotes
  are cut down, with a `> [N quoted lines omitted]` marker). Only quoted history after
  the sender's last line is removed.
- **Dividers are not quote boundaries.** A line of underscores on its own (common in
  newsletters) no longer cuts the rest of the email. It still starts history when an
  Outlook-style `From:`/`Sent:` header block follows it.
- **Signature removal is size-limited.** `-- `, `Sent from my …` and disclaimer markers
  only remove a short trailing block, so authored text after a lookalike is kept.
- **No more empty `clean` for non-empty mail.** If cleanup would leave nothing, `clean`
  falls back to `text` and `processing.cleanFallback` is `true`.
- **Forwarded content is kept.** A `From:`/`Date:` header block directly under a
  `---------- Forwarded message ---------` or `Begin forwarded message:` marker is the
  forwarded email, not reply history, so its body is no longer deleted.
- Attributions wrapped onto two lines (`On …, Alice Example` / `<alice@…> wrote:`) are
  now recognised.

### Changed
- **`content.raw` keeps quoted history**, as AECS-1 Appendix A and AECS-SDK-1 §4 always
  showed. It was quote-stripped before, which contradicted the spec's own example.
- **A custom `cleaner` receives the full `text`**, quotes included, and replaces both
  quote and signature removal. It used to receive quote-stripped text.
- `processing.specVersion` defaults to `"1.1"`.

### Added
- **Typed decision models** in `@mvrx/aecs/decisions` (AECS-SDK-1 §6.3): a
  `DecisionProvider` interface for "System One" models, which return typed answers
  (`noul`, `choice`, `score`) with probabilities instead of generated text.
  - `jevProvider` — TypeSafe Jev (`api.typesafe.ai/v1/systemone`, or OpenRouter).
  - `clefProvider` / `clefRestProvider` — Cloudflare Clef and Clef-flash on Workers AI,
    including image input.
  - `systemOneProvider` — any endpoint that speaks the System One format.
  - `textDecisionProvider` — answers the same typed questions with any text LLM. Use
    it for OpenAI until the Decisions API publishes a schema.
  - `decideEmail` / `emailToDecisionState` — build the model's `state` from a
    `NormalizedEmail`, keeping the `forAI` untrusted-content wrapper.
- Optional `processing.cleanFallback` in the type and the JSON Schema.
- Content-preservation conformance fixtures (`specs/conformance/content/`), checked by
  `verify.py` and run by `test/content.test.mjs`.

### Specification
- **AECS-1 1.1.0:** new §4.3.1 Content Preservation (what cleanup may and may not
  remove), §10 conformance points 8–9, guidance that `forAI` is lossy and that apps
  acting on the body should keep `text` as a fallback, and the `content.raw` fix.
  Implementations that keep only the text above the first quote marker were
  AECS-1.0-conformant and are not AECS-1.1-conformant.
- **AECS-SDK-1 0.4.0-draft:** new §6.3 Decision Models (typed answers).
- **AECS-SDK-1 0.3.1-draft:** §4 describes the default cleaner accurately (removes the
  incorrect "content is retained when confidence is low" claim) and §11.2 adds the
  fallback guidance.

## 0.2.0 and earlier

See the [git history](https://github.com/mvrxapp/aecs/commits/main).

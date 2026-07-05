# AECS-1 PDF Publication

Builds a print-ready PDF of the AECS-1 specification using conventions drawn from
[IETF RFC 7322](https://www.rfc-editor.org/rfc/rfc7322) (document structure, abstract,
status boilerplate, security section, appendices) and
[W3C Technical Report](https://w3c.github.io/manual-of-style/) practice (status section,
normative RFC 2119 keywords, references with titles).

## Build

```bash
node specs/publication/build-aecs-1-pdf.mjs
```

Output: [`../AECS-1-ai-email-consumption.pdf`](../AECS-1-ai-email-consumption.pdf)

Requires Node.js 18+ and network access on first run (`npx md-to-pdf` downloads Chromium).

## Layout choices

| Element | Standard reference | AECS-1 implementation |
|---|---|---|
| First-page header | RFC 7322 §4.1 | Monospace header block (org, doc ID, version, date) |
| Title & abstract | RFC 7322 §4.2–4.3 | Centered title; abstract before body |
| Status section | W3C §Parts | Boxed "Status of This Document" with version and errata URI |
| Copyright | RFC 7322 §4.6 | CC0 1.0 notice (spec license) |
| Body typography | RFC 7322 / CMOS | Charter/Georgia serif, 11pt, letter page |
| Code & tables | RFC 7991 | Monospace pre/code; bordered tables |
| Page footer | Common practice | Doc ID, page numbers, canonical URI |
| Cross-references | RFC 7322 §3.5 | Section numbers (§N) in source markdown |

The canonical editable source remains [`AECS-1-ai-email-consumption.md`](../AECS-1-ai-email-consumption.md).
Regenerate the PDF after spec changes.
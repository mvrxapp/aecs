#!/usr/bin/env node
// Copies the normative AECS specs from specs/ into the Starlight docs site
// (docs/src/content/docs/specs), injecting frontmatter so they render through
// the site's default doc layout. Specs stay single-sourced in specs/ — this
// file is the only place that duplicates their content, and it should be
// re-run (not hand-edited) whenever the specs change.
//
// Usage: node scripts/sync-docs-pages.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const specsRoot = path.join(repoRoot, "specs");
const outDir = path.join(repoRoot, "docs", "src", "content", "docs", "specs");

const SPECS = [
  {
    source: path.join(specsRoot, "AECS-1-ai-email-consumption.md"),
    dest: path.join(outDir, "aecs-1.md"),
    title: "AECS-1 (v1.0.0, Final)",
    description:
      "The full normative AECS-1 v1.0.0 (Final) specification — NormalizedEmail schema, threading, timestamps, security, and conformance.",
  },
  {
    source: path.join(specsRoot, "AECS-SDK-1-specification.md"),
    dest: path.join(outDir, "aecs-sdk-1.md"),
    title: "AECS-SDK-1 (v0.3.0-draft)",
    description:
      "The AECS SDK specification (0.3.0-draft) — the full target TypeScript SDK surface, with implemented-vs-roadmap status per section.",
  },
];

function yamlEscape(value) {
  return value.replace(/"/g, '\\"');
}

function main() {
  mkdirSync(outDir, { recursive: true });

  for (const spec of SPECS) {
    const body = readFileSync(spec.source, "utf8");
    const relativeSource = path.relative(repoRoot, spec.source);
    const frontmatter = [
      "---",
      `title: "${yamlEscape(spec.title)}"`,
      `description: "${yamlEscape(spec.description)}"`,
      "---",
      "",
      body,
    ].join("\n");

    writeFileSync(spec.dest, frontmatter, "utf8");
    console.log(`[sync-docs] wrote ${path.relative(repoRoot, spec.dest)} from ${relativeSource}`);
  }
}

main();

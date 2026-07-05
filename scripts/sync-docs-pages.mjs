#!/usr/bin/env node
// Copies the normative AECS specs from specs/ into the GitHub
// Pages docs site (docs/specs), injecting Jekyll frontmatter so they render
// through the docs/_config.yml default layout. Specs stay single-sourced in
// specs/ — this file is the only place that duplicates their
// content, and it should be re-run (not hand-edited) whenever the specs change.
//
// Usage: node scripts/sync-docs-pages.mjs

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const specsRoot = path.join(repoRoot, "specs");
const outDir = path.join(repoRoot, "docs", "specs");

const SPECS = [
  {
    source: path.join(specsRoot, "AECS-1-ai-email-consumption.md"),
    dest: path.join(outDir, "aecs-1.md"),
    title: "AECS-1 specification",
    navOrder: 2,
  },
  {
    source: path.join(specsRoot, "AECS-SDK-1-specification.md"),
    dest: path.join(outDir, "aecs-sdk-1.md"),
    title: "AECS-SDK-1 specification",
    navOrder: 3,
  },
];

function main() {
  mkdirSync(outDir, { recursive: true });

  for (const spec of SPECS) {
    if (!existsSync(spec.source)) {
      console.error(`[sync-docs] source not found, skipping: ${spec.source}`);
      continue;
    }

    const body = readFileSync(spec.source, "utf8");
    const relativeSource = path.relative(repoRoot, spec.source);
    const frontmatter = [
      "---",
      "layout: default",
      `title: ${spec.title}`,
      `nav_order: ${spec.navOrder}`,
      "---",
      "",
      body,
    ].join("\n");

    writeFileSync(spec.dest, frontmatter, "utf8");
    console.log(`[sync-docs] wrote ${path.relative(repoRoot, spec.dest)} from ${relativeSource}`);
  }
}

main();

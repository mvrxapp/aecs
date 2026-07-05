#!/usr/bin/env node
// Splits the normative AECS specs from specs/ into per-section pages in the
// Starlight docs site (docs/src/content/docs/specs/<spec>/), one page per
// top-level "## " heading (plus a leading overview page for the preamble),
// injecting frontmatter so each renders through the site's default doc
// layout. Specs stay single-sourced in specs/ — this file is the only place
// that duplicates their content, and it should be re-run (not hand-edited)
// whenever the specs change.
//
// Usage: node scripts/sync-docs-pages.mjs

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const specsRoot = path.join(repoRoot, "specs");
const outRoot = path.join(repoRoot, "docs", "src", "content", "docs", "specs");

const SPECS = [
  {
    source: path.join(specsRoot, "AECS-1-ai-email-consumption.md"),
    destDir: path.join(outRoot, "aecs-1"),
  },
  {
    source: path.join(specsRoot, "AECS-SDK-1-specification.md"),
    destDir: path.join(outRoot, "aecs-sdk-1"),
  },
];

// Old single-page outputs this script used to produce, before the switch to
// per-section splitting. Removed if still present on disk.
const STALE_FILES = [path.join(outRoot, "aecs-1.md"), path.join(outRoot, "aecs-sdk-1.md")];

function yamlEscape(value) {
  return value.replace(/"/g, '\\"');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Strips a leading numeric prefix like "1. " or "10. " (used only for slugs,
// not titles) — headings like "Appendix A: ..." have no such prefix and are
// left untouched.
function stripLeadingNumber(text) {
  return text.replace(/^\d+\.\s*/, "");
}

function splitIntoSections(body) {
  const lines = body.split("\n");
  const headingIndices = [];
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^## (.+)$/);
    if (match) headingIndices.push({ line: i, heading: match[1] });
  }

  const sections = [];

  const firstHeadingLine = headingIndices.length > 0 ? headingIndices[0].line : lines.length;
  sections.push({
    title: "Overview",
    slug: "overview",
    body: lines.slice(0, firstHeadingLine).join("\n"),
  });

  for (let i = 0; i < headingIndices.length; i++) {
    const { line, heading } = headingIndices[i];
    const nextLine = i + 1 < headingIndices.length ? headingIndices[i + 1].line : lines.length;
    // Drop the "## heading" line itself; keep everything else verbatim.
    const sectionBody = lines.slice(line + 1, nextLine).join("\n");
    sections.push({
      title: heading,
      slug: slugify(stripLeadingNumber(heading)),
      body: sectionBody,
    });
  }

  return sections;
}

function main() {
  for (const stale of STALE_FILES) {
    if (existsSync(stale)) {
      rmSync(stale);
      console.log(`[sync-docs] removed stale file ${path.relative(repoRoot, stale)}`);
    }
  }

  for (const spec of SPECS) {
    const source = readFileSync(spec.source, "utf8");
    const relativeSource = path.relative(repoRoot, spec.source);
    const sections = splitIntoSections(source);

    rmSync(spec.destDir, { recursive: true, force: true });
    mkdirSync(spec.destDir, { recursive: true });

    sections.forEach((section, index) => {
      const filename = `${String(index).padStart(2, "0")}-${section.slug}.md`;
      const dest = path.join(spec.destDir, filename);
      const frontmatter = [
        "---",
        `title: "${yamlEscape(section.title)}"`,
        "---",
        "",
        section.body,
      ].join("\n");
      writeFileSync(dest, frontmatter, "utf8");
    });

    console.log(
      `[sync-docs] wrote ${sections.length} pages to ${path.relative(repoRoot, spec.destDir)}/ from ${relativeSource}`,
    );
  }
}

main();

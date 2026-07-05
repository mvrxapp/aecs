#!/usr/bin/env node
/**
 * Build AECS-1 specification PDF (RFC/W3C-inspired layout).
 *
 * Usage: node specs/publication/build-aecs-1-pdf.mjs
 * Output: specs/AECS-1-ai-email-consumption.pdf
 */

import { readFile, rename, writeFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SPEC_MD = join(ROOT, "AECS-1-ai-email-consumption.md");
const FRONT_MATTER = join(__dirname, "front-matter.html");
const STYLESHEET = join(__dirname, "aecs-1.css");
const OUTPUT = join(ROOT, "AECS-1-ai-email-consumption.pdf");
const TEMP_MD = join(__dirname, ".aecs-1-build.tmp.md");

function stripDuplicateFrontMatter(markdown) {
  // Remove title block through first horizontal rule — front-matter.html replaces it.
  const lines = markdown.split("\n");
  let start = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("## 1. Purpose")) {
      start = i;
      break;
    }
  }
  return lines.slice(start).join("\n");
}

async function buildCombinedMarkdown() {
  const front = await readFile(FRONT_MATTER, "utf8");
  const spec = await readFile(SPEC_MD, "utf8");
  const body = stripDuplicateFrontMatter(spec);
  return `${front}\n\n${body}\n`;
}

function runMdToPdf(inputPath) {
  return new Promise((resolve, reject) => {
    const args = [
      inputPath,
      "--document-title",
      "AECS-1: AI Email Consumption Specification",
      "--stylesheet",
      STYLESHEET,
      "--pdf-options",
      JSON.stringify({
        format: "Letter",
        printBackground: true,
        margin: { top: "0.75in", right: "1in", bottom: "0.9in", left: "1in" },
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `
          <div style="width:100%;font-size:8pt;color:#666;padding:0 1in;
                      font-family:Consolas,'Courier New',monospace;
                      display:flex;justify-content:space-between;">
            <span>AECS-1 v1.0.0</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
            <span>mvrx.app/specs/aecs-1</span>
          </div>`,
      }),
    ];

    const child = spawn("npx", ["--yes", "md-to-pdf@5", ...args], {
      stdio: "inherit",
      cwd: join(__dirname, "../.."),
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`md-to-pdf exited with code ${code}`));
    });
  });
}

async function main() {
  const combined = await buildCombinedMarkdown();
  await writeFile(TEMP_MD, combined, "utf8");

  const tempPdf = TEMP_MD.replace(/\.md$/, ".pdf");

  try {
    console.log("Building AECS-1 PDF…");
    await runMdToPdf(TEMP_MD);
    await rename(tempPdf, OUTPUT);
    console.log(`Wrote ${OUTPUT}`);
  } finally {
    await unlink(TEMP_MD).catch(() => {});
    await unlink(tempPdf).catch(() => {});
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
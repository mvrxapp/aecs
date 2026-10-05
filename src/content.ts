import type { ForAIOptions, NormalizedEmail } from "./types.js";

export function htmlToText(html: string): string {
  const withoutChrome = html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  const withQuotedBlocks = withoutChrome.replace(
    /<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi,
    (_match, inner: string) => {
      const quoted = htmlToText(inner)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `> ${line}`)
        .join("\n");
      return quoted ? `\n${quoted}\n` : "\n";
    },
  );

  return decodeHtmlEntities(
    withQuotedBlocks
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n")
      .replace(
        /<\/?(address|article|aside|div|footer|h[1-6]|header|hr|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi,
        "\n",
      )
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function normalizeText(text: string): string {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t\f\v]+/g, " ").trimEnd());

  while (lines.length && !lines[0]?.trim()) lines.shift();
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();

  const out: string[] = [];
  for (const line of lines) {
    if (!line.trim() && !out.at(-1)?.trim()) continue;
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Quoted lines kept, per quoted block, as context for the authored line that follows (AECS-1 §4.3.1). */
const QUOTE_CONTEXT_LINES = 3;
/** Largest trailing block, in non-empty lines, that signature rules may remove (AECS-1 §4.3.1). */
const MAX_SIGNATURE_LINES = 10;
const MAX_DISCLAIMER_LINES = 15;

type LineKind = "authored" | "quoted" | "attribution" | "blank";

/**
 * Remove quoted reply history while keeping every authored line (AECS-1 §4.3.1).
 *
 * - Unprefixed history (an "Original Message" separator, or a From:/Sent: header block,
 *   optionally under an underscore divider) is removed from its start to the end.
 * - Quoted (`>`) lines and attribution lines after the last authored line are removed.
 * - Authored lines below or between quotes (bottom-posted and inline replies) are kept,
 *   with up to QUOTE_CONTEXT_LINES of the quote directly above each one as context.
 * - A divider line on its own is never treated as the start of quoted history.
 */
export function stripQuotedChains(text: string): string {
  let lines = normalizeText(text).split("\n");
  const history = lines.findIndex((_line, index) => isUnprefixedHistoryStart(lines, index));
  if (history >= 0) lines = lines.slice(0, history);

  const kinds = classifyLines(lines);
  const lastAuthored = kinds.lastIndexOf("authored");
  if (lastAuthored < 0) return "";

  const out: string[] = [];
  let quoted: string[] = [];
  const flushQuoted = () => {
    const kept = quoted.slice(-QUOTE_CONTEXT_LINES);
    const omitted = quoted.length - kept.length;
    if (omitted > 0) out.push(`> [${omitted} quoted line${omitted === 1 ? "" : "s"} omitted]`);
    out.push(...kept);
    quoted = [];
  };

  for (let i = 0; i <= lastAuthored; i++) {
    const kind = kinds[i];
    if (kind === "quoted") quoted.push(lines[i]);
    else if (kind === "authored") {
      flushQuoted();
      out.push(lines[i]);
    } else if (kind === "blank" && quoted.length === 0) out.push(lines[i]);
  }
  return normalizeText(out.join("\n"));
}

/**
 * Remove a trailing signature block. Each rule only fires when the block it would remove
 * is short, so authored text after a lookalike line is kept (AECS-1 §4.3.1).
 */
export function stripSignature(text: string): string {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n");
  const tailSize = (from: number) => lines.slice(from).filter((line) => line.trim()).length;
  const cutAt = (index: number, max: number) => index > 0 && tailSize(index) <= max;

  const delimiter = lines.findIndex((line) => /^--\s*$/.test(line.trim()));
  if (cutAt(delimiter, MAX_SIGNATURE_LINES + 1)) return normalizeText(lines.slice(0, delimiter).join("\n"));

  const mobile = lines.findIndex((line) =>
    /^Sent from my (iPhone|iPad|Android|Pixel|Samsung|mobile device)\b/i.test(line.trim()),
  );
  if (cutAt(mobile, 3)) return normalizeText(lines.slice(0, mobile).join("\n"));

  const disclaimer = lines.findIndex(
    (line, index) =>
      index > 0 &&
      /^(confidentiality notice|confidential:|this (email|message).*(confidential|intended only)|the information contained in this (email|message))/i.test(
        line.trim(),
      ),
  );
  if (cutAt(disclaimer, MAX_DISCLAIMER_LINES)) return normalizeText(lines.slice(0, disclaimer).join("\n"));

  for (let i = Math.max(1, lines.length - 4); i < lines.length; i++) {
    const line = lines[i]?.trim() ?? "";
    const tail = lines.slice(i + 1).filter((candidate) => candidate.trim());
    const tailText = tail.join(" ");
    if (
      /^(best|best regards|regards|kind regards|thanks|thank you|cheers|sincerely),?$/i.test(
        line,
      ) &&
      tail.length <= 2 &&
      tailText.length <= 80 &&
      !tailText.includes("?")
    ) {
      return normalizeText(lines.slice(0, i).join("\n"));
    }
  }

  return normalized;
}

export function makeForAI(
  clean: string | null,
  email: NormalizedEmail,
  options: ForAIOptions = {},
): string | null {
  if (clean === null) return null;
  const maxChars = options.forAIMaxChars ?? 8_000;
  let out = clean
    .replace(/\b(cid|data):[^\s)]+/gi, "[inline image removed]")
    .replace(/^[-_]{2,}\s*Forwarded message\s*[-_]{2,}$/gim, "[forwarded message]")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (out.length > maxChars) out = `${out.slice(0, Math.max(0, maxChars - 12)).trimEnd()}\n[truncated]`;
  if (options.wrapper) out = options.wrapper.wrap(out, email);
  return out;
}

function classifyLines(lines: string[]): LineKind[] {
  return lines.map((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) return "blank";
    if (trimmed.startsWith(">")) return "quoted";
    if (isAttribution(lines, index)) return "attribution";
    if (index > 0 && /wrote:$/i.test(trimmed) && isAttribution(lines, index - 1)) return "attribution";
    return "authored";
  });
}

/** "On <date>, <name> wrote:" — on one line, or wrapped onto a second line ending "wrote:". */
function isAttribution(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() ?? "";
  if (/^On\b.+wrote:$/i.test(line)) return true;
  if (!/^On\b.+/i.test(line)) return false;
  const next = lines[index + 1]?.trim() ?? "";
  if (!/wrote:$/i.test(next) || next.length > 80) return false;
  const after = lines[index + 2]?.trim() ?? "";
  return after === "" || after.startsWith(">");
}

function isUnprefixedHistoryStart(lines: string[], index: number): boolean {
  const line = lines[index]?.trim() ?? "";
  if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(line)) return true;
  if (/^_{5,}$/.test(line)) return isHeaderBlock(lines, nextNonEmpty(lines, index));
  // A header block under a forwarded-message marker introduces forwarded content, which is kept.
  return isHeaderBlock(lines, index) && !isForwardMarker(lines[previousNonEmpty(lines, index)]);
}

function isForwardMarker(line: string | undefined): boolean {
  const trimmed = line?.trim() ?? "";
  return /^[-_]{2,}\s*Forwarded message\s*[-_]{2,}$/i.test(trimmed) || /^Begin forwarded message:$/i.test(trimmed);
}

function previousNonEmpty(lines: string[], index: number): number {
  for (let i = index - 1; i >= 0; i--) if (lines[i]?.trim()) return i;
  return -1;
}

/** A "From: …" line followed within five lines by Sent:/Date:/To:/Subject: — a pasted reply or forward header. */
function isHeaderBlock(lines: string[], index: number): boolean {
  if (index < 0 || !/^From:\s+\S+/i.test(lines[index]?.trim() ?? "")) return false;
  return lines
    .slice(index + 1, index + 6)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .some((candidate) => /^(Sent|Date|To|Subject):\s+/i.test(candidate));
}

function nextNonEmpty(lines: string[], index: number): number {
  for (let i = index + 1; i < lines.length; i++) if (lines[i]?.trim()) return i;
  return -1;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => decodeCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code: string) =>
      decodeCodePoint(Number.parseInt(code, 16)),
    );
}

function decodeCodePoint(code: number): string {
  if (!Number.isFinite(code) || code < 0) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

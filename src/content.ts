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

export function stripQuotedChains(text: string): string {
  const lines = normalizeText(text).split("\n");
  const cut = lines.findIndex((line, index) => isQuoteStart(lines, index, line.trim()));
  return normalizeText((cut >= 0 ? lines.slice(0, cut) : lines).join("\n"));
}

export function stripSignature(text: string): string {
  const normalized = normalizeText(text);
  const lines = normalized.split("\n");
  const delimiter = lines.findIndex((line) => /^--\s*$/.test(line.trim()));
  if (delimiter > 0) return normalizeText(lines.slice(0, delimiter).join("\n"));

  const mobile = lines.findIndex((line) =>
    /^Sent from my (iPhone|iPad|Android|Pixel|Samsung|mobile device)\b/i.test(line.trim()),
  );
  if (mobile > 0) return normalizeText(lines.slice(0, mobile).join("\n"));

  const disclaimer = lines.findIndex(
    (line, index) =>
      index > 0 &&
      /^(confidentiality notice|confidential:|this (email|message).*(confidential|intended only)|the information contained in this (email|message))/i.test(
        line.trim(),
      ),
  );
  if (disclaimer > 0) return normalizeText(lines.slice(0, disclaimer).join("\n"));

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

function isQuoteStart(lines: string[], index: number, line: string): boolean {
  if (!line) return false;
  if (line.startsWith(">")) return true;
  if (/^On .+wrote:$/i.test(line)) return true;
  if (/^-{2,}\s*Original Message\s*-{2,}$/i.test(line)) return true;
  if (/^_{5,}$/.test(line)) return true;
  if (!/^From:\s+\S+/i.test(line)) return false;

  const next = lines
    .slice(index + 1, index + 6)
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  return next.some((candidate) => /^(Sent|Date|To|Subject):\s+/i.test(candidate));
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

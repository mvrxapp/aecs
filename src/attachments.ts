import type { Attachment, AttachmentsForAIOptions, ForAIWrapper, NormalizedEmail } from "./types.js";
import { wrappers } from "./wrappers.js";

const DEFAULT_WRAPPER: ForAIWrapper = wrappers.xml("attachment");

/**
 * Aggregate attachment extractedText into a single LLM-ready string.
 * Mirrors the algorithm published by @mvrx/mail/attachments (spec §9.6),
 * kept self-contained here so @mvrx/aecs has no dependency on any L2 package.
 */
export function buildAttachmentContext(
  attachments: Attachment[],
  options: AttachmentsForAIOptions = {},
): string | null {
  const maxCharsPerAttachment = options.maxCharsPerAttachment ?? 4_000;
  const maxTotalChars = options.maxTotalChars ?? 16_000;
  const wrapper = options.wrapper === undefined ? DEFAULT_WRAPPER : options.wrapper;
  const label = options.label ?? ((att: Attachment) => att.filename);

  const candidates = attachments.filter(
    (att): att is Attachment & { extractedText: string } =>
      typeof att.extractedText === "string" &&
      att.extractedText.length > 0 &&
      matchesInclude(att.contentType, options.include),
  );
  if (candidates.length === 0) return null;

  const blocks: string[] = [];
  let total = 0;

  for (const att of candidates) {
    const truncated = truncate(att.extractedText, maxCharsPerAttachment);
    const block =
      wrapper === DEFAULT_WRAPPER
        ? `<attachment name="${escapeAttr(label(att))}" type="${escapeAttr(att.contentType)}">\n${truncated}\n</attachment>`
        : wrapper
          ? wrapper.wrap(truncated, undefined as unknown as NormalizedEmail)
          : truncated;

    const separatorLen = blocks.length === 0 ? 0 : 2;
    if (total + separatorLen + block.length > maxTotalChars) {
      const remaining = maxTotalChars - total - separatorLen;
      if (remaining > 0) {
        blocks.push(block.slice(0, remaining));
        total += separatorLen + remaining;
      }
      break;
    }

    blocks.push(block);
    total += separatorLen + block.length;
  }

  return blocks.length > 0 ? blocks.join("\n\n") : null;
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n[truncated — ${maxChars} chars shown of ${text.length}]`;
}

function matchesInclude(contentType: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return true;
  return patterns.some((pattern) => {
    if (pattern === "*") return true;
    if (pattern.endsWith("/*")) return contentType.startsWith(pattern.slice(0, -1));
    return pattern === contentType;
  });
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

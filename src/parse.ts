import PostalMime, {
  type Address as PostalAddress,
  type Attachment as PostalAttachment,
  type Email as PostalEmail,
} from "postal-mime";
import { htmlToText, makeForAI, normalizeText, stripQuotedChains, stripSignature } from "./content.js";
import {
  generatedMessageId,
  normalizeDate,
  normalizeMessageId,
  parseReferences,
  resolveThreadId,
  toIsoUtcSeconds,
} from "./threading.js";
import type {
  Address,
  Attachment,
  AttachmentError,
  ForAIOptions,
  NormalizedEmail,
  ParseOptions,
  ParsedEmail,
  RawHeaders,
} from "./types.js";

export type EmailSource =
  | string
  | ArrayBuffer
  | Uint8Array
  | ReadableStream<Uint8Array>
  | { raw: ReadableStream<Uint8Array> };

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024;

export async function parse(source: EmailSource, options: ParseOptions = {}): Promise<ParsedEmail> {
  const raw = await sourceToBytes(source, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
  const rawFull = new TextDecoder().decode(raw);
  const parsed = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });
  const date = normalizeDate(parsed.date);
  const references = parseReferences(parsed.references);
  const inReplyTo = normalizeMessageId(parsed.inReplyTo);
  const ownMessageId = normalizeMessageId(parsed.messageId);
  const messageId = ownMessageId ?? (await generatedMessageId(rawFull));
  const rawHeaders: RawHeaders = {
    messageId: ownMessageId,
    inReplyTo,
    references,
    from: firstAddress(parsed.from)?.email ?? null,
    subject: parsed.subject ?? null,
    date: date.date,
  };
  const threadId = options.threadIdResolver
    ? await options.threadIdResolver(rawHeaders)
    : await resolveThreadId(rawHeaders);

  const text = parsed.text ? normalizeText(parsed.text) : parsed.html ? htmlToText(parsed.html) : null;
  const rawBody = text ? stripQuotedChains(text) : null;
  const clean = rawBody ? await cleanText(rawBody, options.cleaner) : null;

  const attachments = parsed.attachments.map((attachment, index) =>
    toAttachment(attachment, `${messageId}:${index}`),
  );
  const attachmentErrors: AttachmentError[] = [];

  const email: NormalizedEmail = {
    messageId,
    threadId,
    metadata: {
      from: firstAddress(parsed.from) ?? { name: null, email: "" },
      to: addressList(parsed.to),
      cc: addressList(parsed.cc),
      bcc: addressList(parsed.bcc),
      subject: parsed.subject ?? null,
      date: date.date,
      timestamp: date.timestamp,
    },
    content: {
      rawFull,
      raw: rawBody,
      html: parsed.html ?? null,
      text,
      clean,
      forAI: null,
    },
    thread: {
      position: null,
      inReplyTo,
      references,
    },
    attachments,
    processing: {
      processedAt: toIsoUtcSeconds(new Date()),
      specVersion: options.specVersion ?? "1.0",
      attachmentErrors,
    },
  };

  email.content.forAI = makeForAI(email.content.clean, email, options);

  if (options.onAttachment) {
    for (const attachment of attachments) {
      try {
        await options.onAttachment(attachment, { messageId });
      } catch (error) {
        attachmentErrors.push({
          filename: attachment.filename,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  Object.defineProperty(email, "forAI", {
    enumerable: false,
    value: (forAIOptions: ForAIOptions = {}) =>
      makeForAI(email.content.clean, email, { ...options, ...forAIOptions }) ?? "",
  });

  return email as ParsedEmail;
}

async function cleanText(
  rawBody: string,
  cleaner?: (text: string) => string | Promise<string>,
): Promise<string> {
  const cleaned = cleaner ? await cleaner(rawBody) : stripSignature(rawBody);
  return normalizeText(cleaned);
}

function firstAddress(input: PostalAddress | undefined): Address | null {
  if (!input) return null;
  if ("group" in input) return input.group?.[0] ? toAddress(input.group[0]) : null;
  return toAddress(input);
}

function addressList(input: PostalEmail["to"]): Address[] {
  return (input ?? []).flatMap((address) => {
    if ("group" in address) return address.group?.map(toAddress) ?? [];
    return [toAddress(address)];
  });
}

function toAddress(input: { name?: string; address?: string }): Address {
  return {
    name: input.name?.trim() || null,
    email: input.address?.trim().toLowerCase() ?? "",
  };
}

function toAttachment(input: PostalAttachment, id: string): Attachment {
  const bytes = attachmentBytes(input.content);
  return {
    id,
    filename: input.filename ?? "attachment",
    contentType: input.mimeType,
    size: bytes.byteLength,
    cid: normalizeMessageId(input.contentId) ?? null,
    content: async () => bytes,
  };
}

function attachmentBytes(content: PostalAttachment["content"]): Uint8Array {
  if (content instanceof Uint8Array) return content;
  if (content instanceof ArrayBuffer) return new Uint8Array(content);
  return new TextEncoder().encode(content);
}

async function sourceToBytes(source: EmailSource, maxBytes: number): Promise<Uint8Array> {
  if (typeof source === "string") return new TextEncoder().encode(source);
  if (source instanceof Uint8Array) return source;
  if (source instanceof ArrayBuffer) return new Uint8Array(source);
  if (isCloudflareEmail(source)) return streamToBytes(source.raw, maxBytes);
  return streamToBytes(source, maxBytes);
}

function isCloudflareEmail(source: EmailSource): source is { raw: ReadableStream<Uint8Array> } {
  return typeof source === "object" && source !== null && "raw" in source;
}

async function streamToBytes(stream: ReadableStream<Uint8Array>, maxBytes: number): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) throw new Error(`email source exceeds maxBodyBytes (${maxBytes})`);
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

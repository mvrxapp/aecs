import type { RawHeaders } from "./types.js";

export function normalizeMessageId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let value = raw.trim();
  if (value.startsWith("<") && value.endsWith(">")) value = value.slice(1, -1).trim();
  return value || null;
}

export function isValidMessageId(raw: string | null | undefined): raw is string {
  const value = normalizeMessageId(raw);
  if (!value) return false;
  const at = value.indexOf("@");
  return at > 0 && at === value.lastIndexOf("@") && at < value.length - 1;
}

export function parseReferences(raw: string | string[] | null | undefined): string[] {
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values
    .flatMap((value) => {
      const bracketed = value.match(/<[^>]+>/g);
      return bracketed?.length ? bracketed : value.split(/\s+/);
    })
    .map(normalizeMessageId)
    .filter((value): value is string => Boolean(value));
}

export async function resolveThreadId(headers: RawHeaders): Promise<string> {
  for (const ref of headers.references) {
    const normalized = normalizeMessageId(ref);
    if (isValidMessageId(normalized)) return normalized;
  }

  const inReplyTo = normalizeMessageId(headers.inReplyTo);
  if (isValidMessageId(inReplyTo)) return inReplyTo;

  const messageId = normalizeMessageId(headers.messageId);
  if (isValidMessageId(messageId)) return messageId;

  return fallbackThreadId(headers);
}

export async function fallbackThreadId(headers: RawHeaders): Promise<string> {
  const from = (headers.from ?? "").normalize("NFC");
  const subject = (headers.subject ?? "").trim().toLowerCase().normalize("NFC");
  const date = (headers.date ?? "").normalize("NFC");
  return sha256Hex(`${from}:${subject}:${date}`);
}

export async function generatedMessageId(rawFull: string): Promise<string> {
  const hash = await sha256Hex(rawFull);
  return `generated-${hash.slice(0, 32)}@aecs.local`;
}

export function normalizeDate(raw: string | null | undefined): {
  date: string | null;
  timestamp: number | null;
} {
  if (!raw) return { date: null, timestamp: null };
  const parsed = new Date(raw);
  const millis = parsed.getTime();
  if (!Number.isFinite(millis)) return { date: null, timestamp: null };
  const timestamp = Math.floor(millis / 1000);
  return { date: toIsoUtcSeconds(new Date(timestamp * 1000)), timestamp };
}

export function toIsoUtcSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

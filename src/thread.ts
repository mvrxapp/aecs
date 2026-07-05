import { makeForAI } from "./content.js";
import type { Address, NormalizedEmail, ThreadForAIOptions } from "./types.js";

export class EmailThread {
  readonly threadId: string;
  readonly messages: NormalizedEmail[];

  private constructor(threadId: string, messages: NormalizedEmail[]) {
    this.threadId = threadId;
    this.messages = messages;
  }

  static from(emails: NormalizedEmail[]): EmailThread {
    if (emails.length === 0) throw new Error("EmailThread.from requires at least one message");
    const sorted = [...emails].sort(compareEmailByTimestamp);
    sorted.forEach((email, position) => {
      email.thread.position = position;
    });
    return new EmailThread(sorted[0]!.threadId, sorted);
  }

  get root(): NormalizedEmail {
    return this.messages[0]!;
  }

  get latest(): NormalizedEmail {
    return this.messages[this.messages.length - 1]!;
  }

  get participants(): Address[] {
    const seen = new Set<string>();
    const out: Address[] = [];
    for (const message of this.messages) {
      for (const address of [
        message.metadata.from,
        ...message.metadata.to,
        ...message.metadata.cc,
        ...message.metadata.bcc,
      ]) {
        const key = address.email.toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(address);
      }
    }
    return out;
  }

  forAI(options: ThreadForAIOptions = {}): string {
    const order = options.order ?? "asc";
    const maxMessages = options.maxMessages ?? this.messages.length;
    const maxChars = options.maxCharsPerMessage ?? 2_000;
    const includeMetadata = options.includeMetadata ?? true;
    const selected =
      order === "asc"
        ? this.messages.slice(-maxMessages)
        : [...this.messages].reverse().slice(0, maxMessages);

    const blocks = selected.map((message) => {
      const body = truncate(
        makeForAI(message.content.clean ?? message.content.forAI, message, {
          forAIMaxChars: maxChars,
          wrapper: null,
        }) ?? "",
        maxChars,
      );
      if (!includeMetadata) return body;
      const from = message.metadata.from.name
        ? `${message.metadata.from.name} <${message.metadata.from.email}>`
        : message.metadata.from.email;
      return `From: ${from}\nDate: ${message.metadata.date ?? "unknown"}\n\n${body}`;
    });

    let out = blocks.filter(Boolean).join("\n\n---\n\n").trim();
    if (options.wrapper) {
      out = options.wrapper.wrap(out, this.latest);
    }
    return out;
  }
}

function compareEmailByTimestamp(a: NormalizedEmail, b: NormalizedEmail): number {
  const at = a.metadata.timestamp ?? Number.POSITIVE_INFINITY;
  const bt = b.metadata.timestamp ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at - bt;
  return a.messageId.localeCompare(b.messageId);
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, Math.max(0, maxChars - 12)).trimEnd()}\n[truncated]`;
}

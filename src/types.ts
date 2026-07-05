export interface Address {
  name: string | null;
  email: string;
}

export interface NormalizedEmail {
  messageId: string;
  threadId: string;
  metadata: {
    from: Address;
    to: Address[];
    cc: Address[];
    bcc: Address[];
    subject: string | null;
    date: string | null;
    timestamp: number | null;
  };
  content: {
    rawFull: string | null;
    raw: string | null;
    html: string | null;
    text: string | null;
    clean: string | null;
    forAI: string | null;
  };
  thread: {
    position: number | null;
    inReplyTo: string | null;
    references: string[];
  };
  attachments: Attachment[];
  processing: {
    processedAt: string;
    specVersion: string;
    attachmentErrors?: AttachmentError[];
  };
}

export interface ParsedEmail extends NormalizedEmail {
  forAI(options?: ForAIOptions): string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  cid: string | null;
  content(): Promise<Uint8Array>;
  extractedText?: string | null;
  blobKey?: string | null;
}

export interface AttachmentError {
  filename: string;
  message: string;
}

export interface ParseOptions extends ForAIOptions {
  maxBodyBytes?: number;
  cleaner?: (text: string) => string | Promise<string>;
  onAttachment?: AttachmentHandler;
  threadIdResolver?: (headers: RawHeaders) => string | Promise<string>;
  specVersion?: string;
}

export interface ForAIOptions {
  forAIMaxChars?: number;
  wrapper?: ForAIWrapper | null;
}

export interface ForAIWrapper {
  wrap(content: string, email: NormalizedEmail): string;
}

export type AttachmentHandler = (
  attachment: Attachment,
  ctx: { messageId: string },
) => Promise<void> | void;

export interface RawHeaders {
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  from: string | null;
  subject: string | null;
  date: string | null;
}

export interface ThreadForAIOptions extends ForAIOptions {
  maxMessages?: number;
  maxCharsPerMessage?: number;
  includeMetadata?: boolean;
  order?: "asc" | "desc";
}

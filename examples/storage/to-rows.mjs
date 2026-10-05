// Map a NormalizedEmail to storage rows, following AECS-1 Appendix C.
//
// Plain JavaScript with no dependencies (Web Crypto only), so it runs in Node 18+,
// Cloudflare Workers, Deno and browsers. The SQL, MongoDB and DynamoDB examples in
// this directory all store the shapes produced here.
//
//   const rows = await toRows(email, { mailboxId: "user-123" });
//   // email: any AECS-1-conformant object. Only messageId and threadId are required.
//   rows.message     → hot row: small, indexed, holds forAI       (aecs_messages)
//   rows.body        → warm row: text + clean, read on demand     (aecs_bodies)
//   rows.addresses   → one row per participant, for "mail with X" (aecs_addresses)
//   rows.references  → one row per References entry              (aecs_references)
//   rows.attachments → metadata only; bytes go to object storage  (aecs_attachments)
//   rows.blobs       → { key, body, contentType }[] for object storage (rawFull, html)

/** Lowercase hex SHA-256 of a UTF-8 string. Used for fixed-length keys. */
export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Object-storage prefix for a message: aecs/<mailboxKey>/<messageKey>/ */
export function blobPrefix(mailboxKey, messageKey) {
  return `aecs/${mailboxKey}/${messageKey}/`;
}

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const list = (value) => (Array.isArray(value) ? value : []);
const orNull = (value) => (value === undefined ? null : value);
const address = (value) =>
  isObject(value) && typeof value.email === "string"
    ? { email: value.email, name: typeof value.name === "string" ? value.name : null }
    : null;

/**
 * Fill every optional field of an AECS-1 object with its "not populated" value.
 *
 * AECS-1 requires only messageId and threadId. Every other field may be omitted or null,
 * and a conformant consumer treats both the same (AECS-1 §10, points 1–2). So this accepts
 * any conformant object, not only one produced by @mvrx/aecs parse(): a missing array
 * becomes [], a missing object or scalar becomes null.
 */
export function normalizeEmail(input) {
  if (!isObject(input)) throw new TypeError("toRows: expected a NormalizedEmail object");
  for (const field of ["messageId", "threadId"]) {
    if (typeof input[field] !== "string" || input[field] === "") {
      throw new TypeError(`toRows: ${field} is required by AECS-1 and must be a non-empty string`);
    }
  }
  const metadata = isObject(input.metadata) ? input.metadata : {};
  const content = isObject(input.content) ? input.content : {};
  const thread = isObject(input.thread) ? input.thread : {};
  const processing = isObject(input.processing) ? input.processing : {};
  const addresses = (value) => list(value).map(address).filter(Boolean);
  const timestamp = Number.isFinite(metadata.timestamp) ? metadata.timestamp : null;
  return {
    ...input,
    metadata: {
      from: address(metadata.from),
      to: addresses(metadata.to),
      cc: addresses(metadata.cc),
      bcc: addresses(metadata.bcc),
      subject: orNull(metadata.subject),
      date: orNull(metadata.date),
      timestamp,
    },
    content: {
      rawFull: orNull(content.rawFull),
      raw: orNull(content.raw),
      html: orNull(content.html),
      text: orNull(content.text),
      clean: orNull(content.clean),
      forAI: orNull(content.forAI),
    },
    thread: {
      position: orNull(thread.position),
      inReplyTo: orNull(thread.inReplyTo),
      references: list(thread.references).filter((ref) => typeof ref === "string" && ref !== ""),
    },
    attachments: list(input.attachments).filter(isObject),
    processing: {
      processedAt: typeof processing.processedAt === "string" ? processing.processedAt : null,
      specVersion: typeof processing.specVersion === "string" ? processing.specVersion : null,
      cleanFallback: processing.cleanFallback === true,
    },
  };
}

/** Epoch seconds for the sort key: metadata.timestamp, else processedAt, else now (AECS-1 Appendix C.2). */
function sortKey(email, now) {
  if (email.metadata.timestamp !== null) return email.metadata.timestamp;
  const processed = email.processing.processedAt === null ? NaN : Date.parse(email.processing.processedAt);
  return Math.floor((Number.isFinite(processed) ? processed : now.getTime()) / 1000);
}

/**
 * @param {import("@mvrx/aecs").NormalizedEmail} input Any AECS-1-conformant object; only
 *   messageId and threadId are required.
 * @param {{ mailboxId?: string, includeRaw?: boolean, now?: Date }} [options]
 */
export async function toRows(input, options = {}) {
  const email = normalizeEmail(input);
  const now = options.now ?? new Date();
  const mailboxId = options.mailboxId ?? "default";
  const [mailboxKey, messageKey, threadKey] = await Promise.all([
    sha256Hex(mailboxId),
    sha256Hex(email.messageId),
    sha256Hex(email.threadId),
  ]);
  const prefix = blobPrefix(mailboxKey, messageKey);
  const ts = sortKey(email, now);

  const blobs = [];
  if (email.content.rawFull !== null && options.includeRaw !== false) {
    blobs.push({ key: `${prefix}raw.eml`, body: email.content.rawFull, contentType: "message/rfc822" });
  }
  if (email.content.html !== null) {
    blobs.push({ key: `${prefix}body.html`, body: email.content.html, contentType: "text/html; charset=utf-8" });
  }

  const xFields = Object.fromEntries(Object.entries(email).filter(([key]) => key.startsWith("x_")));

  const message = {
    mailbox_id: mailboxId,
    message_key: messageKey,
    message_id: email.messageId,
    thread_key: threadKey,
    thread_id: email.threadId,
    ts,
    date: email.metadata.date,
    from_email: email.metadata.from?.email.toLowerCase() ?? "",   // "" when From is not populated
    from_name: email.metadata.from?.name ?? null,
    subject: email.metadata.subject,
    in_reply_to: email.thread.inReplyTo,
    forai: email.content.forAI,
    attachment_count: email.attachments.length,
    size_bytes: email.content.rawFull === null ? null : new TextEncoder().encode(email.content.rawFull).length,
    clean_fallback: email.processing.cleanFallback ? 1 : 0,
    spec_version: email.processing.specVersion ?? "unknown",   // "unknown" rows show up in stale_spec_version
    processed_at: email.processing.processedAt ?? now.toISOString(),
    blob_prefix: blobs.length > 0 ? prefix : null,
    x_fields: Object.keys(xFields).length > 0 ? JSON.stringify(xFields) : null,
  };

  const body = {
    mailbox_id: mailboxId,
    message_key: messageKey,
    text: email.content.text,
    clean: email.content.clean,
  };

  const addresses = [];
  const seen = new Set();
  const addAddress = (role, address) => {
    if (address === null) return;
    const emailLower = address.email.toLowerCase();
    const id = `${role}\u0000${emailLower}`;
    if (!emailLower || seen.has(id)) return;
    seen.add(id);
    addresses.push({
      mailbox_id: mailboxId,
      message_key: messageKey,
      role,
      email: emailLower,
      name: address.name,
      ts,
      thread_key: threadKey,
    });
  };
  addAddress("from", email.metadata.from);
  for (const a of email.metadata.to) addAddress("to", a);
  for (const a of email.metadata.cc) addAddress("cc", a);
  for (const a of email.metadata.bcc) addAddress("bcc", a);

  const references = await Promise.all(
    email.thread.references.map(async (refId, position) => ({
      mailbox_id: mailboxId,
      message_key: messageKey,
      position,
      ref_id: refId,
      ref_key: await sha256Hex(refId), // fixed-length stand-in where ref_id is too long to index (MySQL, DynamoDB)
    })),
  );

  const attachments = email.attachments.map((att, index) => ({
    mailbox_id: mailboxId,
    message_key: messageKey,
    idx: index,
    attachment_id: typeof att.id === "string" ? att.id : `${email.messageId}:${index}`,
    filename: typeof att.filename === "string" ? att.filename : "",
    content_type: typeof att.contentType === "string" ? att.contentType : "application/octet-stream",
    size: Number.isFinite(att.size) ? att.size : 0,
    cid: orNull(att.cid),
    blob_key: typeof att.blobKey === "string" ? att.blobKey : `${prefix}att/${index}`,
    extracted_text: typeof att.extractedText === "string" ? att.extractedText : null,
  }));

  return { message, body, addresses, references, attachments, blobs };
}

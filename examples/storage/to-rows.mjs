// Map a NormalizedEmail to storage rows, following AECS-1 Appendix C.
//
// Plain JavaScript with no dependencies (Web Crypto only), so it runs in Node 18+,
// Cloudflare Workers, Deno and browsers. The SQL, MongoDB and DynamoDB examples in
// this directory all store the shapes produced here.
//
//   const rows = await toRows(email, { mailboxId: "user-123" });
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

/**
 * @param {import("@mvrx/aecs").NormalizedEmail} email
 * @param {{ mailboxId?: string, includeRaw?: boolean }} [options]
 */
export async function toRows(email, options = {}) {
  const mailboxId = options.mailboxId ?? "default";
  const [mailboxKey, messageKey, threadKey] = await Promise.all([
    sha256Hex(mailboxId),
    sha256Hex(email.messageId),
    sha256Hex(email.threadId),
  ]);
  const prefix = blobPrefix(mailboxKey, messageKey);
  // AECS-1 Appendix C.2: the sort key is never null. Fall back to processedAt.
  const ts = email.metadata.timestamp ?? Math.floor(Date.parse(email.processing.processedAt) / 1000);

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
    from_email: email.metadata.from.email.toLowerCase(),
    from_name: email.metadata.from.name,
    subject: email.metadata.subject,
    in_reply_to: email.thread.inReplyTo,
    forai: email.content.forAI,
    attachment_count: email.attachments.length,
    size_bytes: email.content.rawFull === null ? null : new TextEncoder().encode(email.content.rawFull).length,
    clean_fallback: email.processing.cleanFallback ? 1 : 0,
    spec_version: email.processing.specVersion,
    processed_at: email.processing.processedAt,
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
    attachment_id: att.id ?? `${email.messageId}:${index}`,
    filename: att.filename,
    content_type: att.contentType,
    size: att.size,
    cid: att.cid,
    blob_key: att.blobKey ?? `${prefix}att/${index}`,
    extracted_text: att.extractedText ?? null,
  }));

  return { message, body, addresses, references, attachments, blobs };
}

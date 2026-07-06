import assert from "node:assert/strict";
import test from "node:test";
import { buildAttachmentContext, parse, wrappers } from "../dist/index.js";

function makeAttachment(overrides = {}) {
  return {
    id: overrides.id ?? "att-1",
    filename: overrides.filename ?? "invoice.pdf",
    contentType: overrides.contentType ?? "application/pdf",
    size: overrides.size ?? 0,
    cid: overrides.cid ?? null,
    content: async () => new Uint8Array(),
    extractedText: overrides.extractedText,
  };
}

test("buildAttachmentContext returns null when no attachment has extractedText", () => {
  const attachments = [makeAttachment({ extractedText: undefined }), makeAttachment({ extractedText: null })];
  assert.equal(buildAttachmentContext(attachments), null);
  assert.equal(buildAttachmentContext([]), null);
});

test("buildAttachmentContext wraps each attachment with the default xml wrapper", () => {
  const attachments = [
    makeAttachment({ filename: "invoice.pdf", contentType: "application/pdf", extractedText: "Invoice text." }),
    makeAttachment({
      id: "att-2",
      filename: "photo.jpg",
      contentType: "image/jpeg",
      extractedText: 'Text visible in image: "Meeting Room B"',
    }),
  ];

  const context = buildAttachmentContext(attachments);

  assert.equal(
    context,
    [
      '<attachment name="invoice.pdf" type="application/pdf">\nInvoice text.\n</attachment>',
      '<attachment name="photo.jpg" type="image/jpeg">\nText visible in image: "Meeting Room B"\n</attachment>',
    ].join("\n\n"),
  );
});

test("buildAttachmentContext truncates text longer than maxCharsPerAttachment", () => {
  const longText = "a".repeat(5_000);
  const attachments = [makeAttachment({ extractedText: longText })];

  const context = buildAttachmentContext(attachments, { maxCharsPerAttachment: 100 });

  assert.match(context, /^<attachment name="invoice\.pdf" type="application\/pdf">\na{100}\n\[truncated — 100 chars shown of 5000\]\n<\/attachment>$/);
});

test("buildAttachmentContext caps total output at maxTotalChars", () => {
  const attachments = [
    makeAttachment({ id: "a", filename: "a.txt", contentType: "text/plain", extractedText: "x".repeat(300) }),
    makeAttachment({ id: "b", filename: "b.txt", contentType: "text/plain", extractedText: "y".repeat(300) }),
  ];

  const context = buildAttachmentContext(attachments, { maxCharsPerAttachment: 1_000, maxTotalChars: 150 });

  assert.ok(context.length <= 150);
  assert.match(context, /^<attachment name="a\.txt"/);
  assert.equal(context.includes("b.txt"), false);
});

test("buildAttachmentContext respects the include filter with exact types and globs", () => {
  const attachments = [
    makeAttachment({ id: "a", filename: "doc.pdf", contentType: "application/pdf", extractedText: "pdf text" }),
    makeAttachment({ id: "b", filename: "pic.jpg", contentType: "image/jpeg", extractedText: "image text" }),
    makeAttachment({ id: "c", filename: "clip.mp3", contentType: "audio/mpeg", extractedText: "audio text" }),
  ];

  const context = buildAttachmentContext(attachments, { include: ["application/pdf", "image/*"] });

  assert.match(context, /doc\.pdf/);
  assert.match(context, /pic\.jpg/);
  assert.equal(context.includes("clip.mp3"), false);
});

test("buildAttachmentContext supports a custom label, a custom wrapper, and wrapper: null", () => {
  const attachments = [makeAttachment({ extractedText: "body text" })];

  const labeled = buildAttachmentContext(attachments, { label: (att) => `ATT:${att.id}` });
  assert.match(labeled, /name="ATT:att-1"/);

  const blockWrapped = buildAttachmentContext(attachments, { wrapper: wrappers.block("ATTACHMENT") });
  assert.equal(blockWrapped, "--- ATTACHMENT ---\nbody text\n--- END ATTACHMENT ---");

  const unwrapped = buildAttachmentContext(attachments, { wrapper: null });
  assert.equal(unwrapped, "body text");
});

function multipartEmailWithAttachment() {
  const boundary = "BOUNDARY123";
  return [
    "From: Alice Example <alice@example.com>",
    "To: Bob Example <bob@example.com>",
    "Subject: Please review",
    "Date: Mon, 29 Jun 2026 14:32:00 +0000",
    "Message-ID: <withattachment@mail.example.com>",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Hi Bob, please see the attached invoice.",
    "",
    `--${boundary}`,
    "Content-Type: application/pdf",
    "Content-Disposition: attachment; filename=\"invoice.pdf\"",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("PDF file contents").toString("base64"),
    "",
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

test("parse() with attachmentsInForAI appends attachment text to content.forAI after onAttachment handlers run", async () => {
  const email = await parse(multipartEmailWithAttachment(), {
    attachmentsInForAI: true,
    attachmentsForAIOptions: { maxCharsPerAttachment: 200, maxTotalChars: 1_000 },
    onAttachment: (attachment) => {
      attachment.extractedText = `Extracted from ${attachment.filename}`;
    },
  });

  assert.equal(email.attachments.length, 1);
  assert.equal(email.attachments[0].extractedText, "Extracted from invoice.pdf");
  assert.equal(
    email.content.forAI,
    'Hi Bob, please see the attached invoice.\n\n<attachment name="invoice.pdf" type="application/pdf">\nExtracted from invoice.pdf\n</attachment>',
  );
});

test("parse() without attachmentsInForAI leaves content.forAI untouched", async () => {
  const email = await parse(multipartEmailWithAttachment(), {
    onAttachment: (attachment) => {
      attachment.extractedText = `Extracted from ${attachment.filename}`;
    },
  });

  assert.equal(email.content.forAI, "Hi Bob, please see the attached invoice.");
});

test("parse() with attachmentsInForAI sets content.forAI from attachment context when the body forAI is null", async () => {
  const raw = [
    "From: Alice Example <alice@example.com>",
    "To: Bob Example <bob@example.com>",
    "Subject: Attachment only",
    "Date: Mon, 29 Jun 2026 14:32:00 +0000",
    "Message-ID: <attachmentonly@mail.example.com>",
    "Content-Type: application/pdf",
    "Content-Disposition: attachment; filename=\"invoice.pdf\"",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("PDF file contents").toString("base64"),
    "",
  ].join("\r\n");

  const email = await parse(raw, {
    attachmentsInForAI: true,
    onAttachment: (attachment) => {
      attachment.extractedText = "Extracted invoice text";
    },
  });

  assert.equal(email.content.clean, null);
  assert.equal(email.content.forAI, '<attachment name="invoice.pdf" type="application/pdf">\nExtracted invoice text\n</attachment>');
});

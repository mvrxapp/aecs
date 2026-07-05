import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { parse, resolveThreadId, normalizeDate, parseReferences, wrappers, EmailThread } from "../dist/index.js";

test("AECS threading and timestamp fixtures match the reference expectations", async () => {
  const fixtureDir = new URL("../specs/conformance/fixtures/", import.meta.url);
  for (const name of await readdir(fixtureDir)) {
    if (!name.endsWith(".json")) continue;
    const fixture = JSON.parse(await readFile(new URL(name, fixtureDir), "utf8"));
    const input = fixture.input;
    const date = normalizeDate(input.date);
    const threadId = await resolveThreadId({
      messageId: input.messageId,
      inReplyTo: input.inReplyTo,
      references: parseReferences(input.references),
      from: input.from,
      subject: input.subject,
      date: date.date,
    });

    assert.equal(threadId, fixture.expected.threadId, fixture.description);
    assert.equal(date.date, fixture.expected.metadataDate, fixture.description);
    assert.equal(date.timestamp, fixture.expected.metadataTimestamp, fixture.description);
  }
});

test("parse returns AI-ready content while preserving rawFull", async () => {
  const raw = [
    "From: Alice Example <alice@example.com>",
    "To: Bob Example <bob@example.com>",
    "Subject: Re: Project update",
    "Date: Mon, 29 Jun 2026 14:32:00 +0000",
    "Message-ID: <reply789@mail.example.com>",
    "In-Reply-To: <root456@mail.example.com>",
    "References: <root456@mail.example.com> <mid2@mail.example.com>",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "Thanks Bob, looks good.",
    "",
    "Best,",
    "Alice",
    "",
    "On Mon, Bob wrote:",
    "> old quoted text",
  ].join("\r\n");

  const email = await parse(raw, { wrapper: wrappers.xml("email") });

  assert.equal(email.messageId, "reply789@mail.example.com");
  assert.equal(email.threadId, "root456@mail.example.com");
  assert.equal(email.metadata.timestamp, 1782743520);
  assert.equal(email.content.rawFull, raw);
  assert.equal(email.content.clean, "Thanks Bob, looks good.");
  assert.equal(email.content.forAI, "<email>\nThanks Bob, looks good.\n</email>");
  assert.equal(email.forAI({ wrapper: null }), "Thanks Bob, looks good.");
  assert.equal(JSON.stringify(email).includes("forAI("), false);
});

test("EmailThread computes deterministic positions and compact thread context", async () => {
  const first = await parse([
    "From: A <a@example.com>",
    "To: B <b@example.com>",
    "Subject: Hello",
    "Date: Mon, 29 Jun 2026 10:00:00 +0000",
    "Message-ID: <root@mail.example.com>",
    "",
    "Root message",
  ].join("\r\n"));
  const second = await parse([
    "From: B <b@example.com>",
    "To: A <a@example.com>",
    "Subject: Re: Hello",
    "Date: Mon, 29 Jun 2026 11:00:00 +0000",
    "Message-ID: <reply@mail.example.com>",
    "References: <root@mail.example.com>",
    "",
    "Reply message",
  ].join("\r\n"));

  const thread = EmailThread.from([second, first]);

  assert.equal(thread.root.messageId, "root@mail.example.com");
  assert.equal(thread.latest.messageId, "reply@mail.example.com");
  assert.equal(first.thread.position, 0);
  assert.equal(second.thread.position, 1);
  assert.match(thread.forAI({ maxCharsPerMessage: 100 }), /Root message/);
  assert.match(thread.forAI({ maxCharsPerMessage: 100 }), /Reply message/);
});

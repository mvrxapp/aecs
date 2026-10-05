import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";
import { parse, stripQuotedChains, stripSignature } from "../dist/index.js";

function message(bodyLines) {
  return [
    "From: Bob <bob@example.com>",
    "To: Alice <alice@example.com>",
    "Subject: Re: Update",
    "Date: Mon, 29 Jun 2026 14:32:00 +0000",
    "Message-ID: <m1@example.com>",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    ...bodyLines,
  ].join("\r\n");
}

test("AECS-1 §4.3.1 content-preservation fixtures hold for clean and forAI", async () => {
  const dir = new URL("../specs/conformance/content/", import.meta.url);
  const names = (await readdir(dir)).filter((name) => name.endsWith(".json"));
  assert.ok(names.length >= 10);
  for (const name of names) {
    const fixture = JSON.parse(await readFile(new URL(name, dir), "utf8"));
    const email = await parse(message(fixture.input.text.split("\n")));
    for (const field of ["clean", "forAI"]) {
      const value = email.content[field];
      if (fixture.expected.nonEmpty) assert.ok(value && value.trim(), `${name}: ${field} is empty`);
      for (const snippet of fixture.expected.mustContain) {
        assert.ok(value.includes(snippet), `${name}: ${field} lost ${JSON.stringify(snippet)}\n${value}`);
      }
      for (const snippet of fixture.expected.mustNotContain) {
        assert.ok(!value.includes(snippet), `${name}: ${field} kept ${JSON.stringify(snippet)}\n${value}`);
      }
    }
  }
});

test("inline replies keep the quoted question directly above each answer as context", () => {
  const clean = stripQuotedChains(
    ["My answers are below.", "> Is the design approved?", "No.", "> Can we deploy Friday?", "Not before Monday."].join("\n"),
  );
  assert.equal(clean, "My answers are below.\n> Is the design approved?\nNo.\n> Can we deploy Friday?\nNot before Monday.");
});

test("long quoted context is bounded to the last three lines with an omission marker", () => {
  const quoted = Array.from({ length: 8 }, (_, i) => `> line ${i + 1}`);
  const clean = stripQuotedChains([...quoted, "My answer."].join("\n"));
  assert.equal(clean, "> [5 quoted lines omitted]\n> line 6\n> line 7\n> line 8\nMy answer.");
});

test("raw keeps quoted history; clean removes trailing history", async () => {
  const email = await parse(message(["Thanks, looks good.", "", "On Mon, Alice wrote:", "> old text"]));
  assert.match(email.content.raw, /> old text/);
  assert.equal(email.content.clean, "Thanks, looks good.");
  assert.equal(email.processing.specVersion, "1.1");
  assert.equal(email.processing.cleanFallback, undefined);
});

test("an all-quoted body falls back to text and sets processing.cleanFallback", async () => {
  const email = await parse(message(["> Forwarded notice: maintenance on Saturday."]));
  assert.equal(email.content.clean, "> Forwarded notice: maintenance on Saturday.");
  assert.equal(email.processing.cleanFallback, true);
  assert.ok(email.content.forAI);
});

test("signature rules only remove a short trailing block", () => {
  const long = ["Hello.", "--", ...Array.from({ length: 12 }, (_, i) => `Point ${i + 1}`)].join("\n");
  assert.equal(stripSignature(long), long);
  assert.equal(stripSignature("Hello.\n--\nBob\nACME"), "Hello.");
  assert.equal(stripSignature("On my way.\nSent from my iPhone"), "On my way.");
});

test("a custom cleaner receives the full text, including quotes", async () => {
  let seen = "";
  await parse(message(["Answer.", "> question"]), {
    cleaner: (text) => {
      seen = text;
      return text;
    },
  });
  assert.equal(seen, "Answer.\n> question");
});

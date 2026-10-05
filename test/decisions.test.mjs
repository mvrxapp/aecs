import assert from "node:assert/strict";
import test from "node:test";
import {
  DecisionError,
  clefProvider,
  clefRestProvider,
  decideEmail,
  emailToDecisionState,
  jevProvider,
  parse,
  textDecisionProvider,
  validateQuestions,
  wrappers,
} from "../dist/index.js";

const questions = {
  is_urgent: { type: "noul", instructions: "Does this convey urgency?" },
  department: {
    type: "choice",
    instructions: "Which team should handle this?",
    criteria: { billing: "Payments", technical: "Bugs", sales: null },
  },
  frustration: { type: "score", instructions: "How frustrated is the customer?", criteria: ["Calm", "Frustrated", "Very angry"] },
};

const answers = {
  is_urgent: { type: "noul", noul: 0.95 },
  department: { type: "choice", choice: "billing", probabilities: { billing: 0.88, technical: 0.12, sales: 0 }, confidence: 0.81 },
  frustration: {
    type: "score",
    score: 1.05,
    legend: { 0: "Calm", 1: "Frustrated", 2: "Very angry" },
    probabilities: { 0: 0, 1: 0.95, 2: 0.05 },
    confidence: 0.92,
  },
};

function mockFetch(responseBody, status = 200) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(responseBody), { status, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}

test("jevProvider posts the System One request and returns typed answers", async () => {
  const { fetch, calls } = mockFetch({ model: "jev-1.13.0", answers, usage: { input_tokens: 318, output_tokens: 34 } });
  const jev = jevProvider({ apiKey: "test-key", fetch });

  const res = await jev.decide({ state: "Payouts failing for 3 days", questions, images: ["data:image/png;base64,AA=="] });

  assert.equal(calls[0].url, "https://api.typesafe.ai/v1/systemone");
  assert.equal(calls[0].init.headers.authorization, "Bearer test-key");
  assert.deepEqual(calls[0].body, { model: "jev-latest", state: "Payouts failing for 3 days", questions });
  assert.equal(res.model, "jev-1.13.0");
  assert.equal(res.answers.department.choice, "billing");
  assert.equal(res.answers.is_urgent.noul, 0.95);
  assert.equal(res.answers.frustration.score, 1.05);
  assert.deepEqual(res.usage, { input_tokens: 318, output_tokens: 34 });
});

test("jevProvider surfaces HTTP errors as DecisionError with status", async () => {
  const { fetch } = mockFetch({ detail: "bad key" }, 401);
  const jev = jevProvider({ apiKey: "nope", fetch });
  await assert.rejects(jev.decide({ state: "x", questions }), (err) => err instanceof DecisionError && err.status === 401);
});

test("clefProvider calls the Workers AI binding with model selector and images", async () => {
  const calls = [];
  const binding = {
    run: async (model, input) => {
      calls.push({ model, input });
      return { model: "clef-flash", answers, usage: { input_tokens: 10, output_tokens: 3 } };
    },
  };
  const clef = clefProvider(binding, { model: "clef-flash" });

  const res = await clef.decide({ state: { body: "hi" }, questions, images: [{ content_type: "image/png", base64: "AA==" }] });

  assert.equal(calls[0].model, "@cf/cloudflare/clef-flash");
  assert.equal(calls[0].input.model, "clef-flash");
  assert.deepEqual(calls[0].input.images, [{ content_type: "image/png", base64: "AA==" }]);
  assert.equal(res.answers.department.confidence, 0.81);
});

test("clefRestProvider unwraps the Cloudflare { success, result } envelope", async () => {
  const { fetch, calls } = mockFetch({ success: true, result: { model: "clef", answers, usage: { input_tokens: 1, output_tokens: 1 } } });
  const clef = clefRestProvider({ accountId: "acc123", apiToken: "tok", fetch });

  const res = await clef.decide({ state: "x", questions });

  assert.equal(calls[0].url, "https://api.cloudflare.com/client/v4/accounts/acc123/ai/run/@cf/cloudflare/clef");
  assert.equal(calls[0].init.headers.authorization, "Bearer tok");
  assert.equal(res.model, "clef");
});

test("clef rejects unknown model names before calling the binding", async () => {
  const clef = clefProvider({ run: async () => assert.fail("should not be called") });
  await assert.rejects(clef.decide({ state: "x", questions, model: "llama" }), DecisionError);
});

test("responses with an answer outside the defined options are rejected", async () => {
  const bad = { ...answers, department: { ...answers.department, choice: "legal" } };
  const { fetch } = mockFetch({ model: "jev-1.13.0", answers: bad, usage: {} });
  await assert.rejects(jevProvider({ apiKey: "k", fetch }).decide({ state: "x", questions }), /not one of the defined options/);

  const inherited = { ...answers, department: { ...answers.department, choice: "constructor" } };
  const { fetch: fetch2 } = mockFetch({ model: "jev-1.13.0", answers: inherited, usage: {} });
  await assert.rejects(jevProvider({ apiKey: "k", fetch: fetch2 }).decide({ state: "x", questions }), /not one of the defined options/);
});

test("validateQuestions enforces System One limits", () => {
  assert.throws(() => validateQuestions({}), /1 to 64/);
  assert.throws(() => validateQuestions({ q: { type: "choice", instructions: "pick", criteria: { only: null } } }), /2 to 255/);
  assert.throws(() => validateQuestions({ q: { type: "score", instructions: "rate", criteria: ["one"] } }), /2 to 10/);
  assert.throws(() => validateQuestions({ "bad id": { type: "noul", instructions: "ok?" } }), /invalid question id/);
  assert.throws(() => validateQuestions({ q: { type: "noul", instructions: "  " } }), /empty instructions/);
  validateQuestions(questions);
});

test("textDecisionProvider adapts a text LLM to typed answers", async () => {
  let seen;
  const provider = textDecisionProvider({
    model: "gpt-test",
    complete: async (messages) => {
      seen = messages;
      return '```json\n{"is_urgent": 0.9, "department": "technical", "frustration": 2}\n```';
    },
  });

  const res = await provider.decide({ state: "Site is down!", questions });

  assert.match(seen[0].content, /untrusted data/);
  assert.equal(res.model, "gpt-test");
  assert.deepEqual(res.answers.is_urgent, { type: "noul", noul: 0.9 });
  assert.equal(res.answers.department.choice, "technical");
  assert.deepEqual(res.answers.department.probabilities, { billing: 0, technical: 1, sales: 0 });
  assert.equal(res.answers.frustration.score, 2);
  assert.equal(res.answers.frustration.legend["2"], "Very angry");
});

test("textDecisionProvider rejects invalid JSON and out-of-range answers", async () => {
  const notJson = textDecisionProvider({ complete: async () => "billing" });
  await assert.rejects(notJson.decide({ state: "x", questions }), /valid JSON/);

  const badLevel = textDecisionProvider({
    complete: async () => JSON.stringify({ is_urgent: 0.1, department: "sales", frustration: 7 }),
  });
  await assert.rejects(badLevel.decide({ state: "x", questions }), /not a level/);
});

test("decideEmail sends the wrapped forAI body and metadata as state", async () => {
  const raw = [
    "From: Alice <alice@example.com>",
    "To: Support <support@example.com>",
    "Subject: Payouts failing",
    "Date: Mon, 29 Jun 2026 14:32:00 +0000",
    "Message-ID: <m1@example.com>",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    "My payouts have been failing for 3 days.",
  ].join("\r\n");
  const email = await parse(raw, { wrapper: wrappers.xml("email") });
  const { fetch, calls } = mockFetch({ model: "jev-1.13.0", answers, usage: {} });

  await decideEmail(email, jevProvider({ apiKey: "k", fetch }), questions);

  assert.deepEqual(calls[0].body.state, {
    from: "alice@example.com",
    to: ["support@example.com"],
    subject: "Payouts failing",
    date: email.metadata.date,
    body: "<email>\nMy payouts have been failing for 3 days.\n</email>",
  });
  assert.deepEqual(emailToDecisionState(email, { includeMetadata: false }), { body: email.content.forAI });
});

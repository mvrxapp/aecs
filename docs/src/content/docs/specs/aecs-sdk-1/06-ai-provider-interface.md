---
title: "6. AI Provider Interface"
---


> **Status: Roadmap** for [§6.1](/aecs/specs/aecs-sdk-1/06-ai-provider-interface/#61-interface)–[6.2](/aecs/specs/aecs-sdk-1/06-ai-provider-interface/#62-pre-built-connectors) (text-generation connectors). [§6.3](/aecs/specs/aecs-sdk-1/06-ai-provider-interface/#63-decision-models-typed-answers) (decision models) is implemented.

Every AI surface in the SDK accepts an `AiProvider`. The interface is a minimal common denominator that every major LLM satisfies.

### 6.1 Interface

```typescript
interface AiProvider {
  run(
    model: string,
    messages: { role: "system" | "user" | "assistant"; content: string }[]
  ): Promise<{ text: string }>;
}
```

### 6.2 Pre-Built Connectors

Import from `@mvrx/mail/providers`. Each returns an `AiProvider`.

**Cloudflare Workers AI** — zero latency, runs on the same Worker, no egress:
```typescript
import { cfProvider } from "@mvrx/mail/providers";

const ai = cfProvider(env.AI);
// Uses env.AI.run() — default model: @cf/meta/llama-3.3-70b-instruct
// Override per-call by passing model name to any SDK method
```

**OpenAI:**
```typescript
import { openaiProvider } from "@mvrx/mail/providers";

const ai = openaiProvider({ apiKey: env.OPENAI_KEY });
// Default model: gpt-4o-mini
```

**Anthropic:**
```typescript
import { anthropicProvider } from "@mvrx/mail/providers";

const ai = anthropicProvider({ apiKey: env.ANTHROPIC_KEY });
// Default model: claude-haiku-4-5-20251001
```

**Google Gemini:**
```typescript
import { geminiProvider } from "@mvrx/mail/providers";

const ai = geminiProvider({ apiKey: env.GEMINI_KEY });
// Default model: gemini-2.0-flash
```

**Mistral:**
```typescript
import { mistralProvider } from "@mvrx/mail/providers";

const ai = mistralProvider({ apiKey: env.MISTRAL_KEY });
// Default model: mistral-small-latest
```

**Azure OpenAI:**
```typescript
import { azureProvider } from "@mvrx/mail/providers";

const ai = azureProvider({
  endpoint: "https://my-resource.openai.azure.com",
  deployment: "gpt-4o-mini",
  apiKey: env.AZURE_KEY,
});
```

**Ollama (local / self-hosted):**
```typescript
import { ollamaProvider } from "@mvrx/mail/providers";

const ai = ollamaProvider({ baseUrl: "http://localhost:11434" });
// Default model: llama3.2
```

**Any OpenAI-compatible endpoint:**
```typescript
import { openaiCompatProvider } from "@mvrx/mail/providers";

const ai = openaiCompatProvider({
  baseUrl: "https://openrouter.ai/api/v1",
  apiKey: env.OPENROUTER_KEY,
  defaultModel: "meta-llama/llama-3.3-70b-instruct",
});
```

**Custom:**
```typescript
// Implement the interface directly for any provider not listed above
const ai: AiProvider = {
  run: async (model, messages) => {
    const res = await myLLM.chat({ model, messages });
    return { text: res.output };
  },
};
```

### 6.3 Decision Models (Typed Answers)

> **Status: Implemented** in `@mvrx/aecs/decisions` (also re-exported from `@mvrx/aecs`). This subsection is independent of the roadmap text-generation connectors in [§6.1](/aecs/specs/aecs-sdk-1/06-ai-provider-interface/#61-interface)–[6.2](/aecs/specs/aecs-sdk-1/06-ai-provider-interface/#62-pre-built-connectors).

Decision models (also called *System One* models) do not generate text. They read a `state` and a map of typed questions, and return one typed answer per question with probabilities. This fits the classification and routing work in [§7](/aecs/specs/aecs-sdk-1/07-ai-tools-analysis/) and the rules engine ([§15](/aecs/specs/aecs-sdk-1/15-rules-engine/)): the answer can only be a value the caller defined, so nothing needs to be parsed out of free text.

The SDK targets the System One wire format that TypeSafe Jev and Cloudflare Clef share:

| Question `type` | `criteria` | Answer fields |
|---|---|---|
| `noul` | optional `{ true, false }` descriptions | `noul`: probability of yes, `0`–`1` |
| `choice` | map of option id → description (or `null`), 2–255 options | `choice`, `probabilities` per option, `confidence` |
| `score` | ordered array of level descriptions, lowest first, 2–10 levels | `score` (probability-weighted level index, may fall between levels), `probabilities`, `legend`, `confidence` |

A request holds 1–64 questions. Question ids use letters, digits, `_`, `.` and `-` (max 100 characters). Answers come back under the same ids.

#### 6.3.1 Interface

```typescript
interface DecisionProvider {
  decide<Q extends DecisionQuestions>(request: {
    state: DecisionValue;          // string, object or array
    questions: Q;
    model?: string;                // overrides the provider default
    images?: (string | { content_type: string; base64: string })[]; // Clef only
    signal?: AbortSignal;
  }): Promise<{
    model: string;                 // versioned id that answered
    answers: DecisionAnswers<Q>;   // typed per question; choice answers keep their option ids
    usage: { input_tokens: number; output_tokens: number };
  }>;
}
```

Every provider MUST validate the question map before sending it, and MUST check that each answer matches its question's type: a `choice` must be one of the defined options and a `score` must be in range. Any failure throws `DecisionError` (with `status` and `body` when the failure came from HTTP).

#### 6.3.2 Connectors

**TypeSafe Jev:** `POST https://api.typesafe.ai/v1/systemone`. Text only, so `images` are not sent.
```typescript
import { jevProvider } from "@mvrx/aecs/decisions";

const jev = jevProvider({ apiKey: env.TYPESAFE_KEY });
// Default model: jev-latest. Pin "jev-1.13.0" if you tune confidence thresholds.
// Through OpenRouter: jevProvider({ apiKey: env.OPENROUTER_KEY,
//   endpoint: "https://openrouter.ai/api/v1/systemone", model: "typesafe/jev-1.13" })
```

**Cloudflare Clef**, through the Workers AI binding (`@cf/cloudflare/clef` or `@cf/cloudflare/clef-flash`). Accepts up to 4 images:
```typescript
import { clefProvider, clefRestProvider } from "@mvrx/aecs/decisions";

const clef = clefProvider(env.AI);                          // default model: clef
const fast = clefProvider(env.AI, { model: "clef-flash" });
// Outside a Worker:
const rest = clefRestProvider({ accountId: env.CF_ACCOUNT_ID, apiToken: env.CF_API_TOKEN });
```

**Any System One endpoint:** `systemOneProvider({ endpoint, apiKey, defaultModel, supportsImages? })`.

**OpenAI Decisions API:** announced at DevDay on 2026-09-29. It is in limited preview and OpenAI has not published a request or response schema, so this SDK has no native connector for it yet. Until it does, `textDecisionProvider` answers the same typed questions with any text LLM, for example an OpenAI model called with a strict JSON schema:
```typescript
import { textDecisionProvider } from "@mvrx/aecs/decisions";

const viaLlm = textDecisionProvider({
  model: "gpt-4o-mini",
  complete: async (messages) => (await openai.responses.create({ model: "gpt-4o-mini", input: messages })).output_text,
});
```
A text model has no calibrated probability distribution. The adapter gives the chosen option probability `1` and confidence `1`, so do not use those values for confidence-gated routing.

#### 6.3.3 Deciding About an Email

`decideEmail()` builds `state` from a `NormalizedEmail`: `from`, `to`, `subject`, `date`, `body` and attachment names and types. `body` is `content.forAI`, so the untrusted-content wrapper applied at parse time ([§10](/aecs/specs/aecs-sdk-1/10-pluggable-wrappers-for-safe-llm-usage/)) stays in place ([§11.1](/aecs/specs/aecs-sdk-1/11-security-best-practices/#111-email-content-is-untrusted)).

```typescript
import { parse, wrappers } from "@mvrx/aecs";
import { clefProvider, decideEmail } from "@mvrx/aecs/decisions";

const email = await parse(message.raw, { wrapper: wrappers.xml("email") });
const { answers } = await decideEmail(email, clefProvider(env.AI), {
  needs_reply: { type: "noul", instructions: "Does the sender expect a reply?" },
  route: {
    type: "choice",
    instructions: "Which team should handle this email?",
    criteria: { billing: "Invoices, refunds", support: "Bugs, outages", sales: "Pricing, upgrades" },
  },
  urgency: { type: "score", instructions: "How urgent is this?", criteria: ["Can wait", "This week", "Right now"] },
});

if (answers.route.confidence > 0.8) await assign(answers.route.choice); // "billing" | "support" | "sales"
```

`emailToDecisionState(email, { includeMetadata?, includeAttachments? })` returns the same `state` for use with `provider.decide()` directly.

---

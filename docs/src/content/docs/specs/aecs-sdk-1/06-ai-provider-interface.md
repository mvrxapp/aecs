---
title: "6. AI Provider Interface"
---


> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

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

---

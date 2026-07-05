---
title: "15. Rules Engine"
---


> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

The rules engine evaluates a set of declarative rules against each parsed email and executes the matching actions. It is the primary mechanism for automation (folder routing, auto-replies, forwarding, labelling).

### 15.1 Data Types

```typescript
interface Rule {
  id:            string;
  name:          string;
  enabled:       boolean;
  conditions:    Condition[];
  conditionMode: "all" | "any";   // "all" = AND, "any" = OR
  actions:       Action[];
  order?:        number;          // lower number runs first; default: 0
}

// ── Conditions ──────────────────────────────────────────────────────────────

type Condition =
  | { type: "from";          op: StringOp; value: string }
  | { type: "to";            op: StringOp; value: string }
  | { type: "subject";       op: StringOp; value: string }
  | { type: "body";          op: StringOp; value: string }
  | { type: "hasAttachment"; value: boolean }
  | { type: "sizeBytes";     op: NumberOp; value: number }
  | { type: "isReply";       value: boolean };

type StringOp = "contains" | "equals" | "startsWith" | "endsWith" | "matches";
//   "matches" accepts a regular expression string

type NumberOp = "gt" | "lt" | "gte" | "lte" | "eq";

// ── Actions ─────────────────────────────────────────────────────────────────

type Action =
  | { type: "setFolder";     folder: string }
  | { type: "setLabel";      label: string }
  | { type: "removeLabel";   label: string }
  | { type: "markRead";      value: boolean }
  | { type: "markStarred";   value: boolean }
  | { type: "forward";       to: Address[] }
  | { type: "autoReply";     body: string; subject?: string }
  | { type: "discard" }
  | { type: "stopProcessing" };  // subsequent rules are not evaluated
```

### 15.2 `evaluateRules(email, rules, transport, options?)`

```typescript
function evaluateRules(
  email:     NormalizedEmail,
  rules:     Rule[],
  transport: EmailTransport,
  options?:  EvaluateOptions
): Promise<RuleResult[]>

interface EvaluateOptions {
  stopOnFirst?: boolean;   // stop after the first matching rule (default: false)
  dryRun?:      boolean;   // evaluate conditions but do not execute actions
}

interface RuleResult {
  ruleId:  string;
  matched: boolean;
  actions: Action[];       // populated only when matched === true
}
```

### 15.3 Usage

```typescript
import { parse, evaluateRules } from "@mvrx/mail";
import { cfTransport } from "@mvrx/mail/transports";

export default {
  async email(message: ForwardableEmailMessage, env: Env) {
    const email = await parse(message);

    const rules: Rule[] = await env.DB
      .prepare("SELECT * FROM mvrx_rules WHERE enabled = 1 ORDER BY rule_order ASC")
      .all()
      .then((r) => r.results.map(parseRuleRow));

    const results = await evaluateRules(email, rules, cfTransport(env.EMAIL));

    // results tells you which rules fired and what actions ran
    for (const r of results.filter((r) => r.matched)) {
      console.log(`Rule "${r.ruleId}" fired:`, r.actions.map((a) => a.type));
    }
  },
};
```

### 15.4 Rule Storage Schema

Rules are plain data and can be stored anywhere. A minimal D1 table:

```sql
CREATE TABLE IF NOT EXISTS mvrx_rules (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  enabled      INTEGER NOT NULL DEFAULT 1,   -- 0 = disabled
  conditions   TEXT NOT NULL,                -- JSON: Condition[]
  condition_mode TEXT NOT NULL DEFAULT 'all',
  actions      TEXT NOT NULL,                -- JSON: Action[]
  rule_order   INTEGER NOT NULL DEFAULT 0
);
```

---

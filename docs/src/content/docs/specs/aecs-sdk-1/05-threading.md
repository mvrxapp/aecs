---
title: "5. Threading"
---


### 5.1 Algorithm (AECS-1 §5)

```
1. References present     → first entry that is a VALID Message-ID (not just list[0])
2. In-Reply-To valid       → that Message-ID
3. Own Message-ID valid    → use it (root message)
4. No valid Message-ID     → SHA-256(from + ":" + subject_lower_NFC + ":" + date_utc), UTF-8 encoded
```

Angle brackets stripped. Whitespace trimmed. "Valid" has a precise definition (AECS-1 [§5.1](/aecs/specs/aecs-1/07-threading-algorithm/#51-validity-of-a-message-id))
— not every list entry counts, and validity gates whether rule 4 fires at all. Result is
always stable regardless of processing order.

### 5.2 Position

`thread.position` is `number | null` (AECS-1 [§4.4](/aecs/specs/aecs-1/06-field-definitions/#44-thread)) — it can't be computed from one message
in isolation, so:

- `parse()` always sets `thread.position` to `null` — a single incoming message has no view
  of the rest of its thread.
- `getMessage()` (single-row lookup, [§3.8](/aecs/specs/aecs-sdk-1/03-core-api/#38-query-api)) also returns `thread.position: null` for the same
  reason — it doesn't load sibling messages.
- `getThread()` and `EmailThread.from()` are the only two operations that populate it,
  because both have the full set of messages in a thread available. Both compute it
  identically: sort ascending by `metadata.timestamp` (not receipt order — see AECS-1 [§4.4](/aecs/specs/aecs-1/06-field-definitions/#44-thread)),
  then assign `position = 0, 1, 2, ...` by that sorted order.

```typescript
const thread = EmailThread.from(messages);
// messages[0].thread.position === 0 (earliest by metadata.timestamp)
// messages[1].thread.position === 1

const email = await parse(incoming);
// email.thread.position === null — no thread context yet
```

### 5.3 Custom `threadId`

```typescript
const email = await parse(message, {
  threadIdResolver: (headers) =>
    `support:${headers.from.email}:${headers.subject?.toLowerCase()}`,
});
```

---

---
title: "16. Real-time Events (UserHub)"
---


> **Status: Roadmap.** This section specifies a planned module; it is not yet implemented in `@mvrx/mail`.

The `UserHub` Durable Object fans real-time events to connected browser clients via SSE. Each user has one `UserHub` instance keyed by their user ID.

`userId` is opaque to the SDK — it's whatever string key your app uses to route events to
the right `UserHub` instance (matches `NotificationBus.publish(userId, event)` in the
adapters interface). The SDK has no concept of accounts, mailbox ownership, or multi-tenancy;
resolving "which user(s) should be notified about this inbound message" is an application
concern. For the simplest case — one mailbox per user — the recipient address is a
reasonable default key, shown below. Group/shared mailboxes need your own
mailbox-to-userIds lookup, since one inbound message may need to fan out to several users.

### 16.1 Export the DO from Your Worker

```typescript
// src/index.ts
export { UserHub } from "@mvrx/mail/hub";

export default {
  async fetch(req: Request, env: Env) {
    // Mount the SSE endpoint for browser clients
    const url = new URL(req.url);
    if (url.pathname === "/hub") {
      return hubRouter(req, env.HUB, getUserId(req));
    }
    // ... rest of your router
  },

  async email(message: ForwardableEmailMessage, env: Env) {
    const email = await parse(message);
    await d1Store(env.DB, email);

    // Single-tenant default: the recipient address is the userId. Replace with a real
    // mailbox → userId[] lookup for multi-user/group mailboxes.
    const userId = message.to;

    // Publish to all connected clients for this user
    await publishEvent(env.HUB, userId, {
      type: "new_message",
      payload: {
        messageId: email.messageId,
        threadId:  email.threadId,
        from:      email.metadata.from,
        subject:   email.metadata.subject,
      },
    });
  },
};
```

### 16.2 `MailEvent` Types

```typescript
type MailEvent =
  | {
      type: "new_message";
      payload: {
        messageId: string;
        threadId:  string;
        from:      Address;
        subject:   string | null;
      };
    }
  | {
      type: "message_updated";
      payload: { messageId: string; read?: boolean; starred?: boolean; folder?: string };
    }
  | {
      type: "thread_updated";
      payload: { threadId: string; messageCount: number; lastAt: number };
    }
  | {
      type: "rule_fired";
      payload: { ruleId: string; messageId: string; threadId: string; actions: string[] };
    }
  | {
      type: "attachment_ready";
      payload: { messageId: string; attachmentId: string; extractedText: boolean };
    };
```

### 16.3 Hub API

```typescript
import { publishEvent, hubRouter } from "@mvrx/mail/hub";

// Publish from any Worker handler
function publishEvent(
  hub:    DurableObjectNamespace,
  userId: string,
  event:  MailEvent
): Promise<void>

// Mount as an SSE endpoint — handles connection upgrade + keep-alive
function hubRouter(
  req:    Request,
  hub:    DurableObjectNamespace,
  userId: string
): Promise<Response>
```

### 16.4 Browser Client

```typescript
const events = new EventSource("/hub");

events.addEventListener("new_message", (e) => {
  const { messageId, from, subject } = JSON.parse(e.data);
  // update inbox list in real time
});

events.addEventListener("rule_fired", (e) => {
  const { ruleId, messageId } = JSON.parse(e.data);
  // show notification or update UI
});
```

**Cost note:** the reference `hubRouter()` holds an SSE connection (a long-lived
`ReadableStream` response) open per connected client, not a WebSocket. This is *not* the
same as Cloudflare's [WebSocket Hibernation API](https://developers.cloudflare.com/durable-objects/api/websockets/)
— hibernation lets a Durable Object evict an idle **WebSocket** connection from memory
while keeping it open at the edge, waking only on a new frame. A plain SSE stream has no
equivalent: the `UserHub` instance holding it open stays active, and billed, for as long as
a client is connected, not just when an event is published. If per-connection duration cost
matters at your scale, implement `NotificationBus` (the interface `UserHub` satisfies) over
WebSockets with hibernation instead — nothing else in the SDK depends on SSE specifically.

### 16.5 Delivery Guarantees & Reconnection

The reference `hubRouter()`/`UserHub` is **fire-and-forget, at-most-once, no replay**:

- If no client is connected when `publishEvent()` is called, the event is dropped — it is
  not queued or persisted for a client that connects later.
- `hubRouter()` does not assign event IDs and does not honor the SSE `Last-Event-ID` request
  header, even though the browser's native `EventSource` sends it automatically on
  reconnect. A reconnecting client gets only events published after the new connection is
  established — nothing published during the gap.
- This is a deliberate simplicity tradeoff, not an oversight: `MailEvent`s are notifications
  that something changed, not the source of truth for that change. The source of truth is
  D1 (`getThread`/`getMessage`/`listMessages`, [§3.8](/aecs/specs/aecs-sdk-1/03-core-api/#38-query-api)). Clients MUST reconcile on connect and
  reconnect by querying D1 directly (e.g. `listMessages` since your last known message) —
  never rely on the event stream alone for correctness, only for low-latency "something
  changed, go refetch" signaling.
- Implementations that need at-least-once delivery or replay (e.g. a `NotificationBus` swap
  to a durable queue) MAY add it; `hubRouter()`/`UserHub` is the reference implementation of
  the interface, not a delivery-guarantee contract of it.

---

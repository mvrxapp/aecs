---
title: "2. Core Principles"
---


- **Flexible by design.** All fields except `messageId` and `threadId` are optional. Implementations populate what they can; unpopulated fields SHOULD be explicit `null` (consumers MUST accept omission too — §10).
- **Non-destructive.** The original raw message is preserved as an atomic field when included. Normalization layers are additions, not replacements.
- **Multiple content levels.** Consumers choose the level of processing that suits their use case — from raw RFC 5322 bytes to a clean, LLM-ready string.
- **Stable threading.** `threadId` is calculated deterministically from standard email headers. It must be identical for all messages in the same conversation, across implementations.
- **UTC everywhere.** All timestamps are Unix epoch integers (seconds). ISO 8601 strings, where provided, are always UTC.

---

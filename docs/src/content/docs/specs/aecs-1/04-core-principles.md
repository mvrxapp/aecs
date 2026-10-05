---
title: "2. Core Principles"
---


- **Flexible by design.** All fields except `messageId` and `threadId` are optional. Implementations populate what they can; unpopulated fields SHOULD be explicit `null` (consumers MUST accept omission too — [§10](/aecs/specs/aecs-1/12-conformance/)).
- **Non-destructive.** The original raw message is preserved as an atomic field when included. Normalization layers are additions, not replacements.
- **Multiple content levels.** Consumers choose the level of processing that suits their use case — from raw RFC 5322 bytes to a clean, LLM-ready string.
- **Content-preserving cleanup.** Cleaner levels remove quoted history and signatures, never the sender's own words. A shorter body that has lost the sender's answer is a defect, not a saving ([§4.3.1](/aecs/specs/aecs-1/06-field-definitions/#431-content-preservation)).
- **Stable threading.** `threadId` is calculated deterministically from standard email headers. It must be identical for all messages in the same conversation, across implementations.
- **UTC everywhere.** All timestamps are Unix epoch integers (seconds). ISO 8601 strings, where provided, are always UTC.

---

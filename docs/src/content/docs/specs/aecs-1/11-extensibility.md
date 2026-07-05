---
title: "9. Extensibility"
---


Implementations MAY add fields to `NormalizedEmail` or any nested object provided they:

- Do not reuse names defined in this specification with a different type or semantics.
- Use a namespaced key for custom fields (e.g. `"x_myapp_score": 0.87`).

Consumers MUST ignore unknown fields to remain forward-compatible.

---

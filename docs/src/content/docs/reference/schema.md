---
title: JSON Schema
description: Machine-checkable JSON Schema for the NormalizedEmail shape defined by AECS-1.
---

[`normalized-email.schema.json`](https://github.com/mvrxapp/aecs/blob/main/specs/schema/normalized-email.schema.json)
is the machine-checkable JSON Schema for the `NormalizedEmail` object defined in
[AECS-1 §3](/aecs/specs/aecs-1/). Use it to validate that an implementation's output
matches the spec independent of any particular language or library.

It ships inside the `@mvrx/aecs` npm package:

```ts
import schema from "@mvrx/aecs/schema";
```

or fetch it directly from the repo at the path above.

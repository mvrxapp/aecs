---
title: Conformance suite
description: Fixtures and an independent checker for verifying an AECS-1 implementation's threading and timestamp behavior.
---

The [conformance suite](https://github.com/mvrxapp/aecs/tree/main/specs/conformance)
is a set of fixed input/output fixtures covering the deterministic threading algorithm
(AECS-1 §5) and timestamp normalization rules (AECS-1 §4), plus an independent Python
checker (`verify.py`) that any implementation can run against its own output.

```bash
git clone https://github.com/mvrxapp/aecs.git
cd aecs
python3 specs/conformance/verify.py
```

`@mvrx/aecs`'s own test suite runs these same fixtures on every build.

---
title: Conformance suite
description: Fixtures and an independent checker for verifying an AECS-1 implementation's threading, timestamp and content-preservation behavior.
---

The [conformance suite](https://github.com/mvrxapp/aecs/tree/main/specs/conformance)
is a set of fixed input/output fixtures covering the deterministic threading algorithm
(AECS-1 §5) and timestamp normalization rules (AECS-1 §6), plus an independent Python
checker (`verify.py`) that any implementation can run against its own output.

Since AECS-1 1.1.0 it also includes **content-preservation fixtures** (AECS-1 §4.3.1):
emails with bottom-posted and inline replies, a body that opens with a quote, newsletter
dividers and signature lookalikes. Each fixture lists the lines `content.clean` and
`content.forAI` must keep and the lines they must drop. Passing structure and threading
checks does not show that cleanup kept the sender's words; these fixtures do.

```bash
git clone https://github.com/mvrxapp/aecs.git
cd aecs
python3 specs/conformance/verify.py
```

`@mvrx/aecs`'s own test suite runs these same fixtures on every build.

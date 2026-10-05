---
title: "DynamoDB"
description: "AECS single-table design for Amazon DynamoDB."
---

Single-table design for AECS-1 Appendix C. Item attributes come from
[`to-rows.mjs`](https://github.com/mvrxapp/aecs/blob/main/examples/storage/to-rows.mjs). DynamoDB items are capped at 400 KB, so the split matters
even more here: `forAI` and metadata go in the item, while `text`/`clean` go in a body item
and `raw.eml`, `body.html` and attachment bytes go in S3 under `blob_prefix`.

`ts12` below is `ts` zero-padded to 12 digits, so string sort order matches time order.
`M` is the mailbox ID.

| Item | `PK` | `SK` | Main attributes |
|---|---|---|---|
| Message | `M#<M>#T#<thread_key>` | `MSG#<ts12>#<message_key>` | the `message` row: `message_id`, `from_email`, `subject`, `forai`, … |
| Body | `M#<M>#MSG#<message_key>` | `BODY` | `text`, `clean` |
| Message pointer | `M#<M>#MSG#<message_key>` | `META` | `thread_key`, `ts`; finds the message from its Message-ID hash |
| Thread summary | `M#<M>#T#<thread_key>` | `THREAD` | `thread_id`, `subject`, `first_ts`, `last_ts`, `message_count`, `last_message_key` |
| Participant | `M#<M>#A#<email>` | `<ts12>#<message_key>#<role>` | `thread_key`, `subject` (enough to render a list row) |
| Reference | `M#<M>#R#<ref_key>` | `<message_key>` | `message_id`, `ts` |

Global secondary indexes:

| Index | Partition key | Sort key | Holds | Query |
|---|---|---|---|---|
| `GSI1` (inbox) | `GSI1PK = M#<M>` | `GSI1SK = <ts12>#<message_key>` | message items only | inbox, newest first |
| `GSI2` (threads) | `GSI2PK = M#<M>#THREADS` | `GSI2SK = <last_ts12>#<thread_key>` | thread summaries only | conversation list |

Queries, all `Query` operations (no `Scan`):

- **Thread context:** `PK = M#<M>#T#<thread_key>`, `SK begins_with MSG#`,
  `ScanIndexForward = false`, `Limit = N`, then reverse. Position is the item's rank once
  the whole thread is read (`AECS-1 §4.4`).
- **Inbox page:** `GSI1`, `GSI1PK = M#<M>`, `ScanIndexForward = false`, `Limit = 50`.
  Pass `LastEvaluatedKey` as `ExclusiveStartKey` for the next page.
- **Mail with a participant:** `PK = M#<M>#A#carol@example.com`, `ScanIndexForward = false`.
- **Lookup by Message-ID:** hash it to `message_key`, `GetItem` the `META` pointer, then
  `GetItem` the message.
- **Replies to a Message-ID:** `PK = M#<M>#R#<sha256(Message-ID)>`.

Store idempotently with a `TransactWriteItems` call: `Put` the message, body and pointer with
`attribute_not_exists(PK)`, `Put` the participant and reference items, and `Update` the thread
summary (`ADD message_count :one`, `SET last_ts = :ts` with a condition, and so on). If the
message `Put` fails its condition, the message is already stored and the transaction does
nothing.

Full-text and semantic search are not built into DynamoDB. Stream new items to OpenSearch,
or embed `forai` into a vector store keyed by `message_key`.

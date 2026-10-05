// AECS storage layout for MongoDB 6+ (AECS-1 Appendix C). Run in mongosh, or adapt for a driver.
// Documents are built from examples/storage/to-rows.mjs. Same split as the SQL schemas:
// small "messages" documents for lists and threads, "bodies" read on demand, and raw.eml /
// body.html / attachment bytes in object storage (S3, R2, GCS) or GridFS under blobPrefix.

// messages: one small document per message (target: a few KB; never the raw message or HTML)
// {
//   _id:         "<mailboxId>:<messageKey>",
//   mailboxId, messageKey, messageId, threadKey, threadId,
//   ts:          NumberLong,              // metadata.timestamp, or processedAt when null
//   date:        ISODate | null,          // metadata.date
//   from:        { email, name },         // email lowercased
//   participants: ["alice@example.com", …],   // every from/to/cc/bcc address, lowercased
//   subject, inReplyTo, forAI,
//   references:  ["<Message-ID>", …],     // thread.references, earliest first
//   attachments: [{ idx, attachmentId, filename, contentType, size, cid, blobKey }],  // metadata only
//   cleanFallback, specVersion, processedAt, blobPrefix,
//   x:           { …x_ extension fields }
// }
db.messages.createIndex({ mailboxId: 1, threadKey: 1, ts: 1, messageKey: 1 }, { name: "aecs_messages_thread" });
db.messages.createIndex({ mailboxId: 1, ts: -1, messageKey: -1 }, { name: "aecs_messages_inbox" });
db.messages.createIndex({ mailboxId: 1, participants: 1, ts: -1 }, { name: "aecs_messages_participant" });
db.messages.createIndex({ mailboxId: 1, references: 1 }, { name: "aecs_messages_references" });

// bodies: { _id: "<mailboxId>:<messageKey>", mailboxId, text, clean }
// A text index for simple search; on Atlas, prefer an Atlas Search index on bodies.clean.
db.bodies.createIndex({ mailboxId: 1, clean: "text" }, { name: "aecs_bodies_search" });

// threads: { _id: "<mailboxId>:<threadKey>", mailboxId, threadId, subject, firstTs, lastTs, messageCount, lastMessageKey }
db.threads.createIndex({ mailboxId: 1, lastTs: -1 }, { name: "aecs_threads_recent" });

// ── Queries ───────────────────────────────────────────────────────────────────────────

// Store idempotently. insertOne fails with a duplicate-key error if the message exists;
// update the thread only when the insert succeeded:
//   db.messages.insertOne(doc)
//   db.threads.updateOne(
//     { _id: `${mailboxId}:${threadKey}` },
//     [{ $set: {
//         mailboxId, threadId,
//         messageCount: { $add: [{ $ifNull: ["$messageCount", 0] }, 1] },
//         subject: { $cond: [{ $lt: [ts, { $ifNull: ["$firstTs", ts + 1] }] }, subject, "$subject"] },
//         lastMessageKey: { $cond: [{ $gte: [ts, { $ifNull: ["$lastTs", ts] }] }, messageKey, "$lastMessageKey"] },
//         firstTs: { $min: [{ $ifNull: ["$firstTs", ts] }, ts] },
//         lastTs: { $max: [{ $ifNull: ["$lastTs", ts] }, ts] } } }],
//     { upsert: true })

// Thread context for an LLM: last N, oldest first after reversing.
//   db.messages.find({ mailboxId, threadKey }, { messageId: 1, from: 1, date: 1, ts: 1, forAI: 1 })
//     .sort({ ts: -1, messageKey: -1 }).limit(20)

// Inbox, keyset pagination:
//   db.messages.find({ mailboxId, $or: [{ ts: { $lt: lastTs } }, { ts: lastTs, messageKey: { $lt: lastKey } }] },
//                    { messageId: 1, threadKey: 1, ts: 1, from: 1, subject: 1 })
//     .sort({ ts: -1, messageKey: -1 }).limit(50)

// Mail with one participant:
//   db.messages.find({ mailboxId, participants: "carol@example.com" }).sort({ ts: -1 }).limit(50)

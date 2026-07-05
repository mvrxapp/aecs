---
title: "Appendix A: Example — Reply in a Thread"
---


This example shows a reply message. Note how the content levels diverge as processing increases.

```json
{
  "messageId": "reply789@mail.example.com",
  "threadId": "root456@mail.example.com",
  "metadata": {
    "from": { "name": "Bob", "email": "bob@example.com" },
    "to": [{ "name": "Alice", "email": "alice@example.com" }],
    "cc": [],
    "bcc": [],
    "subject": "Re: Project update",
    "date": "2026-06-29T14:32:00Z",
    "timestamp": 1782743520
  },
  "content": {
    "rawFull": "From: Bob <bob@example.com>\r\nTo: Alice <alice@example.com>\r\nSubject: Re: Project update\r\nDate: Sun, 29 Jun 2026 14:32:00 +0000\r\nMessage-ID: <reply789@mail.example.com>\r\nIn-Reply-To: <root456@mail.example.com>\r\nReferences: <root456@mail.example.com>\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\nThanks Alice, looks good to me. Let's go ahead.\r\n\r\nOn Sun, 29 Jun 2026 at 09:00, Alice <alice@example.com> wrote:\r\n> Hi Bob, just wanted to share the latest project update.\r\n> Everything is on track for the Thursday deadline.\r\n>\r\n> -- \r\n> Alice Smith | Product Lead",
    "raw": "Thanks Alice, looks good to me. Let's go ahead.\r\n\r\nOn Sun, 29 Jun 2026 at 09:00, Alice <alice@example.com> wrote:\r\n> Hi Bob, just wanted to share the latest project update.\r\n> Everything is on track for the Thursday deadline.\r\n>\r\n> -- \r\n> Alice Smith | Product Lead",
    "html": null,
    "text": "Thanks Alice, looks good to me. Let's go ahead.\n\nOn Sun, 29 Jun 2026 at 09:00, Alice <alice@example.com> wrote:\n> Hi Bob, just wanted to share the latest project update.\n> Everything is on track for the Thursday deadline.\n>\n> --\n> Alice Smith | Product Lead",
    "clean": "Thanks Alice, looks good to me. Let's go ahead.",
    "forAI": "Thanks Alice, looks good to me. Let's go ahead."
  },
  "thread": {
    "position": 1,
    "inReplyTo": "root456@mail.example.com",
    "references": ["root456@mail.example.com"]
  },
  "attachments": [],
  "processing": {
    "processedAt": "2026-06-29T14:32:01Z",
    "specVersion": "1.0"
  }
}
```

`rawFull` contains the complete RFC 5322 message exactly as received. `raw` is the body only, with headers removed but quoted history still present. `text` is the same decoded to clean line endings. `clean` and `forAI` strip the quoted chain and signature, leaving only Bob's actual reply.

`thread.position` is `1` here because this example represents the message as it appears
*after* thread reconciliation (this is the second of two messages, following the root shown
in `references`). A single, isolated `parse()` of this message with no knowledge of the rest
of the thread would instead produce `thread.position: null` per §4.4.

---

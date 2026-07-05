---
title: "3. NormalizedEmail Schema"
---


```json
{
  "messageId": "string",
  "threadId": "string",

  "metadata": {
    "from":    { "name": "string | null", "email": "string" },
    "to":      [{ "name": "string | null", "email": "string" }],
    "cc":      [{ "name": "string | null", "email": "string" }],
    "bcc":     [{ "name": "string | null", "email": "string" }],
    "subject": "string | null",
    "date":    "string | null",
    "timestamp": "number | null"
  },

  "content": {
    "rawFull": "string | null",
    "raw":     "string | null",
    "html":    "string | null",
    "text":    "string | null",
    "clean":   "string | null",
    "forAI":   "string | null"
  },

  "thread": {
    "position":  "number | null",
    "inReplyTo": "string | null",
    "references": ["string"]
  },

  "attachments": [
    {
      "id":          "string | null",
      "filename":    "string",
      "contentType": "string",
      "size":        "number",
      "cid":         "string | null"
    }
  ],

  "processing": {
    "processedAt": "string",
    "specVersion": "string"
  }
}
```

---

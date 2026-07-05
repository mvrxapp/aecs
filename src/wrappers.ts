import type { ForAIWrapper, NormalizedEmail } from "./types.js";

export const wrappers = {
  xml(tag = "email"): ForAIWrapper {
    return {
      wrap: (content: string) => `<${tag}>\n${content}\n</${tag}>`,
    };
  },

  markdown(): ForAIWrapper {
    return {
      wrap: (content: string) =>
        content
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n"),
    };
  },

  block(label = "UNTRUSTED EMAIL"): ForAIWrapper {
    return {
      wrap: (content: string, _email: NormalizedEmail) =>
        `--- ${label} ---\n${content}\n--- END ${label} ---`,
    };
  },
};

export type { ForAIWrapper };

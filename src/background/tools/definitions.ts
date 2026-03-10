export const TOOLS = [
  {
    type: "function",
    function: {
      name: "unblock_website",
      description:
        "Temporarily unblock a website for the user. Use null for indefinite access. Always pair with send_message.",
      parameters: {
        type: "object",
        properties: {
          duration_minutes: {
            type: ["number", "null"],
            description: "How long to unblock in minutes. null = indefinite.",
          },
          reason: {
            type: "string",
            description: "Why you are granting access.",
          },
        },
        required: ["duration_minutes", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "block_website",
      description: "Block or re-block a website immediately. Always pair with send_message to explain to the user.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why you are blocking it." },
        },
        required: ["reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "edit_settings",
      description:
        "Edit one of the user's three settings fields. The content fully replaces the current value — include everything, not just changes. " +
        "blocked_domains: newline-separated list of domains to block. " +
        "tracked_domains: newline-separated list of domains to silently monitor. " +
        "rules_and_preferences: free-text rules (add, edit, or delete rules by rewriting the full text).",
      parameters: {
        type: "object",
        properties: {
          field: {
            type: "string",
            enum: ["blocked_domains", "tracked_domains", "rules_and_preferences"],
            description: "Which field to update.",
          },
          content: {
            type: "string",
            description: "The full new value. For domains: one per line. For rules_and_preferences: full free text.",
          },
          reason: {
            type: "string",
            description: "Why you are making this change.",
          },
        },
        required: ["field", "content", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_message",
      description:
        "Send a message to the user (shown in the chat / overlay). Always use this alongside unblock_website or block_website.",
      parameters: {
        type: "object",
        properties: {
          message: { type: "string", description: "The message to send." },
          reason: {
            type: "string",
            description: "Internal reason for sending this message.",
          },
        },
        required: ["message", "reason"],
      },
    },
  },
];

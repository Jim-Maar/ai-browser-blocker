import { getStorage } from "../shared/storage";
import { OPENROUTER_BASE_URL, DEFAULT_MODEL } from "../shared/constants";
import { TOOLS, executeTool } from "./tools";
import type { ToolCallArgs, ToolExecutionContext } from "./tools";
import type { ChatMessage, HistoryEntry } from "../shared/types";

const OPENROUTER_KEY = import.meta.env.VITE_OPENROUTER_KEY as string;
const OPENROUTER_MODEL = (import.meta.env.VITE_OPENROUTER_MODEL as string) || DEFAULT_MODEL;

// ─── History formatting ───────────────────────────────────────────────────────

function formatHistory(entries: HistoryEntry[]): string {
  if (entries.length === 0) return "(no history yet)";
  return entries
    .map((e) => {
      const time = new Date(e.timestamp).toLocaleString();
      const parts = [`[${time}] ${e.type}`];
      if (e.domain) parts.push(`domain:${e.domain}`);
      if (e.pageTitle) parts.push(`title:"${e.pageTitle}"`);
      if (e.durationSeconds) parts.push(`duration:${Math.round(e.durationSeconds / 60)}min`);
      if (e.reason) parts.push(`reason:"${e.reason}"`);
      return parts.join(" ");
    })
    .join("\n");
}

// ─── Main AI call ─────────────────────────────────────────────────────────────

interface AiCallOpts {
  domain: string;
  trigger: "user_message" | "url_change" | "visit_attempt";
  userMessage?: string;
  urlMeta?: { url: string; title: string; idle?: boolean };
  tabId?: number;
  chatSession: ChatMessage[];
}

async function buildSystemPrompt(currentDomain: string): Promise<string> {
  const [blockedDomains, trackedDomains, rulesAndPreferences, history] = await Promise.all([
    getStorage("blockedDomains"),
    getStorage("trackedDomains"),
    getStorage("rulesAndPreferences"),
    getStorage("history"),
  ]);

  const datetime = new Date().toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return `You are THE BOUNCER, a skeptical octopus enforcing the user's own internet rules.
Be direct. Dry humor. Firm but fair.
Now: ${datetime}
The user is trying to visit: ${currentDomain}
All tool calls (unblock/block) automatically target this domain.

Always call send_message alongside unblock_website or block_website to explain your decision.
When notified of a URL change, do NOT re-block if the page looks like a generic landing page, home page, feed, or search results, or if the unblock happened less than 1 minute ago. Give the user time to navigate to their stated purpose.

<blocked_domains>
${blockedDomains.length > 0 ? blockedDomains.join("\n") : "(none)"}
</blocked_domains>

<tracked_domains>
${trackedDomains.length > 0 ? trackedDomains.join("\n") : "(none)"}
</tracked_domains>

<rules_and_preferences>
${rulesAndPreferences || "(no rules set yet)"}
</rules_and_preferences>

<history>
${formatHistory(history)}
</history>`;
}

function buildTriggerMessage(opts: AiCallOpts): { role: string; content: string } | null {
  if (opts.trigger === "user_message" && opts.userMessage) {
    return { role: "user", content: opts.userMessage };
  }
  if (opts.trigger === "url_change" && opts.urlMeta) {
    const prefix = opts.urlMeta.idle
      ? `[System: User has been on the same page for 1+ minute without navigating — possible idle browsing on ${opts.domain}]`
      : `[System: User navigated on ${opts.domain}]`;
    return {
      role: "user",
      content: `${prefix}\nPage title: "${opts.urlMeta.title}"\nURL: ${opts.urlMeta.url}`,
    };
  }
  if (opts.trigger === "visit_attempt") {
    return {
      role: "user",
      content: `[System: User is trying to access ${opts.domain}. They will see this conversation on the blocked page.]`,
    };
  }
  return null;
}

interface CompletionMessage {
  role: string;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
}

const LOG_PREFIX = "[AI Bouncer]";

async function fetchCompletion(messages: object[]): Promise<CompletionMessage | null> {
  let response: Response;
  try {
    response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        tools: TOOLS,
        tool_choice: "auto",
      }),
    });
  } catch (err) {
    console.error(LOG_PREFIX, "Network error:", err);
    return null;
  }

  if (!response.ok) {
    console.error(LOG_PREFIX, `API ${response.status}:`, await response.text());
    return null;
  }

  const data = (await response.json()) as {
    choices: Array<{ finish_reason: string; message: CompletionMessage }>;
  };
  return data.choices[0].message;
}

async function callWithTools(messages: object[], toolContext: ToolExecutionContext): Promise<string | null> {
  const message = await fetchCompletion(messages);
  if (!message) return "Sorry, I had trouble connecting. Try again.";

  let sendMessageText: string | null = null;

  if (message.tool_calls?.length) {
    for (const tc of message.tool_calls) {
      let args: ToolCallArgs = {};
      try {
        args = JSON.parse(tc.function.arguments);
      } catch {}

      if (tc.function.name === "send_message") {
        sendMessageText = (args.message as string) ?? null;
      } else {
        console.log(LOG_PREFIX, "Tool:", tc.function.name, args);
        await executeTool(tc.function.name, args, toolContext);
      }
    }
  }

  return message.content ?? sendMessageText;
}

export async function callAI(opts: AiCallOpts): Promise<string | null> {
  const systemPrompt = await buildSystemPrompt(opts.domain);

  const messages: object[] = [
    { role: "system", content: systemPrompt },
    ...opts.chatSession.map((msg) => ({ role: msg.role, content: msg.content })),
  ];

  const triggerMessage = buildTriggerMessage(opts);
  if (triggerMessage) messages.push(triggerMessage);

  console.log(LOG_PREFIX, opts.trigger, opts.domain);
  const toolContext: ToolExecutionContext = { domain: opts.domain, tabId: opts.tabId };

  return callWithTools(messages, toolContext);
}

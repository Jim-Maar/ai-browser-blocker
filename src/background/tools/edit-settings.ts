import { setStorage, appendHistory } from "../../shared/storage";
import { syncAllRules } from "../blocker";
import type { ToolCallArgs, ToolExecutionContext } from "./types";

function parseDomainList(content: string): string[] {
  return content
    .split("\n")
    .map((d) =>
      d
        .trim()
        .toLowerCase()
        .replace(/^www\./, ""),
    )
    .filter(Boolean);
}

export async function executeEditSettings(args: ToolCallArgs, context: ToolExecutionContext): Promise<string> {
  const field = args.field;
  const content = args.content ?? "";
  const reason = args.reason ?? "";

  if (field === "blocked_domains") {
    await setStorage("blockedDomains", parseDomainList(content));
    await syncAllRules();
  } else if (field === "tracked_domains") {
    await setStorage("trackedDomains", parseDomainList(content));
  } else if (field === "rules_and_preferences") {
    await setStorage("rulesAndPreferences", content);
  }

  await appendHistory({ timestamp: Date.now(), type: "tool_edit_settings", domain: context.domain, reason });
  return `Updated ${field ?? "settings"}.`;
}

import { getStorage, setStorage, appendHistory } from "../../shared/storage";
import { MS_PER_MINUTE, BLOCKED_PAGE_PATH, POST_UNBLOCK_NAVIGATION_DELAY_MS } from "../../shared/constants";
import { removeBlockRule } from "../blocker";
import { scheduleReblock } from "../timers";
import type { ToolCallArgs, ToolExecutionContext } from "./types";

async function navigateAfterUnblock(domain: string): Promise<void> {
  const blockedPageBase = chrome.runtime.getURL(BLOCKED_PAGE_PATH);
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id && tab.url?.startsWith(blockedPageBase) && tab.url.includes(encodeURIComponent(domain))) {
      await chrome.tabs.update(tab.id, { url: `https://${domain}` });
    }
  }
}

export async function executeUnblock(args: ToolCallArgs, context: ToolExecutionContext): Promise<string> {
  const targetDomain = context.domain;
  const reason = args.reason ?? "";
  const durationMinutes = args.duration_minutes ?? null;
  const expiresAt = durationMinutes !== null ? Date.now() + durationMinutes * MS_PER_MINUTE : null;

  const activeUnblocks = await getStorage("activeUnblocks");
  const filtered = activeUnblocks.filter((u) => u.domain !== targetDomain);
  await setStorage("activeUnblocks", [
    ...filtered,
    { domain: targetDomain, expiresAt, unlockedAt: Date.now(), reason },
  ]);

  await removeBlockRule(targetDomain);
  if (durationMinutes !== null) {
    await scheduleReblock(targetDomain, durationMinutes);
  }
  await appendHistory({ timestamp: Date.now(), type: "tool_unblock", domain: targetDomain, reason });

  setTimeout(() => navigateAfterUnblock(targetDomain), POST_UNBLOCK_NAVIGATION_DELAY_MS);

  return `Unblocked ${targetDomain}${durationMinutes ? ` for ${durationMinutes} minutes` : " indefinitely"}.`;
}

import { getStorage, setStorage, appendHistory } from "../shared/storage";
import { ALARM_PREFIX } from "../shared/constants";
import { restoreBlockRule } from "./blocker";

function alarmNameForDomain(domain: string): string {
  return `${ALARM_PREFIX}${domain}`;
}

export async function scheduleReblock(domain: string, durationMinutes: number): Promise<void> {
  await chrome.alarms.create(alarmNameForDomain(domain), {
    delayInMinutes: durationMinutes,
  });
}

export async function cancelReblock(domain: string): Promise<void> {
  await chrome.alarms.clear(alarmNameForDomain(domain));
}

export async function handleReblockAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;

  const domain = alarm.name.slice(ALARM_PREFIX.length);
  const activeUnblocks = await getStorage("activeUnblocks");
  const session = activeUnblocks.find((u) => u.domain === domain);
  if (!session) return;

  await setStorage(
    "activeUnblocks",
    activeUnblocks.filter((u) => u.domain !== domain),
  );

  await restoreBlockRule(domain);

  await appendHistory({
    timestamp: Date.now(),
    type: "tool_block",
    domain,
    reason: "Unblock session expired",
  });

  await notifyTabsOnDomain(domain, { type: "REBLOCK" });
}

export async function notifyTabsOnDomain(domain: string, message: object): Promise<void> {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.id || !tab.url) continue;
    try {
      const url = new URL(tab.url);
      const tabDomain = url.hostname.replace(/^www\./, "");
      if (tabDomain === domain || tabDomain.endsWith(`.${domain}`)) {
        await chrome.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    } catch {}
  }
}

import type { StorageData, HistoryEntry, UnblockSession } from "./types";
import { HISTORY_MAX } from "./constants";

const DEFAULTS: StorageData = {
  blockedDomains: [],
  trackedDomains: [],
  rulesAndPreferences: "",
  activeUnblocks: [],
  history: [],
};

export async function getStorage<K extends keyof StorageData>(key: K): Promise<StorageData[K]> {
  const result = await chrome.storage.local.get(key);
  return (result[key] ?? DEFAULTS[key]) as StorageData[K];
}

export async function setStorage<K extends keyof StorageData>(key: K, value: StorageData[K]): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function appendHistory(entry: Omit<HistoryEntry, "id">): Promise<void> {
  const history = await getStorage("history");
  const newEntry: HistoryEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  const updated = [...history, newEntry].slice(-HISTORY_MAX);
  await setStorage("history", updated);
}

export async function updateLastTrackedVisit(domain: string, durationSeconds: number): Promise<void> {
  const history = await getStorage("history");
  // Find the last tracked_visit for this domain and update its duration
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].type === "tracked_visit" && history[i].domain === domain) {
      history[i].durationSeconds = durationSeconds;
      await setStorage("history", history);
      return;
    }
  }
}

export async function getActiveUnblock(domain: string): Promise<UnblockSession | null> {
  const unblocks = await getStorage("activeUnblocks");
  const session = unblocks.find((u) => u.domain === domain);
  if (!session) return null;
  if (session.expiresAt !== null && Date.now() > session.expiresAt) {
    await setStorage(
      "activeUnblocks",
      unblocks.filter((u) => u.domain !== domain),
    );
    return null;
  }
  return session;
}

export function normalizeDomain(hostname: string): string {
  return hostname.replace(/^www\./, "").toLowerCase();
}

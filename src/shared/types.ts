export interface StorageData {
  blockedDomains: string[];
  trackedDomains: string[];
  rulesAndPreferences: string;
  activeUnblocks: UnblockSession[];
  history: HistoryEntry[];
}

export interface UnblockSession {
  domain: string;
  expiresAt: number | null;
  unlockedAt: number;
  reason: string;
}

export type HistoryEntryType =
  | "visit_attempt"
  | "tool_unblock"
  | "tool_block"
  | "tool_edit_settings"
  | "url_change"
  | "tracked_visit";

export interface HistoryEntry {
  id: string;
  timestamp: number;
  type: HistoryEntryType;
  domain?: string;
  url?: string;
  pageTitle?: string;
  durationSeconds?: number;
  reason?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export type ToBackgroundMessage =
  | { type: "CHAT_MESSAGE"; domain: string; message: string }
  | { type: "GET_CHAT_SESSION"; domain: string }
  | {
      type: "URL_CHANGED";
      domain: string;
      url: string;
      title: string;
      idle?: boolean;
    }
  | { type: "TRACKED_ENTER"; domain: string; url: string; title: string }
  | { type: "TRACKED_LEAVE"; domain: string; durationSeconds: number }
  | { type: "GET_OVERLAY_STATE"; domain: string };

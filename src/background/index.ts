import { syncAllRules } from "./blocker";
import { handleReblockAlarm } from "./timers";
import { callAI } from "./ai";
import { getActiveUnblock, appendHistory, updateLastTrackedVisit } from "../shared/storage";
import type { ChatMessage, ToBackgroundMessage } from "../shared/types";

// ─── Startup ──────────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(syncAllRules);
chrome.runtime.onStartup.addListener(syncAllRules);

// ─── Alarms ───────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener(handleReblockAlarm);

// ─── In-memory chat sessions (tab ID → messages) ────────────────────────────

const chatSessions = new Map<number, ChatMessage[]>();

function getChat(tabId: number): ChatMessage[] {
  return chatSessions.get(tabId) ?? [];
}

function appendChat(tabId: number, message: ChatMessage): void {
  const messages = getChat(tabId);
  messages.push(message);
  chatSessions.set(tabId, messages);
}

// ─── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: ToBackgroundMessage, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch((err) => {
      console.error("[AI Bouncer background]", err);
      sendResponse({ error: String(err) });
    });
  return true; // keep channel open for async response
});

async function handleChatMessage(domain: string, message: string, tabId: number): Promise<unknown> {
  appendChat(tabId, { role: "user", content: message, timestamp: Date.now() });
  const reply = await callAI({
    domain,
    trigger: "user_message",
    userMessage: message,
    tabId,
    chatSession: getChat(tabId),
  });
  if (reply) appendChat(tabId, { role: "assistant", content: reply, timestamp: Date.now() });
  return { reply };
}

async function handleGetChatSession(domain: string, tabId: number): Promise<unknown> {
  if (!chatSessions.has(tabId)) {
    chatSessions.set(tabId, []);
    await appendHistory({
      timestamp: Date.now(),
      type: "visit_attempt",
      domain,
    });
  }

  const unblock = await getActiveUnblock(domain);
  return { chatSession: getChat(tabId), unblock };
}

async function handleGetOverlayState(domain: string, tabId: number): Promise<unknown> {
  const unblock = await getActiveUnblock(domain);
  const chatSession = getChat(tabId);
  const lastUserIdx = [...chatSession].reverse().findIndex((m) => m.role === "user");
  const unreadMessages =
    lastUserIdx === -1
      ? chatSession.filter((m) => m.role === "assistant")
      : chatSession.slice(chatSession.length - lastUserIdx);
  return { unblock, chatSession, unreadMessages };
}

async function handleUrlChanged(
  domain: string,
  url: string,
  title: string,
  idle: boolean | undefined,
  tabId: number,
): Promise<unknown> {
  await appendHistory({
    timestamp: Date.now(),
    type: "url_change",
    domain,
    url,
    pageTitle: title,
  });
  const reply = await callAI({
    domain,
    trigger: "url_change",
    urlMeta: { url, title, idle },
    tabId,
    chatSession: getChat(tabId),
  });
  if (reply) {
    appendChat(tabId, { role: "assistant", content: reply, timestamp: Date.now() });
    await chrome.tabs.sendMessage(tabId, { type: "AI_MESSAGE", message: reply }).catch(() => {});
  }
  return { ok: true };
}

async function handleTrackedEnter(domain: string, url: string, title: string): Promise<unknown> {
  await appendHistory({
    timestamp: Date.now(),
    type: "tracked_visit",
    domain,
    url,
    pageTitle: title,
  });
  return { ok: true };
}

async function handleTrackedLeave(domain: string, durationSeconds: number): Promise<unknown> {
  await updateLastTrackedVisit(domain, durationSeconds);
  return { ok: true };
}

async function handleMessage(msg: ToBackgroundMessage, sender: chrome.runtime.MessageSender): Promise<unknown> {
  const tabId = sender.tab?.id;

  switch (msg.type) {
    case "CHAT_MESSAGE":
      return tabId !== undefined ? handleChatMessage(msg.domain, msg.message, tabId) : { error: "No tab ID" };
    case "GET_CHAT_SESSION":
      return tabId !== undefined ? handleGetChatSession(msg.domain, tabId) : { error: "No tab ID" };
    case "GET_OVERLAY_STATE":
      return tabId !== undefined ? handleGetOverlayState(msg.domain, tabId) : { error: "No tab ID" };
    case "URL_CHANGED":
      return tabId !== undefined
        ? handleUrlChanged(msg.domain, msg.url, msg.title, msg.idle, tabId)
        : { error: "No tab ID" };
    case "TRACKED_ENTER":
      return handleTrackedEnter(msg.domain, msg.url, msg.title);
    case "TRACKED_LEAVE":
      return handleTrackedLeave(msg.domain, msg.durationSeconds);
    default:
      return { error: "Unknown message type" };
  }
}

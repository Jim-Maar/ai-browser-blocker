import { createRoot } from "react-dom/client";
import { createElement } from "react";
import { Overlay } from "./Overlay";
import { normalizeDomain } from "../shared/storage";
import { URL_CHANGE_DEBOUNCE_MS } from "../shared/constants";
import type { UnblockSession, ChatMessage } from "../shared/types";

const domain = normalizeDomain(location.hostname);
if (!domain) throw new Error("No domain");

let trackedEnterTime: number | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

async function init() {
  const res = (await chrome.runtime.sendMessage({
    type: "GET_OVERLAY_STATE",
    domain,
  })) as {
    unblock: UnblockSession | null;
    chatSession: ChatMessage[];
    unreadMessages: ChatMessage[];
  };

  if (res.unblock) {
    injectOverlay(res.unblock, res.chatSession, res.unreadMessages);
    setupUrlMonitor("unblocked");
    resetIdleTimer();
  } else {
    const storage = await chrome.storage.local.get("trackedDomains");
    const trackedDomains: string[] = storage.trackedDomains ?? [];
    if (trackedDomains.some((d: string) => domain === d || domain.endsWith(`.${d}`))) {
      startTracking();
      setupUrlMonitor("tracked");
    }
  }
}

function injectOverlay(unblock: UnblockSession, chatSession: ChatMessage[], unreadMessages: ChatMessage[]) {
  const host = document.createElement("div");
  host.id = "ai-bouncer-host";
  const shadow = host.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  shadow.appendChild(mountPoint);
  document.body.appendChild(host);

  const root = createRoot(mountPoint);
  root.render(
    createElement(Overlay, {
      domain,
      initialUnblock: unblock,
      initialChat: chatSession,
      initialUnread: unreadMessages,
    }),
  );
}

function startTracking() {
  trackedEnterTime = Date.now();
  chrome.runtime
    .sendMessage({
      type: "TRACKED_ENTER",
      domain,
      url: location.href,
      title: document.title,
    })
    .catch(() => {});
}

// ─── Idle timer (unblocked domains only) ──────────────────────────────────────
// If user doesn't navigate for 1 minute after unblock, notify the AI.

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    chrome.runtime
      .sendMessage({
        type: "URL_CHANGED",
        domain,
        url: location.href,
        title: document.title,
        idle: true,
      })
      .catch(() => {});
  }, 60_000);
}

// ─── URL monitoring ───────────────────────────────────────────────────────────

function setupUrlMonitor(mode: "unblocked" | "tracked") {
  const originalPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    originalPushState(...args);
    onNavigation(mode);
  };
  const originalReplaceState = history.replaceState.bind(history);
  history.replaceState = function (...args) {
    originalReplaceState(...args);
    onNavigation(mode);
  };
  window.addEventListener("popstate", () => onNavigation(mode));

  const titleEl = document.querySelector("title");
  if (titleEl) {
    new MutationObserver(() => onNavigation(mode)).observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}

let lastNotifiedUrl = "";
let lastNotifiedTitle = "";

function onNavigation(mode: "unblocked" | "tracked") {
  const url = location.href;
  const title = document.title;

  if (url === lastNotifiedUrl && title === lastNotifiedTitle) return;
  lastNotifiedUrl = url;
  lastNotifiedTitle = title;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if (mode === "unblocked") {
      chrome.runtime.sendMessage({ type: "URL_CHANGED", domain, url, title }).catch(() => {});
      resetIdleTimer();
    } else if (mode === "tracked") {
      chrome.runtime.sendMessage({ type: "TRACKED_ENTER", domain, url, title }).catch(() => {});
    }
  }, URL_CHANGE_DEBOUNCE_MS);
}

// ─── Page leave ───────────────────────────────────────────────────────────────

window.addEventListener("pagehide", () => {
  if (idleTimer) clearTimeout(idleTimer);
  if (trackedEnterTime !== null) {
    const durationSeconds = Math.round((Date.now() - trackedEnterTime) / 1000);
    chrome.runtime.sendMessage({ type: "TRACKED_LEAVE", domain, durationSeconds }).catch(() => {});
    trackedEnterTime = null;
  }
});

init().catch(console.error);

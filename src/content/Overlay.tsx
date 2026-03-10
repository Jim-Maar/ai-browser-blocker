import { useState, useEffect, useRef } from "react";
import type { ChatMessage, UnblockSession } from "../shared/types";

interface OverlayProps {
  domain: string;
  initialUnblock: UnblockSession | null;
  initialChat: ChatMessage[];
  initialUnread: ChatMessage[];
}

function formatTime(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function Overlay({ domain, initialUnblock, initialChat, initialUnread }: OverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const [chat, setChat] = useState<ChatMessage[]>(initialChat);
  const [unread, setUnread] = useState<ChatMessage[]>(initialUnread);
  const [unblock] = useState<UnblockSession | null>(initialUnblock);
  const [remaining, setRemaining] = useState<number | null>(
    initialUnblock?.expiresAt ? initialUnblock.expiresAt - Date.now() : null,
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (remaining === null) return;
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev === null) return null;
        const next = prev - 1000;
        return next <= 0 ? 0 : next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [remaining !== null]);

  useEffect(() => {
    const handler = (msg: { type: string; message?: string }) => {
      if (msg.type === "AI_MESSAGE" && msg.message) {
        const newMsg: ChatMessage = {
          role: "assistant",
          content: msg.message,
          timestamp: Date.now(),
        };
        setChat((prev) => [...prev, newMsg]);
        if (!expanded) setUnread((prev) => [...prev, newMsg]);
      } else if (msg.type === "REBLOCK") {
        window.location.reload();
      } else if (msg.type === "TIMER_UPDATE") {
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, [expanded]);

  useEffect(() => {
    if (expanded) {
      setUnread([]);
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [expanded, chat]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    setLoading(true);
    const userMsg: ChatMessage = {
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    setChat((prev) => [...prev, userMsg]);
    try {
      const res = (await chrome.runtime.sendMessage({
        type: "CHAT_MESSAGE",
        domain,
        message: text,
      })) as { reply?: string };
      if (res?.reply) {
        setChat((prev) => [...prev, { role: "assistant", content: res.reply!, timestamp: Date.now() }]);
      }
    } finally {
      setLoading(false);
    }
  }

  const timerLabel = unblock
    ? unblock.expiresAt === null
      ? "∞"
      : remaining !== null
        ? formatTime(remaining)
        : "..."
    : "";

  const hasUnread = unread.length > 0;

  return (
    <div style={styles.container}>
      {expanded ? (
        <div style={styles.panel}>
          <div style={styles.header} onClick={() => setExpanded(false)}>
            <span>🐙 AI Bouncer</span>
            <span style={{ opacity: 0.6, fontSize: 12 }}>{timerLabel} ▾</span>
          </div>
          <div style={styles.messages}>
            {chat.map((m, i) => (
              <div key={i} style={m.role === "user" ? styles.userMsg : styles.aiMsg}>
                {m.content}
              </div>
            ))}
            {loading && <div style={styles.aiMsg}>…</div>}
            <div ref={chatEndRef} />
          </div>
          <div style={styles.inputRow}>
            <input
              style={styles.input}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Say something..."
              autoFocus
            />
            <button style={styles.sendBtn} onClick={sendMessage} disabled={loading}>
              ▶
            </button>
          </div>
        </div>
      ) : (
        <div style={styles.pill} onClick={() => setExpanded(true)}>
          <span>🐙</span>
          {timerLabel && <span style={styles.timer}>{timerLabel}</span>}
          {hasUnread && <span style={styles.dot} />}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: "fixed",
    bottom: 20,
    right: 20,
    zIndex: 2147483647,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  pill: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(15,15,25,0.92)",
    color: "#fff",
    padding: "8px 14px",
    borderRadius: 999,
    cursor: "pointer",
    fontSize: 14,
    backdropFilter: "blur(8px)",
    border: "1px solid rgba(255,255,255,0.12)",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    userSelect: "none",
  },
  timer: {
    fontVariantNumeric: "tabular-nums",
    fontSize: 13,
    opacity: 0.85,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#f97316",
    flexShrink: 0,
  },
  panel: {
    width: 300,
    background: "rgba(12,12,20,0.96)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    backdropFilter: "blur(12px)",
    color: "#e8e8f0",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "10px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
  },
  messages: {
    padding: "10px 12px",
    maxHeight: 220,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  userMsg: {
    alignSelf: "flex-end",
    background: "#2563eb",
    color: "#fff",
    padding: "6px 10px",
    borderRadius: "12px 12px 2px 12px",
    fontSize: 13,
    maxWidth: "85%",
  },
  aiMsg: {
    alignSelf: "flex-start",
    background: "rgba(255,255,255,0.08)",
    color: "#e8e8f0",
    padding: "6px 10px",
    borderRadius: "12px 12px 12px 2px",
    fontSize: 13,
    maxWidth: "85%",
  },
  inputRow: {
    display: "flex",
    borderTop: "1px solid rgba(255,255,255,0.08)",
    padding: "8px 10px",
    gap: 6,
  },
  input: {
    flex: 1,
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 8,
    color: "#e8e8f0",
    padding: "6px 10px",
    fontSize: 13,
    outline: "none",
  },
  sendBtn: {
    background: "#2563eb",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    padding: "6px 10px",
    cursor: "pointer",
    fontSize: 13,
  },
};

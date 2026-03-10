import { useState, useEffect, useRef } from "react";
import type { ChatMessage } from "../shared/types";

export function BlockedPage() {
  const params = new URLSearchParams(location.search);
  const domain = params.get("domain") ?? "this site";

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    chrome.runtime
      .sendMessage({ type: "GET_CHAT_SESSION", domain })
      .then((res: { chatSession: ChatMessage[] }) => {
        setChat(res.chatSession ?? []);
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      })
      .catch(() => setLoading(false));
  }, [domain]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  async function sendMessage() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setLoading(true);
    setError(null);

    setChat((prev) => [...prev, { role: "user", content: text, timestamp: Date.now() }]);

    try {
      const res = (await chrome.runtime.sendMessage({
        type: "CHAT_MESSAGE",
        domain,
        message: text,
      })) as { reply?: string; error?: string };
      if (res?.reply) {
        setChat((prev) => [...prev, { role: "assistant", content: res.reply!, timestamp: Date.now() }]);
      }
      if (res?.error) setError(res.error);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }

  const octopusUrl = chrome.runtime.getURL("octopus.png");

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.imageWrap}>
          <img
            src={octopusUrl}
            alt="The Bouncer"
            style={styles.image}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>

        <div style={styles.domain}>{domain}</div>

        <div style={styles.chatBox}>
          {chat.map((m, i) => (
            <div key={i} style={m.role === "user" ? styles.userBubble : styles.aiBubble}>
              {m.content}
            </div>
          ))}
          {loading && chat.length > 0 && <div style={styles.aiBubble}>…</div>}
          <div ref={chatEndRef} />
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <div style={styles.inputRow}>
          <input
            ref={inputRef}
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Why should I let you in?"
            disabled={loading}
          />
          <button style={styles.sendBtn} onClick={sendMessage} disabled={loading || !input.trim()}>
            ▶
          </button>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  imageWrap: {
    width: "100%",
    display: "flex",
    justifyContent: "center",
  },
  image: {
    maxHeight: "38vh",
    maxWidth: "100%",
    objectFit: "contain",
    borderRadius: 16,
  },
  domain: {
    fontSize: 13,
    opacity: 0.45,
    letterSpacing: "0.05em",
    textTransform: "lowercase",
  },
  chatBox: {
    width: "100%",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "12px 14px",
    maxHeight: 320,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  userBubble: {
    alignSelf: "flex-end",
    background: "#2563eb",
    color: "#fff",
    padding: "8px 12px",
    borderRadius: "14px 14px 2px 14px",
    fontSize: 14,
    maxWidth: "85%",
    lineHeight: 1.45,
  },
  aiBubble: {
    alignSelf: "flex-start",
    background: "rgba(255,255,255,0.07)",
    color: "#e8e8f0",
    padding: "8px 12px",
    borderRadius: "14px 14px 14px 2px",
    fontSize: 14,
    maxWidth: "85%",
    lineHeight: 1.45,
    whiteSpace: "pre-wrap",
  },
  error: {
    color: "#f87171",
    fontSize: 12,
    opacity: 0.8,
  },
  inputRow: {
    display: "flex",
    width: "100%",
    gap: 8,
  },
  input: {
    flex: 1,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.14)",
    borderRadius: 10,
    color: "#e8e8f0",
    padding: "10px 14px",
    fontSize: 14,
    outline: "none",
  },
  sendBtn: {
    background: "#2563eb",
    border: "none",
    borderRadius: 10,
    color: "#fff",
    padding: "10px 16px",
    cursor: "pointer",
    fontSize: 14,
    opacity: 1,
  },
};

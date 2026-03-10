import { useState, useEffect } from "react";
import { getStorage, setStorage } from "../shared/storage";
import { syncAllRules } from "../background/blocker";
import type { HistoryEntry } from "../shared/types";

type View = "loading" | "settings" | "history";

function parseDomains(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((d) =>
      d
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .replace(/\/.*$/, ""),
    )
    .filter(Boolean);
}

// ─── Settings ─────────────────────────────────────────────────────────────────

function Settings({ onShowHistory }: { onShowHistory: () => void }) {
  const [blockedText, setBlockedText] = useState("");
  const [trackedText, setTrackedText] = useState("");
  const [rulesText, setRulesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [historyReset, setHistoryReset] = useState(false);

  useEffect(() => {
    Promise.all([getStorage("blockedDomains"), getStorage("trackedDomains"), getStorage("rulesAndPreferences")]).then(
      ([blocked, tracked, rules]) => {
        setBlockedText(blocked.join("\n"));
        setTrackedText(tracked.join("\n"));
        setRulesText(rules);
      },
    );
  }, []);

  async function save() {
    setSaving(true);
    const blocked = parseDomains(blockedText);
    const tracked = parseDomains(trackedText);
    await setStorage("blockedDomains", blocked);
    await setStorage("trackedDomains", tracked);
    await setStorage("rulesAndPreferences", rulesText);
    await syncAllRules();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  async function resetHistory() {
    await setStorage("history", []);
    setHistoryReset(true);
    setTimeout(() => setHistoryReset(false), 1500);
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <span style={s.logo}>🐙 AI Bouncer</span>
        <button style={s.linkBtn} onClick={onShowHistory}>
          History
        </button>
      </div>

      <div style={s.field}>
        <label style={s.label}>Blocked domains (one per line)</label>
        <textarea
          style={s.textarea}
          value={blockedText}
          onChange={(e) => setBlockedText(e.target.value)}
          placeholder={"example.com\nsocial-site.com"}
          rows={4}
        />
      </div>

      <div style={s.field}>
        <label style={s.label}>Tracked domains — not blocked, but visits are logged for context</label>
        <textarea
          style={s.textarea}
          value={trackedText}
          onChange={(e) => setTrackedText(e.target.value)}
          placeholder={"productive-site.com"}
          rows={3}
        />
      </div>

      <div style={s.field}>
        <label style={s.label}>Rules (free text — the AI reads this)</label>
        <textarea
          style={{ ...s.textarea, minHeight: 120 }}
          value={rulesText}
          onChange={(e) => setRulesText(e.target.value)}
          placeholder={
            "Streaming is okay when I'm sick.\n" +
            "Video sites are fine for tutorials or lectures.\n" +
            "Social media is never okay during work hours (9am–6pm).\n" +
            "I can earn extra leisure time by telling you I exercised.\n" +
            "Max 2 hours of non-educational video per week."
          }
          rows={6}
        />
      </div>

      <button style={s.btn} onClick={save} disabled={saving}>
        {saved ? "✓ Saved" : saving ? "Saving…" : "Save"}
      </button>

      {/* DEBUG: remove before release */}
      <button style={s.debugBtn} onClick={resetHistory}>
        {historyReset ? "✓ History cleared" : "Reset history (debug)"}
      </button>
    </div>
  );
}

// ─── History view ─────────────────────────────────────────────────────────────

function HistoryView({ onBack }: { onBack: () => void }) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    getStorage("history").then((h) => setEntries([...h].reverse()));
  }, []);

  function label(e: HistoryEntry): string {
    switch (e.type) {
      case "visit_attempt":
        return `🚫 Tried to visit ${e.domain}`;
      case "tool_unblock":
        return `✅ Unblocked ${e.domain}`;
      case "tool_block":
        return `🔒 Blocked ${e.domain}`;
      case "tool_edit_settings":
        return `✏️ Settings updated`;
      case "url_change":
        return `↗ Navigated on ${e.domain}${e.pageTitle ? ` — "${e.pageTitle}"` : ""}`;
      case "tracked_visit":
        return `👁 Visited ${e.domain}${e.pageTitle ? ` — "${e.pageTitle}"` : ""}${e.durationSeconds ? ` (${Math.round(e.durationSeconds / 60)}min)` : ""}`;
      default:
        return e.type;
    }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <button style={s.linkBtn} onClick={onBack}>
          ← Back
        </button>
        <span style={{ opacity: 0.5, fontSize: 12 }}>Last {entries.length} events</span>
      </div>
      <div style={s.historyList}>
        {entries.length === 0 && <div style={{ opacity: 0.4, textAlign: "center", padding: 24 }}>No history yet</div>}
        {entries.map((e) => (
          <div key={e.id} style={s.historyEntry}>
            <div style={s.historyLabel}>{label(e)}</div>
            {e.reason && <div style={s.historyReason}>{e.reason}</div>}
            <div style={s.historyTime}>{new Date(e.timestamp).toLocaleString()}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export function Popup() {
  const [view, setView] = useState<View>("loading");

  useEffect(() => {
    // Always show settings directly — no onboarding flow
    setView("settings");
  }, []);

  if (view === "loading") return <div style={{ padding: 24, opacity: 0.4 }}>Loading…</div>;
  if (view === "history") return <HistoryView onBack={() => setView("settings")} />;
  return <Settings onShowHistory={() => setView("history")} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: "16px 16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  logo: { fontSize: 15, fontWeight: 700 },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  label: { fontSize: 12, color: "#6b6b88", marginBottom: 4 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  textarea: {
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#e8e8f0",
    padding: "8px 10px",
    fontSize: 13,
    resize: "vertical",
    outline: "none",
    fontFamily: "inherit",
    lineHeight: 1.6,
  },
  btn: {
    background: "#2563eb",
    border: "none",
    borderRadius: 8,
    color: "#fff",
    padding: "9px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    alignSelf: "flex-end",
  },
  debugBtn: {
    background: "none",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8,
    color: "#555570",
    padding: "6px 12px",
    fontSize: 12,
    cursor: "pointer",
    alignSelf: "flex-end",
  },
  linkBtn: {
    background: "none",
    border: "none",
    color: "#6b8aed",
    fontSize: 13,
    cursor: "pointer",
    padding: 0,
  },
  historyList: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    maxHeight: 400,
    overflowY: "auto",
  },
  historyEntry: {
    padding: "8px 10px",
    borderRadius: 8,
    background: "rgba(255,255,255,0.04)",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  historyLabel: { fontSize: 13, color: "#e8e8f0" },
  historyReason: { fontSize: 12, color: "#6b8aed", fontStyle: "italic" },
  historyTime: { fontSize: 11, color: "#555570" },
};

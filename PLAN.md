# AI Browser Blocker — Implementation Plan

## Context
Build a Chrome MV3 browser extension that blocks distracting websites and replaces them with an AI-powered "bouncer" (an octopus) that the user must convince to grant access. The AI enforces rules the user writes themselves in a BOUNCER.md file. The extension also silently tracks "monitored" domains to give the AI behavioral context.

---

## Critique & Improvements Over Original Spec

- **Productivity tracking**: Removed auto-tracking of productive time. Instead, users tell the AI directly ("I just went jogging"). The AI uses *tracked domain history* (time spent on GitHub, docs, etc.) as behavioral context. This is more honest and requires no heuristics.
- **Tracked domains** (new): A second domain list — not blocked, just monitored. Every visit/leave is logged with domain + page title + duration. The AI sees this (e.g. "you watched 3 math videos today") and uses it to make decisions.
- **Page metadata awareness**: Content script watches `document.title` changes on any tracked/unblocked domain and sends them to history. Page title is the best universally-available proxy for "what is the user actually looking at".
- **AI proactive messages**: After a URL change on an unblocked domain, the AI is called automatically and may send a message or re-block immediately.
- **Per-domain chat history**: Each domain has its own chat thread. The blocked page shows the conversation for that domain.
- **Timers via chrome.alarms**: MV3 service workers can be unloaded. All timers use chrome.alarms, not setTimeout.
- **Local dev via .env**: No onboarding API key step. VITE_OPENROUTER_KEY baked in at build time for local testing.

---

## File Structure

```
ai-browser-blocker/
├── .env                          # VITE_OPENROUTER_KEY, VITE_OPENROUTER_MODEL
├── .env.example
├── PLAN.md
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── public/
│   ├── octopus.png               # (user will provide)
│   └── icons/                    # 16, 32, 48, 128px extension icons
├── src/
│   ├── background/
│   │   ├── index.ts              # Service worker entry, message router
│   │   ├── blocker.ts            # declarativeNetRequest rule management
│   │   ├── ai.ts                 # OpenRouter call + tool execution
│   │   ├── history.ts            # Read/write history (last 100 entries)
│   │   └── timers.ts             # chrome.alarms for unblock expiry
│   ├── content/
│   │   ├── index.ts              # Injected on all pages: URL monitor + widget mount
│   │   └── Widget.tsx            # Floating timer/chat widget (React)
│   ├── blocked/
│   │   ├── index.html
│   │   ├── index.tsx
│   │   └── BlockedPage.tsx       # Octopus image + chat interface (React)
│   ├── popup/
│   │   ├── index.html
│   │   ├── index.tsx
│   │   └── Popup.tsx             # Onboarding + settings (React)
│   └── shared/
│       ├── types.ts              # All shared TypeScript types
│       ├── storage.ts            # chrome.storage.local typed helpers
│       └── constants.ts          # Rule ID base, model defaults, etc.
```

> **Note:** `BOUNCER.md` and `history.json` are not source files — they are runtime data persisted in `chrome.storage.local`. They are created/updated by the extension at runtime and can be exported from the Settings view.

---

## Runtime Data Files

### `BOUNCER.md` (stored as `storage.bouncerMd`)
Generated from onboarding. Read on every AI call. Editable by the AI via `edit_bouncer` tool or by the user in Settings.

### `history.json` (stored as `storage.history`)
Append-only log of all events, capped at 100 entries (old entries thrown out). Includes block attempts, chat messages, AI decisions, tool calls, tracked domain visits. Passed to AI on every call.

---

## Data Schemas (`src/shared/types.ts`)

```typescript
interface StorageData {
  bouncerMd: string;
  blockedDomains: string[];
  trackedDomains: string[];          // monitored but not blocked
  activeUnblocks: UnblockSession[];
  history: HistoryEntry[];           // capped at 100
  chatSessions: Record<string, ChatMessage[]>; // domain -> messages
  onboardingComplete: boolean;
}

interface UnblockSession {
  domain: string;
  expiresAt: number | null;          // null = indefinite
  unlockedAt: number;
  reason: string;
}

interface HistoryEntry {
  id: string;
  timestamp: number;
  type:
    | 'visit_attempt'     // user hit a blocked site
    | 'user_message'      // user typed in chat
    | 'ai_message'        // AI text reply
    | 'tool_unblock'      // AI called unblock_website
    | 'tool_reblock'      // AI called block_website
    | 'tool_edit_bouncer' // AI called edit_bouncer
    | 'tool_message'      // AI called send_message
    | 'url_change'        // navigation within unblocked domain
    | 'tracked_visit'     // entered a tracked domain
    | 'tracked_leave';    // left a tracked domain
  domain?: string;
  url?: string;
  pageTitle?: string;
  durationSeconds?: number;  // for tracked_leave
  content?: string;          // message text or tool reason
  toolArgs?: Record<string, unknown>;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}
```

---

## Manifest (`manifest.json`)

```json
{
  "manifest_version": 3,
  "name": "AI Bouncer",
  "version": "0.1.0",
  "permissions": [
    "declarativeNetRequest",
    "declarativeNetRequestWithHostAccess",
    "storage",
    "tabs",
    "alarms",
    "scripting"
  ],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "background/index.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/index.js"],
    "run_at": "document_idle"
  }],
  "action": { "default_popup": "popup/index.html" },
  "declarative_net_request": {
    "rule_resources": [{ "id": "ruleset_1", "enabled": true, "path": "rules.json" }]
  },
  "web_accessible_resources": [{
    "resources": ["blocked/index.html", "octopus.png"],
    "matches": ["<all_urls>"]
  }]
}
```

---

## Blocking Mechanism (`src/background/blocker.ts`)

- **Add block**: `chrome.declarativeNetRequest.updateDynamicRules` — one rule per domain redirecting `||domain.com/^` → `chrome-extension://<id>/blocked/index.html?url=<encoded>`
- **Remove block** (unblock): remove that domain's dynamic rule
- **Re-block**: re-add the rule
- Rule IDs: `RULE_ID_BASE + index` where index = position in blockedDomains array

```typescript
export async function blockDomain(domain: string): Promise<void>
export async function unblockDomain(domain: string): Promise<void>
export async function syncAllRules(): Promise<void>  // called on startup
```

---

## AI Integration (`src/background/ai.ts`)

### System Prompt

```
You are THE BOUNCER, a skeptical octopus enforcing the user's own internet rules.
Be direct. Dry humor. Firm but fair.
Today: {datetime}

<bouncer_md>{bouncerMd}</bouncer_md>
<history>{history}</history>
```

### OpenRouter Call
- Non-streaming for simplicity
- Model: `VITE_OPENROUTER_MODEL` (default: `anthropic/claude-sonnet-4-6`)
- Context: system prompt + BOUNCER.md + last 100 history entries + current domain chat thread
- Tool call responses are parsed, executed, and logged to history

```typescript
export async function callAI(opts: {
  domain: string;
  trigger: 'user_message' | 'url_change' | 'visit_attempt';
  userMessage?: string;
  urlMeta?: { url: string; title: string };
}): Promise<void>
```

---

## Message Passing

### Blocked page → Background
```typescript
{ type: 'CHAT_MESSAGE', domain: string, message: string }
→ returns: { role: 'assistant', content: string }
```

### Content script → Background
```typescript
{ type: 'URL_CHANGED', domain: string, url: string, title: string }
{ type: 'TRACKED_ENTER', domain: string, url: string, title: string }
{ type: 'TRACKED_LEAVE', domain: string, durationSeconds: number }
{ type: 'GET_WIDGET_STATE', domain: string }
→ returns: { unblock: UnblockSession | null, newMessages: ChatMessage[] }
```

### Background → Content script (via `chrome.tabs.sendMessage`)
```typescript
{ type: 'AI_MESSAGE', message: string }    // widget shows dot + message
{ type: 'REBLOCK' }                         // widget unmounts, page may reload
{ type: 'TIMER_UPDATE', remainingSeconds: number | null }
```

---

## Timer Management (`src/background/timers.ts`)

- On unblock: `chrome.alarms.create('unblock-<domain>', { delayInMinutes })`
- On `chrome.alarms.onAlarm`: re-block domain, log to history, notify active tab
- On startup: call `syncAllRules()` — restore any still-valid unblocks, clear expired ones

---

## Content Script (`src/content/index.ts`)

1. **On load**: send `GET_WIDGET_STATE` to background
   - If active unblock for this domain → inject `<Widget>` into page
   - If tracked domain → record enter time, send `TRACKED_ENTER`
2. **URL monitoring**: intercept `history.pushState` + listen to `popstate` + `MutationObserver` on `document.title`
   - On change: if unblocked domain → send `URL_CHANGED` with current URL + page title (triggers AI)
   - On change: if tracked domain → update tracked URL + title
3. **On page hide/unload**: if tracked domain → send `TRACKED_LEAVE` with duration

---

## Floating Widget (`src/content/Widget.tsx`)

**Collapsed state** (always visible on unblocked domains):
```
[🐙 14:32 •]   ← timer | orange dot if new message
```

**Expanded state** (click to toggle):
```
┌─────────────────────────┐
│ 🐙 AI Bouncer     14:32 │
│─────────────────────────│
│ THE BOUNCER: Fine. 30   │
│ minutes. Don't waste it.│
│─────────────────────────│
│ [type a message...  ] ▶ │
└─────────────────────────┘
```
- Uses shadow DOM to avoid style conflicts with host page
- Sends messages via `chrome.runtime.sendMessage`

---

## Blocked Page (`src/blocked/BlockedPage.tsx`)

```
┌────────────────────────────────────┐
│                                    │
│        [octopus image]             │
│                                    │
│  ┌──────────────────────────────┐  │
│  │ [chat messages here]         │  │
│  └──────────────────────────────┘  │
│  [Why should I let you in?   ] ▶   │
└────────────────────────────────────┘
```
- URL: `blocked/index.html?url=<encoded_original_url>`
- Extracts `domain` from `url` param on mount
- Loads existing chat thread for domain from background
- On submit → `CHAT_MESSAGE` → renders AI response

---

## Popup / Onboarding (`src/popup/Popup.tsx`)

**Onboarding steps** (shown if `onboardingComplete = false`):
1. **Welcome**: Explain the extension
2. **Blocked sites**: Textarea — one domain per line
3. **Tracked sites**: Textarea — domains to monitor silently (optional)
4. **Your rules**: Large free-text field with placeholder examples:
   ```
   Streaming sites are okay when I'm sick.
   Max 2 hours of non-educational video content per week.
   Video sites are fine for tutorials, lectures, or music while coding.
   I can earn extra leisure time by telling you I exercised.
   Social media is never okay during work hours (9am-6pm weekdays).
   ```
5. **Done**: Saves everything, generates BOUNCER.md, sets `onboardingComplete = true`

**Settings view** (after onboarding): Edit blocked/tracked domains + rules. "View History" shows last 50 events.

---

## BOUNCER.md Generation

```markdown
# BOUNCER.md — My Internet Rules
*Last updated: {date}*

## Blocked Domains
- example-blocked-site.com
...

## Tracked Domains (not blocked, just logged)
- example-productive-site.com
...

## My Rules
{userRulesText}
```

---

## Environment

**.env**
```
VITE_OPENROUTER_KEY=sk-or-...
VITE_OPENROUTER_MODEL=anthropic/claude-sonnet-4-6
```

**.env.example**
```
VITE_OPENROUTER_KEY=your-openrouter-key-here
VITE_OPENROUTER_MODEL=anthropic/claude-sonnet-4-6
```

---

## Build System

- **Vite** with `@crxjs/vite-plugin` for MV3 HMR + manifest processing
- Multi-entry: background, content, blocked page, popup
- `npm run build` → `dist/` → load unpacked in Chrome

---

## Verification Checklist

1. Load extension in Chrome (`chrome://extensions` → Developer mode → Load unpacked → `dist/`)
2. Open popup → complete onboarding with a blocked domain and a tracked domain
3. Visit blocked domain → should redirect to blocked page with octopus image
4. Type a reason to be let in → AI should respond based on BOUNCER.md rules
5. If AI unblocks → widget appears bottom-right with timer
6. Navigate within the unblocked domain → widget shows dot (AI notified of page title change)
7. Visit tracked (non-blocked) domain → no block, but visit + page titles logged in history
8. Open popup → check history shows tracked visit entries
9. Timer expiry: unblock for 1 minute → after 1 min, domain blocks again

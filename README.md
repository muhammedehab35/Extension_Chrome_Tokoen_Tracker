<div align="center">
  <img src="icons/icon128.png" alt="Context Token Tracker Logo" width="96" />

  # ⚡ Context Token Tracker

  > A Chrome extension that tracks your AI token usage **in real-time** and alerts you **before** you hit context limits or daily quotas — on Claude.ai, ChatGPT, Gemini, and Groq.
</div>

---

## 🎬 Demo
https://github.com/user-attachments/assets/87e80b49-718c-465b-a8db-622e223aab73

---

## ✨ Features

- **Real-time floating bar** injected into the page — draggable, always visible
- **Progressive alarms** at 50% / 70% / 85% / 95% of context window
- **PDF & file attachment token estimation** (accounts for binary overhead per file type)
- **Image token counting** (~1,500 vision tokens per image on Claude, ~1,000 on GPT-4o)
- **Popup dashboard** — ring progress, estimated cost, plan selector
- **SPA navigation detection** — resets automatically when you start a new conversation
- **Free vs Plus plan detection** for ChatGPT quota tracking
- **Claude quota alarm** — detects when Claude blocks sending messages
- **Only active inside conversations** — no false positives on homepages or settings pages

---

## 🌐 Supported Platforms

| Platform | Token Counting | Quota / Limit Detection |
|----------|---------------|--------------------------|
| **Claude.ai** | ✅ Internal REST API | ✅ Block keyword detection |
| **ChatGPT** | ✅ DOM scraping (scoped to `<main>`) | ✅ Banner detection |
| **Gemini** | ✅ DOM scraping | ✅ Banner detection |
| **Groq** | ✅ DOM scraping | ✅ Banner detection |

---

## 📏 Context Limits

| Model | Context Limit |
|-------|--------------|
| All Claude models (claude.ai UI) | 200,000 tokens |
| GPT-4o | 128,000 tokens |
| GPT-4.1 | 1,000,000 tokens |
| Gemini Free | 32,000 tokens |
| Gemini Plus | 128,000 tokens |
| Gemini Pro / Ultra | 1,000,000 tokens |
| Groq (all models) | 131,072 tokens |

---

## 🚀 Installation

1. Clone or download this repository
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** → select the `token-tracker/` folder
5. Open Claude.ai, ChatGPT, Gemini or Groq — the tracker appears automatically

> No build step, no npm, no dependencies. Pure vanilla JavaScript.

---

## 📁 File Structure

```
token-tracker/
├── manifest.json               ← Chrome MV3 manifest
├── content-script.js           ← Core: token counting, alarms, floating bar
├── popup/
│   ├── index.html              ← Popup UI (dark theme)
│   ├── style.css               ← Styles
│   └── index.js                ← Reads chrome.storage, updates UI
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   ├── icon128.png
│   └── generate-icons.html     ← Canvas-based icon generator
└── TECHNICAL_DOCUMENTATION.md  ← Full technical reference
```

---

## 🔔 Alarm System

The extension shows a popup notification at each threshold:

| Threshold | Color | Message |
|-----------|-------|---------|
| 50% | 🔵 Blue | "50% of context used" |
| 70% | 🟡 Yellow | "70% reached — consider wrapping up" |
| 85% | 🟠 Orange | "85% — only a little space left!" |
| 95% | 🔴 Red | "95% — start a new conversation!" |

---

## 📎 File Attachment Token Estimation

| File Type | Token Formula |
|-----------|--------------|
| PDF (text) | `bytes / 320` (~1 page ≈ 325 tokens) |
| DOCX / ODT | `bytes / 200` |
| Spreadsheet | `bytes / 500` |
| Code / TXT | `bytes / 4` (plain text ratio) |
| Image | ~1,500 vision tokens per image |

---

## ⚙️ Technical Notes

- Claude.ai uses the internal REST API (`/api/bootstrap` → `/api/organizations` → `/api/chat_conversations/{uuid}`) for accurate token counts, with DOM fallback
- Token estimation formula: `words × 1.3` (BPE approximation, ±10% accuracy)
- MutationObserver with `childList` only (no `characterData`) — prevents keyboard input lag
- Debounce of 1,500ms on all token recalculations
- URL polling every 1s for SPA navigation detection
- `chrome.storage.local` used for popup ↔ content-script communication

---

## ⚠️ Known Limitations

- Token counts are **estimates** (~10% margin of error vs actual tokenizer)
- ChatGPT / Gemini / Groq DOM selectors may break after UI updates by the platform
- OpenAI and Anthropic do **not** publish exact daily quota limits — detection is banner-based
- Claude image tokens are not yet counted via the API (DOM fallback only)

---

## 📄 License

MIT — free to use, modify, and distribute.

<div align="center">
  <img src="icons/icon128.png" alt="Context Token Tracker Logo" width="96" />

  # ⚡ Context Token Tracker

  > A Chrome extension that tracks your AI token usage **in real-time** and alerts you **before** you hit context limits or daily quotas — on Claude.ai, ChatGPT, Gemini, and Groq.
</div>

---

## 🎬 Demo
https://private-user-images.githubusercontent.com/148994657/571830962-a707a309-6e7c-4200-8760-c2fccbe79758.mp4?jwt=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpc3MiOiJnaXRodWIuY29tIiwiYXVkIjoicmF3LmdpdGh1YnVzZXJjb250ZW50LmNvbSIsImtleSI6ImtleTUiLCJleHAiOjE3NzQ5NTM1MDcsIm5iZiI6MTc3NDk1MzIwNywicGF0aCI6Ii8xNDg5OTQ2NTcvNTcxODMwOTYyLWE3MDdhMzA5LTZlN2MtNDIwMC04NzYwLWMyZmNjYmU3OTc1OC5tcDQ_WC1BbXotQWxnb3JpdGhtPUFXUzQtSE1BQy1TSEEyNTYmWC1BbXotQ3JlZGVudGlhbD1BS0lBVkNPRFlMU0E1M1BRSzRaQSUyRjIwMjYwMzMxJTJGdXMtZWFzdC0xJTJGczMlMkZhd3M0X3JlcXVlc3QmWC1BbXotRGF0ZT0yMDI2MDMzMVQxMDMzMjdaJlgtQW16LUV4cGlyZXM9MzAwJlgtQW16LVNpZ25hdHVyZT03ZjQ3Y2VlMTc4ZmVmMjJmOTM0ZjFhMDUyZjhiMTJiZDQ1YTkyZDA4ZTZhNDdhOWM1YWRjNDA2ZWI0YWE3Mzk2JlgtQW16LVNpZ25lZEhlYWRlcnM9aG9zdCJ9.EDoeLgu0PhYB3qFyropp0ki5LBvtiXxuYPDH78dLp_c
> 📹 *Demo video coming soon — recorded with ZoomIt + ShareX*

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

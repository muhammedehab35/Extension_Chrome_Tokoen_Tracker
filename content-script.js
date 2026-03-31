// =============================================
// Context Token Tracker v3
// Progressive alarm before reaching context limit
// Works on: claude.ai, chatgpt.com, gemini.google.com, groq.com
// =============================================

// ── Alarm thresholds ─────────────────────────
const ALARM_THRESHOLDS = [
  { pct: 50, color: '#00ccff', msg: '50% of context used',               emoji: '🔵' },
  { pct: 70, color: '#ffaa00', msg: '70% reached — consider wrapping up', emoji: '🟡' },
  { pct: 85, color: '#ff6600', msg: '85% — only a little space left!',   emoji: '🟠' },
  { pct: 95, color: '#ff2222', msg: '95% — start a new conversation!',   emoji: '🔴' }
];

// ── Context limits by model ───────────────────
const MODEL_CONTEXT = {
  // Claude — source: support.anthropic.com (200K for UI, 1M is API only)
  'claude-opus-4-6':               200_000,
  'claude-sonnet-4-6':             200_000,
  'claude-haiku-4-5':              200_000,
  'claude-3-5-sonnet-20241022':    200_000,
  'claude-3-5-haiku-20241022':     200_000,
  'claude-3-opus-20240229':        200_000,
  'claude-3-sonnet-20240229':      200_000,
  'claude-3-haiku-20240307':       200_000,

  // ChatGPT — source : OpenAI docs
  'gpt-4o':                        128_000,
  'gpt-4':                         128_000,
  'gpt-4.1':                     1_000_000,

  // Gemini — source: support.google.com/gemini/answer/16275805
  'gemini-free':                    32_000,   // Basic/Free plan
  'gemini-plus':                   128_000,   // Plus plan
  'gemini-pro':                  1_000_000,   // Pro plan
  'gemini-ultra':                1_000_000,   // Ultra plan
  'gemini-default':                 32_000,

  // Groq — source : console.groq.com/docs/models
  'llama-3.3-70b-versatile':       131_072,
  'llama-3.1-8b-instant':          131_072,
  'openai/gpt-oss-120b':           131_072,
  'qwen/qwen3-32b':                131_072,
  'groq/compound':                 131_072,
  'groq-default':                  131_072,

  'default':                       128_000
};

// ── Pricing $/1M tokens ───────────────────────
const MODEL_PRICING = {
  // Claude
  'claude-opus-4-6':            { input:  5.00, output: 25.00 },
  'claude-sonnet-4-6':          { input:  3.00, output: 15.00 },
  'claude-haiku-4-5':           { input:  1.00, output:  5.00 },
  'claude-3-5-sonnet-20241022': { input:  3.00, output: 15.00 },
  'claude-3-5-haiku-20241022':  { input:  0.80, output:  4.00 },
  'claude-3-opus-20240229':     { input: 15.00, output: 75.00 },
  // ChatGPT
  'gpt-4o':                     { input:  2.50, output: 10.00 },
  'gpt-4':                      { input: 30.00, output: 60.00 },
  'gpt-4.1':                    { input:  2.00, output:  8.00 },
  // Gemini — source : ai.google.dev/gemini-api/docs/pricing
  'gemini-free':                { input:  0.00, output:  0.00 },
  'gemini-plus':                { input:  0.00, output:  0.00 }, // fixed subscription
  'gemini-pro':                 { input:  1.25, output:  5.00 },
  'gemini-ultra':               { input:  2.50, output: 10.00 },
  'gemini-default':             { input:  0.00, output:  0.00 },
  // Groq — free for dev plan
  'groq-default':               { input:  0.00, output:  0.00 },
  'llama-3.3-70b-versatile':    { input:  0.59, output:  0.79 },
  'llama-3.1-8b-instant':       { input:  0.05, output:  0.08 },
  'qwen/qwen3-32b':             { input:  0.29, output:  0.59 },
  'default':                    { input:  3.00, output: 15.00 }
};

// ── Token estimation (words × 1.3) ────────────
function estimateTokens(text) {
  if (!text || !text.trim()) return 0;
  return Math.ceil(text.trim().split(/\s+/).length * 1.3);
}

// ── File attachment token estimation ──────────
// Images cost vision tokens; documents are estimated from file size.
// Sources: platform.openai.com/docs/guides/vision, docs.anthropic.com/en/docs/build-with-claude/vision

// Vision tokens per image (conservative average per model family)
const VISION_TOKENS = {
  'gpt-4o': 1000,           // ~85 low-detail, up to ~2000 high-detail
  'claude': 1500,           // Claude charges ~1500 avg per image
  'gemini': 500,            // Gemini charges ~258 tokens per image (free)
  'groq':   800             // Groq Llama vision ~800 avg
};

// Detect file type from name/text
function detectFileType(text) {
  const t = (text || '').toLowerCase();
  if (t.match(/\.pdf/))                                    return 'pdf';
  if (t.match(/\.docx?|\.odt|\.rtf/))                     return 'doc';
  if (t.match(/\.xlsx?|\.csv|\.ods/))                      return 'spreadsheet';
  if (t.match(/\.png|\.jpe?g|\.gif|\.webp|\.bmp|\.svg/))  return 'image';
  if (t.match(/\.py|\.js|\.ts|\.jsx|\.tsx|\.java|\.c|\.cpp|\.cs|\.go|\.rs|\.rb|\.php/)) return 'code';
  if (t.match(/\.txt|\.md|\.log|\.yaml|\.yml|\.toml|\.ini|\.json|\.xml/)) return 'text';
  return 'unknown';
}

// Convert file size + type → estimated tokens
// Sources:
//   PDF:    ~1 page ≈ 250 words ≈ 325 tokens, ~1 page ≈ 100 KB  → bytes / 320
//   Scanned PDF (images): per-page vision tokens, ~1 page ≈ 500 KB → handled separately
//   DOC/DOCX: similar density to PDF but less binary overhead     → bytes / 200
//   Spreadsheet: cells are sparse text                           → bytes / 500
//   Code/Text: ~4 bytes per token (UTF-8 plain text)             → bytes / 4
function fileSizeToTokens(sizeText, fileType = 'unknown') {
  const m = sizeText && sizeText.match(/([\d.]+)\s*(B|KB|MB|GB)/i);
  let bytes = 0;
  if (m) {
    bytes = parseFloat(m[1]);
    const unit = m[2].toUpperCase();
    if      (unit === 'KB') bytes *= 1_024;
    else if (unit === 'MB') bytes *= 1_048_576;
    else if (unit === 'GB') bytes *= 1_073_741_824;
  }

  // Per-type estimation
  switch (fileType) {
    case 'pdf':         return bytes > 0 ? Math.ceil(bytes / 320)  : 3_000;  // ~10 pages default
    case 'doc':         return bytes > 0 ? Math.ceil(bytes / 200)  : 2_500;
    case 'spreadsheet': return bytes > 0 ? Math.ceil(bytes / 500)  : 1_500;
    case 'code':        return bytes > 0 ? Math.ceil(bytes / 4)    : 1_000;
    case 'text':        return bytes > 0 ? Math.ceil(bytes / 4)    : 1_000;
    default:            return bytes > 0 ? Math.ceil(bytes / 100)  : 2_000;  // conservative for unknowns
  }
}

// Detect uploaded files/images in the DOM and return extra token estimate
function estimateAttachmentTokens(modelFamily) {
  const visionCost = VISION_TOKENS[modelFamily] || 1000;
  let extra = 0;
  const seenSrcs   = new Set();
  const seenCards  = new Set();

  // ── Uploaded images ──────────────────────────
  document.querySelectorAll(
    'img[src^="blob:"], img[alt*="pload"], img[alt*="ttach"], ' +
    '[data-testid*="image-attachment"] img, [class*="attachment"] img, ' +
    '[class*="uploaded"] img, [class*="file-preview"] img'
  ).forEach(img => {
    if (img.closest('#tt-container')) return;
    const src = img.src || '';
    if (src && !seenSrcs.has(src)) {
      seenSrcs.add(src);
      extra += visionCost;
    }
  });

  // ── Uploaded documents (PDF, DOCX, TXT, code, spreadsheets…) ──
  // ChatGPT: file cards with filename + optional size
  // Gemini: file chips; Groq: similar
  const fileSelectors = [
    '[data-testid*="file-attachment"]',
    '[data-testid*="file"]',
    '[class*="FileAttachment"]',
    '[class*="file-attachment"]',
    '[class*="file-chip"]',
    '[class*="attachment-card"]',
    '[class*="uploaded-file"]',
    // aria-label selectors catch ChatGPT file buttons
    '[aria-label*=".pdf"]',
    '[aria-label*=".txt"]',
    '[aria-label*=".doc"]',
    '[aria-label*=".docx"]',
    '[aria-label*=".csv"]',
    '[aria-label*=".xlsx"]',
    '[aria-label*=".py"]',
    '[aria-label*=".js"]',
    '[aria-label*=".ts"]',
    '[aria-label*=".json"]',
    '[aria-label*=".xml"]',
    '[aria-label*=".md"]'
  ];

  document.querySelectorAll(fileSelectors.join(',')).forEach(card => {
    if (card.closest('#tt-container')) return;
    if (seenCards.has(card)) return;
    seenCards.add(card);

    const text     = card.innerText || card.getAttribute('aria-label') || '';
    const fileType = detectFileType(text);

    // Skip if already counted as image
    if (fileType === 'image') {
      extra += visionCost;
      return;
    }

    // Require a known file extension OR a file size to avoid false positives
    const hasExtension = /\.(pdf|docx?|xlsx?|csv|txt|md|json|xml|py|js|ts|jsx|tsx|java|go|rs|cpp|c|cs|rb|php|yaml|yml|log|rtf|odt)/i.test(text);
    const sizeMatch    = text.match(/([\d.]+\s*(?:B|KB|MB|GB))/i);
    if (!hasExtension && !sizeMatch) return; // skip — likely a false positive

    extra += fileSizeToTokens(sizeMatch ? sizeMatch[1] : null, fileType);
  });

  return extra;
}

// ── Model lookup helpers ──────────────────────
function getMaxTokens(model) {
  if (MODEL_CONTEXT[model]) return MODEL_CONTEXT[model];
  if (/^claude/.test(model))              return 200_000;  // all claude models = 200K UI
  if (/^gpt-4\.1/.test(model))           return 1_000_000;
  if (/^gpt/.test(model))                return 128_000;
  if (/^gemini-ultra/.test(model))       return 1_000_000;
  if (/^gemini-pro/.test(model))         return 1_000_000;
  if (/^gemini-plus/.test(model))        return 128_000;
  if (/^gemini/.test(model))             return 32_000;
  if (/^llama|^groq|^qwen|^openai\//.test(model)) return 131_072;
  return MODEL_CONTEXT.default;
}

function getPricing(model) {
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  if (/^claude-opus/.test(model))    return MODEL_PRICING['claude-opus-4-6'];
  if (/^claude-sonnet/.test(model))  return MODEL_PRICING['claude-sonnet-4-6'];
  if (/^claude-haiku/.test(model))   return MODEL_PRICING['claude-haiku-4-5'];
  if (/^claude/.test(model))         return MODEL_PRICING['claude-sonnet-4-6'];
  if (/^gpt-4\.1/.test(model))       return MODEL_PRICING['gpt-4.1'];
  if (/^gpt/.test(model))            return MODEL_PRICING['gpt-4o'];
  return MODEL_PRICING.default;
}

// ── Global state ─────────────────────────────
const hostname      = window.location.hostname;
let cachedOrgUUID   = null;
let lastAlertLevel  = -1;  // index of last triggered threshold
let lastURL         = location.href;
let debounceTimer   = null;

// Returns true only when inside an active conversation (not homepage/settings)
function isInConversation() {
  const path = location.pathname;
  if (hostname === 'claude.ai')                                     return /\/chat\/[a-f0-9-]{36}/.test(path);
  if (hostname === 'chatgpt.com' || hostname === 'chat.openai.com') return /^\/c\//.test(path);
  if (hostname === 'gemini.google.com')                             return path.includes('/app');
  if (hostname === 'groq.com')                                      return path.includes('/chat');
  return true;
}

// =============================================
// CLAUDE.AI — Fetch via internal API
// =============================================

async function getOrgUUID() {
  if (cachedOrgUUID) return cachedOrgUUID;
  // Attempt 1: bootstrap
  try {
    const r = await fetch('https://claude.ai/api/bootstrap', { credentials: 'include' });
    if (r.ok) {
      const d = await r.json();
      const uuid = d?.account?.memberships?.[0]?.organization?.uuid;
      if (uuid) { cachedOrgUUID = uuid; return uuid; }
    }
  } catch (_) {}
  // Attempt 2: organizations list
  try {
    const r = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
    if (r.ok) {
      const d = await r.json();
      const uuid = Array.isArray(d) ? d[0]?.uuid : d?.uuid;
      if (uuid) { cachedOrgUUID = uuid; return uuid; }
    }
  } catch (_) {}
  return null;
}

function getConvUUID() {
  const m = location.pathname.match(/\/chat\/([a-f0-9-]{36})/);
  return m ? m[1] : null;
}

async function fetchClaudeTokens() {
  const convUUID = getConvUUID();
  if (!convUUID) return { tokens: 0, model: 'claude-sonnet-4-6' };

  const orgUUID = await getOrgUUID();
  if (!orgUUID) return { tokens: 0, model: 'claude-sonnet-4-6' };

  try {
    const r = await fetch(
      `https://claude.ai/api/organizations/${orgUUID}/chat_conversations/${convUUID}` +
      `?tree=True&rendering_mode=messages&render_all_tools=true`,
      { credentials: 'include' }
    );
    if (!r.ok) return { tokens: 0, model: 'claude-sonnet-4-6' };

    const data = await r.json();
    const model = data.model || 'claude-sonnet-4-6';

    let totalText  = '';
    let imgTokens  = 0;  // vision tokens for uploaded images

    for (const msg of (data.chat_messages || [])) {
      for (const block of (msg.content || [])) {
        if (block.type === 'text')     totalText += ' ' + (block.text     || '');
        if (block.type === 'thinking') totalText += ' ' + (block.thinking || '');
        if (block.type === 'image')    imgTokens += 1500; // Claude charges ~1500 tokens per image
      }
      if (msg.text) totalText += ' ' + msg.text;
      for (const att of (msg.attachments || [])) {
        if (att.extracted_content) totalText += ' ' + att.extracted_content;
        // Attachments that are images (no extracted text = vision token cost)
        if (att.file_type && /image/i.test(att.file_type) && !att.extracted_content) imgTokens += 1500;
      }
      // Files array (newer Claude API format)
      for (const f of (msg.files || [])) {
        if (f.media_type && /image/i.test(f.media_type)) imgTokens += 1500;
        else if (f.extracted_content) totalText += ' ' + f.extracted_content;
      }
    }

    return { tokens: estimateTokens(totalText) + imgTokens, model };
  } catch (e) {
    // Fallback DOM if API fails
    return fetchClaudeFallbackDOM();
  }
}

function fetchClaudeFallbackDOM() {
  // Fallback DOM selectors for claude.ai
  const selectors = [
    '[data-testid="human-turn"]',
    '[data-testid="ai-turn"]',
    '.font-claude-message',
    '[class*="Message_message"]',
    'div[class*="message-content"]',
    'main'
  ];
  let text = '';
  for (const sel of selectors) {
    const els = document.querySelectorAll(sel);
    if (els.length > 0) {
      els.forEach(el => {
        if (el.id !== 'tt-container') text += ' ' + (el.innerText || '');
      });
      if (text.trim().length > 20) break;
    }
  }
  return { tokens: estimateTokens(text), model: 'claude-sonnet-4-6' };
}

// =============================================
// GEMINI — Fetch via DOM
// Limits source: support.google.com/gemini/answer/16275805
// =============================================

function detectGeminiPlan() {
  const text = document.body.innerText.toLowerCase();
  if (text.includes('ultra'))   return 'gemini-ultra';
  if (text.includes('ai pro'))  return 'gemini-pro';
  if (text.includes('ai plus')) return 'gemini-plus';
  return 'gemini-free';
}

function fetchGeminiTokens() {
  const mainArea =
    document.querySelector('chat-window') ||
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.body;

  const selectors = [
    'model-response',
    '[data-message-id]',
    '.conversation-container',
    'message-content',
    '.response-container'
  ];
  let text = '';
  for (const sel of selectors) {
    const els = mainArea.querySelectorAll(sel);
    if (els.length > 0) {
      els.forEach(el => {
        if (el.closest('nav') || el.id === 'tt-container') return;
        text += ' ' + (el.innerText || '');
      });
      if (text.trim().length > 20) break;
    }
  }
  const model      = detectGeminiPlan();
  const textTokens = estimateTokens(text);
  const fileTokens = estimateAttachmentTokens('gemini');
  return { tokens: textTokens + fileTokens, model, fileTokens };
}

// =============================================
// GROQ — Fetch via DOM
// Limits source: console.groq.com/docs/models
// =============================================

function detectGroqModel() {
  const text = document.body.innerText.toLowerCase();
  // Find the selected model in the Groq UI
  if (text.includes('llama-3.3-70b'))    return 'llama-3.3-70b-versatile';
  if (text.includes('llama-3.1-8b'))     return 'llama-3.1-8b-instant';
  if (text.includes('qwen3-32b'))        return 'qwen/qwen3-32b';
  if (text.includes('gpt-oss-120b'))     return 'openai/gpt-oss-120b';
  if (text.includes('compound'))         return 'groq/compound';
  return 'groq-default';
}

function fetchGroqTokens() {
  const mainArea =
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('[role="log"]') ||
    document.body;

  const selectors = [
    '[role="log"]',
    '[class*="chat-message"]',
    '[class*="message-content"]'
  ];
  let text = '';
  for (const sel of selectors) {
    const els = mainArea.querySelectorAll(sel);
    if (els.length > 0) {
      els.forEach(el => {
        if (el.closest('nav') || el.id === 'tt-container') return;
        text += ' ' + (el.innerText || '');
      });
      if (text.trim().length > 20) break;
    }
  }
  const model      = detectGroqModel();
  const textTokens = estimateTokens(text);
  const fileTokens = estimateAttachmentTokens('groq');
  return { tokens: textTokens + fileTokens, model, fileTokens };
}

// =============================================
// CHATGPT — Fetch via DOM
// =============================================

function fetchChatGPTTokens() {
  // Scope to the main chat area only — excludes sidebar conversation history
  const mainArea =
    document.querySelector('main') ||
    document.querySelector('[role="main"]') ||
    document.querySelector('[class*="conversation"]') ||
    document.body;

  // Only collect actual message turn articles (most specific first)
  const turns = mainArea.querySelectorAll('article[data-testid^="conversation-turn"]');
  if (turns.length > 0) {
    let text = '';
    turns.forEach(el => { text += ' ' + (el.innerText || ''); });
    const textTokens = estimateTokens(text);
    const fileTokens = estimateAttachmentTokens('gpt-4o');
    return { tokens: textTokens + fileTokens, model: 'gpt-4o', fileTokens };
  }

  // Fallback: individual message content divs (scoped to main area)
  const msgSelectors = [
    '[data-message-author-role]',
    'div.markdown',
    '[class*="prose"]'
  ];
  for (const sel of msgSelectors) {
    const els = mainArea.querySelectorAll(sel);
    if (els.length > 0) {
      let text = '';
      els.forEach(el => {
        // Skip elements that are inside the sidebar or navigation
        if (el.closest('nav') || el.closest('[class*="sidebar"]') || el.closest('[class*="history"]')) return;
        if (el.id === 'tt-container') return;
        text += ' ' + (el.innerText || '');
      });
      if (text.trim().length > 20) {
        const textTokens = estimateTokens(text);
        const fileTokens = estimateAttachmentTokens('gpt-4o');
        return { tokens: textTokens + fileTokens, model: 'gpt-4o', fileTokens };
      }
    }
  }

  return { tokens: 0, model: 'gpt-4o', fileTokens: 0 };
}

// =============================================
// FLOATING BAR
// =============================================

function createBar() {
  if (document.getElementById('tt-container')) return;

  const style = document.createElement('style');
  style.textContent = `
    #tt-container {
      position: fixed !important; bottom: 24px !important; right: 24px !important;
      width: 270px !important; background: #0d0d1f !important;
      border: 1px solid #2a2a50 !important; border-radius: 14px !important;
      padding: 13px 15px !important; z-index: 2147483647 !important;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', monospace !important;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6) !important; font-size: 12px !important;
      user-select: none !important; cursor: move !important;
      transition: border-color 0.4s, box-shadow 0.4s !important;
    }
    #tt-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:9px; }
    #tt-label  { font-size:10px; font-weight:700; letter-spacing:1.5px; color:#6060dd; }
    #tt-badge  { font-size:14px; font-weight:800; color:#00ff88; transition:color 0.4s; }
    #tt-bg     { background:#1a1a35; border-radius:8px; height:10px; overflow:hidden; margin-bottom:9px; }
    #tt-fill   { height:100%; width:0%; background:linear-gradient(90deg,#00ff88,#00ccff);
                 border-radius:8px; transition:width 0.7s ease, background 0.4s; }
    #tt-row    { display:flex; justify-content:space-between; font-size:11px; margin-bottom:5px; }
    #tt-used   { color:#d0d0ff; font-weight:600; }
    #tt-max    { color:#44446a; }
    #tt-sub    { display:flex; justify-content:space-between; font-size:10px; }
    #tt-model  { color:#55558a; font-style:italic; }
    #tt-cost   { color:#7799ff; }
    .tt-alarm  {
      position:fixed; top:18px; right:18px; border-radius:12px; padding:14px 20px;
      z-index:2147483647; font-family:-apple-system,sans-serif; max-width:310px;
      font-size:13px; font-weight:700; line-height:1.5; color:#fff;
      box-shadow:0 8px 30px rgba(0,0,0,0.5);
      animation: ttSlide 0.35s cubic-bezier(.22,.68,0,1.2);
    }
    @keyframes ttSlide {
      from { transform: translateX(140px) scale(0.9); opacity:0; }
      to   { transform: translateX(0) scale(1);       opacity:1; }
    }
  `;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.id = 'tt-container';
  el.innerHTML = `
    <div id="tt-header">
      <span id="tt-label">⚡ TOKEN TRACKER</span>
      <span id="tt-badge">—</span>
    </div>
    <div id="tt-bg"><div id="tt-fill"></div></div>
    <div id="tt-row">
      <span id="tt-used">loading...</span>
      <span id="tt-max">—</span>
    </div>
    <div id="tt-sub">
      <span id="tt-model">—</span>
      <span id="tt-cost">—</span>
    </div>
  `;
  document.body.appendChild(el);
  makeDraggable(el);
}

// =============================================
// BAR UPDATE + ALARMS
// =============================================

function updateBar(tokens, model, fileTokens = 0) {
  const fill  = document.getElementById('tt-fill');
  const badge = document.getElementById('tt-badge');
  const used  = document.getElementById('tt-used');
  const max   = document.getElementById('tt-max');
  const mod   = document.getElementById('tt-model');
  const cost  = document.getElementById('tt-cost');
  const bar   = document.getElementById('tt-container');
  if (!fill) return;

  // ── Idle state: homepage / not in a conversation ──
  if (!isInConversation()) {
    fill.style.width  = '0%';
    badge.textContent = '—';
    badge.style.color = '#6060dd';
    used.textContent  = 'Start a chat';
    max.textContent   = '';
    mod.textContent   = hostname;
    cost.textContent  = '';
    bar.style.borderColor = '#2a2a50';
    bar.style.boxShadow   = '0 8px 32px rgba(0,0,0,0.6)';
    return;
  }

  const maxTok  = getMaxTokens(model);
  const pricing = getPricing(model);
  const pct     = Math.min((tokens / maxTok) * 100, 100);
  const estCost = (tokens / 1_000_000) * pricing.input;

  // ── Visual update ──
  fill.style.width      = `${pct}%`;
  badge.textContent     = `${Math.round(pct)}%`;
  used.textContent      = tokens.toLocaleString('en-US') + ' tk';
  max.textContent       = '/ ' + maxTok.toLocaleString('en-US');
  mod.textContent       = model !== 'default' ? model : '—';
  cost.textContent      = '$' + estCost.toFixed(6);

  // ── File attachment indicator ──
  let fileRow = document.getElementById('tt-file-row');
  if (fileTokens > 0) {
    if (!fileRow) {
      fileRow = document.createElement('div');
      fileRow.id = 'tt-file-row';
      fileRow.style.cssText = 'font-size:10px;color:#7799ff;margin-top:3px;opacity:0.85;';
      document.getElementById('tt-sub')?.after(fileRow);
    }
    fileRow.textContent = `📎 +${fileTokens.toLocaleString('en-US')} tk from files (est.)`;
  } else if (fileRow) {
    fileRow.remove();
  }

  // ── Color by threshold ──
  if (pct >= 85) {
    fill.style.background = 'linear-gradient(90deg,#ff2222,#ff0000)';
    badge.style.color = '#ff4444';
    bar.style.borderColor = '#ff2222';
    bar.style.boxShadow   = '0 8px 32px rgba(255,30,0,0.3)';
  } else if (pct >= 70) {
    fill.style.background = 'linear-gradient(90deg,#ffaa00,#ff6600)';
    badge.style.color = '#ffaa00';
    bar.style.borderColor = '#ff8800';
    bar.style.boxShadow   = '0 8px 32px rgba(255,150,0,0.25)';
  } else if (pct >= 50) {
    fill.style.background = 'linear-gradient(90deg,#00aaff,#00ccff)';
    badge.style.color = '#00ccff';
    bar.style.borderColor = '#2a2a50';
    bar.style.boxShadow   = '0 8px 32px rgba(0,0,0,0.6)';
  } else {
    fill.style.background = 'linear-gradient(90deg,#00ff88,#00ccff)';
    badge.style.color = '#00ff88';
    bar.style.borderColor = '#2a2a50';
    bar.style.boxShadow   = '0 8px 32px rgba(0,0,0,0.6)';
  }

  // ── Progressive alarms ──
  triggerAlarms(pct, model, maxTok, tokens);

  // ── Save for popup ──
  try {
    if (chrome.runtime?.id) {
      chrome.storage.local.set({
        tokens, percent: Math.round(pct), maxTokens: maxTok,
        cost: estCost.toFixed(6), model, hostname,
        msgCount: gptMessageCount,
        lastUpdate: new Date().toLocaleTimeString('en-US')
      });
    }
  } catch (e) {
    if (window.__ttObserver) window.__ttObserver.disconnect();
  }
}

// ── Progressive alarm system ──────────────────
function triggerAlarms(pct, model, maxTok, tokens) {
  // Find current threshold reached
  let currentLevel = -1;
  for (let i = 0; i < ALARM_THRESHOLDS.length; i++) {
    if (pct >= ALARM_THRESHOLDS[i].pct) currentLevel = i;
  }

  // Trigger only when crossing a new threshold
  if (currentLevel > lastAlertLevel) {
    lastAlertLevel = currentLevel;
    const threshold = ALARM_THRESHOLDS[currentLevel];
    showAlarm(threshold, tokens, maxTok, model);
  }

  // Reset when a new conversation starts (tokens drop)
  if (pct < ALARM_THRESHOLDS[0].pct - 5) {
    lastAlertLevel = -1;
  }
}

function showAlarm(threshold, tokens, maxTok, model) {
  // Remove existing alarm if present
  const old = document.querySelector('.tt-alarm');
  if (old) old.remove();

  const remaining = maxTok - tokens;

  const div = document.createElement('div');
  div.className = 'tt-alarm';
  div.style.background = `linear-gradient(135deg, ${threshold.color}cc, ${threshold.color}88)`;
  div.style.border      = `1px solid ${threshold.color}`;
  div.innerHTML = `
    <div style="font-size:15px;margin-bottom:4px">${threshold.emoji} ${threshold.msg}</div>
    <div style="font-weight:400;font-size:11px;opacity:0.85">
      ${tokens.toLocaleString('en-US')} / ${maxTok.toLocaleString('en-US')} tokens
      &nbsp;·&nbsp; ~${remaining.toLocaleString('en-US')} remaining
      &nbsp;·&nbsp; ${model}
    </div>
  `;
  document.body.appendChild(div);

  // Display duration based on urgency
  const duration = threshold.pct >= 85 ? 8000 : 5000;
  setTimeout(() => div?.remove(), duration);
}

// =============================================
// DRAGGABLE
// =============================================

function makeDraggable(el) {
  let ox=0, oy=0;
  el.onmousedown = (e) => {
    e.preventDefault();
    ox=e.clientX; oy=e.clientY;
    document.onmouseup   = () => { document.onmouseup=null; document.onmousemove=null; };
    document.onmousemove = (e2) => {
      const dx=ox-e2.clientX, dy=oy-e2.clientY;
      ox=e2.clientX; oy=e2.clientY;
      el.style.top   = (el.offsetTop -dy)+'px';
      el.style.left  = (el.offsetLeft-dx)+'px';
      el.style.bottom='unset'; el.style.right='unset';
    };
  };
}

// =============================================
// CHATGPT — FREE QUOTA DETECTION
// =============================================

// ChatGPT "limit reached" banner keywords (multi-language)
// NOTE: keep these specific — avoid single words like "upgrade" or "reset"
// that appear in normal UI navigation and cause false positives.
const QUOTA_KEYWORDS = [
  'limite d\'envoi',
  'message limit reached',
  'reached your limit',
  'you\'ve reached your',
  'free plan limit',
  'less capable model',
  'modèle moins performant',
  'you\'ve hit the limit',
  'temporarily unavailable'
];

// ── Message limits by plan ────────────────────
// Source: help.openai.com + support.anthropic.com
// IMPORTANT: OpenAI and Anthropic do NOT publish exact figures.
// Limits are dynamic based on server load.
// These values are community estimates, not official.
const GPT_PLAN_LIMITS = {
  free: {
    label:      'Free',
    msgLimit:   null,         // not officially published
    windowTxt:  'dynamic'
  },
  plus: {
    label:      'Plus',
    msgLimit:   null,         // not officially published
    windowTxt:  'dynamic'
  },
  pro: {
    label:      'Pro',
    msgLimit:   null,
    windowTxt:  'dynamic'
  }
};

let gptMessageCount  = 0;
let quotaAlertShown  = false;
let limitBannerShown = false;
let detectedPlan     = 'free'; // default: free

// ── Detect Free or Plus plan ──────────────────
function detectGPTPlan() {
  const text = document.body.innerText.toLowerCase();
  const html = document.body.innerHTML.toLowerCase();

  // "Mettre à niveau" / "Upgrade" button visible = user is on FREE (being offered upgrade)
  const isBeingOfferedUpgrade =
    text.includes('obtenir plus') ||
    text.includes('get plus') ||
    text.includes('upgrade to plus') ||
    text.includes('passer à plus') ||
    text.includes('mettre à niveau');  // French upgrade button on ChatGPT

  if (isBeingOfferedUpgrade) {
    // Clear any stale stored plan
    try { if (chrome.runtime?.id) chrome.storage.local.remove('userPlan'); } catch(_) {}
    return 'free';
  }

  // Indicators that user ALREADY has Plus/Pro
  const hasPlus =
    html.includes('chatgpt plus') ||
    html.includes('plus plan') ||
    html.includes('team plan') ||
    html.includes('enterprise') ||
    text.includes('your plus subscription') ||
    text.includes('votre abonnement plus');

  return hasPlus ? 'plus' : 'free';
}

// ── Count user messages ───────────────────────
function countUserMessages() {
  const msgs = document.querySelectorAll('[data-message-author-role="user"]');
  return msgs.length;
}

// ── Detect "limit reached" banner ─────────────
function detectQuotaBanner() {
  const allText = document.body.innerText.toLowerCase();
  return QUOTA_KEYWORDS.some(kw => allText.includes(kw.toLowerCase()));
}

// ── Update bar with message quota ─────────────
function updateQuotaBar(msgCount, plan) {
  const limits = GPT_PLAN_LIMITS[plan];
  // msgLimit is null (not publicly disclosed) — show count only, no percentage
  const hasLimit = limits.msgLimit !== null;
  const pct      = hasLimit ? Math.min((msgCount / limits.msgLimit) * 100, 100) : 0;
  const remain   = hasLimit ? Math.max(limits.msgLimit - msgCount, 0) : null;

  // Add quota row to bar if it doesn't exist yet
  let quotaRow = document.getElementById('tt-quota-row');
  if (!quotaRow) {
    const bar = document.getElementById('tt-container');
    if (!bar) return;
    quotaRow = document.createElement('div');
    quotaRow.id = 'tt-quota-row';
    quotaRow.style.cssText = 'border-top:1px solid #1e1e3a;margin-top:8px;padding-top:8px;';
    quotaRow.innerHTML = `
      <div style="display:flex;justify-content:space-between;font-size:10px;margin-bottom:5px;">
        <span style="color:#6060dd;font-weight:700;letter-spacing:1px">QUOTA MESSAGES</span>
        <span id="tt-plan-badge" style="color:#aaa;font-size:9px"></span>
      </div>
      <div style="background:#1a1a35;border-radius:6px;height:6px;overflow:hidden;margin-bottom:5px">
        <div id="tt-quota-fill" style="height:100%;width:0%;background:linear-gradient(90deg,#aa44ff,#ff44aa);border-radius:6px;transition:width 0.6s ease"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:10px;">
        <span id="tt-msg-count" style="color:#d0d0ff;font-weight:600"></span>
        <span id="tt-msg-remain" style="color:#55558a"></span>
      </div>
    `;
    bar.appendChild(quotaRow);
  }

  document.getElementById('tt-plan-badge').textContent  = `Plan ${limits.label} · ${limits.windowTxt}`;
  document.getElementById('tt-msg-count').textContent   = `${msgCount} messages sent`;
  document.getElementById('tt-msg-remain').textContent  = remain !== null ? `${remain} remaining` : 'limit not disclosed';

  const fill = document.getElementById('tt-quota-fill');
  if (fill) {
    fill.style.width = `${pct}%`;
    if (!hasLimit) {
      // No known limit — show a neutral color proportional to message count (soft visual only)
      const softPct = Math.min(msgCount * 2, 100); // just a visual indicator
      fill.style.width = `${softPct}%`;
      fill.style.background = 'linear-gradient(90deg,#aa44ff,#ff44aa)';
    } else if (pct >= 80) {
      fill.style.background = 'linear-gradient(90deg,#ff2222,#ff0000)';
    } else if (pct >= 60) {
      fill.style.background = 'linear-gradient(90deg,#ffaa00,#ff6600)';
    } else {
      fill.style.background = 'linear-gradient(90deg,#aa44ff,#ff44aa)';
    }
  }
}

// Show Free quota alarm
function showQuotaAlarm(type) {
  const old = document.getElementById('tt-quota-alarm');
  if (old) return; // already shown

  const div = document.createElement('div');
  div.id = 'tt-quota-alarm';
  div.className = 'tt-alarm';

  if (type === 'banner') {
    // Quota already reached — detected from ChatGPT banner
    div.style.background = 'linear-gradient(135deg, #cc0000cc, #ff000088)';
    div.style.border = '1px solid #ff2222';
    div.innerHTML = `
      <div style="font-size:15px;margin-bottom:4px">🔴 GPT-4o Free Quota Reached!</div>
      <div style="font-weight:400;font-size:11px;opacity:0.85">
        ChatGPT will switch to a less capable model.<br>
        Wait for the reset or upgrade to ChatGPT Plus.
      </div>
    `;
    // Persistent — does not auto-dismiss
    div.style.cursor = 'pointer';
    div.title = 'Click to close';
    div.onclick = () => div.remove();
  } else {
    // Preemptive warning (approaching limit)
    div.style.background = 'linear-gradient(135deg, #ff6600cc, #ffaa0088)';
    div.style.border = '1px solid #ff8800';
    div.innerHTML = `
      <div style="font-size:15px;margin-bottom:4px">🟠 Warning — GPT-4o Free Quota</div>
      <div style="font-weight:400;font-size:11px;opacity:0.85">
        You are approaching the GPT-4o free message limit.<br>
        ${gptMessageCount} messages sent this session.
      </div>
    `;
    setTimeout(() => div?.remove(), 7000);
  }

  document.body.appendChild(div);
}

// Extract reset time from ChatGPT banner
// Ex: "réinitialisation après 07:51" → "07:51"
function extractResetTime() {
  const text = document.body.innerText;
  const match = text.match(/après\s+(\d{1,2}:\d{2})/i)
             || text.match(/resets?\s+(?:at|after|in)\s+([\d:apm\s]+)/i)
             || text.match(/(\d{1,2}:\d{2})/);
  return match ? match[1] : null;
}

// Show Free quota alarm
function showQuotaAlarm(type) {
  const old = document.getElementById('tt-quota-alarm');
  if (old) return;

  const div = document.createElement('div');
  div.id = 'tt-quota-alarm';
  div.className = 'tt-alarm';

  if (type === 'banner') {
    const resetTime = extractResetTime();
    const resetInfo = resetTime ? `Resets at <strong>${resetTime}</strong>` : 'Wait for the reset';
    div.style.background = 'linear-gradient(135deg, #cc0000cc, #ff000088)';
    div.style.border = '1px solid #ff2222';
    div.innerHTML = `
      <div style="font-size:15px;margin-bottom:6px">🔴 GPT-4o Free Quota Exhausted!</div>
      <div style="font-weight:400;font-size:11px;opacity:0.9;line-height:1.6">
        ChatGPT is switching to a less capable model.<br>
        ${resetInfo} — or upgrade to ChatGPT Plus.
      </div>
      <div style="font-size:10px;margin-top:6px;opacity:0.6;cursor:pointer" onclick="this.parentElement.remove()">
        ✕ close
      </div>
    `;
    // Persistent
    div.onclick = (e) => { if (e.target.tagName !== 'DIV') return; };
  } else {
    // Preemptive warning
    const limits = GPT_PLAN_LIMITS[detectedPlan];
    div.style.background = 'linear-gradient(135deg, #ff6600cc, #ffaa0088)';
    div.style.border = '1px solid #ff8800';
    div.innerHTML = `
      <div style="font-size:15px;margin-bottom:6px">🟠 ChatGPT ${limits.label} Quota Warning!</div>
      <div style="font-weight:400;font-size:11px;opacity:0.9;line-height:1.6">
        <strong>${gptMessageCount} / ${limits.msgLimit ?? 'dynamic'} messages</strong> used ${limits.windowTxt}.<br>
        You are approaching the limit — ChatGPT will block you soon.
      </div>
    `;
    setTimeout(() => div?.remove(), 8000);
  }

  document.body.appendChild(div);
}

// Watch ChatGPT quota (Free + Plus)
function watchChatGPTQuota() {
  if (hostname !== 'chatgpt.com' && hostname !== 'chat.openai.com') return;

  setInterval(() => {
    // Skip on homepage / non-conversation pages
    if (!isInConversation()) return;
    // Detect plan
    detectedPlan = detectGPTPlan();

    // Detect "limit reached" banner
    if (!limitBannerShown && detectQuotaBanner()) {
      limitBannerShown = true;
      showQuotaAlarm('banner');
      const badge = document.getElementById('tt-badge');
      const bar   = document.getElementById('tt-container');
      if (badge) { badge.textContent = '⛔'; badge.style.color = '#ff2222'; }
      if (bar)   { bar.style.borderColor = '#ff0000'; bar.style.boxShadow = '0 8px 32px rgba(255,0,0,0.4)'; }
    }

    // Count messages and update quota bar
    const msgCount = countUserMessages();
    if (msgCount !== gptMessageCount) {
      gptMessageCount = msgCount;
      updateQuotaBar(msgCount, detectedPlan);

      // No fixed alarm threshold — alert only when banner appears
      // OpenAI limits are dynamic and not officially published
    }

    // Refresh quota bar even without new messages (plan may change)
    updateQuotaBar(gptMessageCount, detectedPlan);
  }, 2000);
}

// =============================================
// CLAUDE.AI — QUOTA / BLOCK DETECTION
// =============================================

// NOTE: avoid generic words like "mettre à niveau" / "upgrade" — they appear
// on the homepage nav and would trigger false alarms.
const CLAUDE_BLOCK_KEYWORDS = [
  // French — only specific error phrases
  'limite d\'utilisation',
  'limite atteinte',
  'vous avez atteint',
  'passer à claude pro',
  // English — only specific error phrases
  'you\'ve reached your',
  'free usage limit',
  'message limit reached',
  'too many messages',
  'plan limit reached',
  'usage limit reached'
];

let claudeBlockDetected = false;
let claudeMsgCount      = 0;
let claudeQuotaShown    = false;

function countClaudeMessages() {
  // Count human messages in the conversation
  const msgs = document.querySelectorAll(
    '[data-testid="human-turn"], [class*="human-turn"], [class*="HumanTurn"]'
  );
  // Fallback: count via API (already fetched)
  return msgs.length;
}

function detectClaudeBlock() {
  const text = document.body.innerText.toLowerCase();
  return CLAUDE_BLOCK_KEYWORDS.some(kw => text.includes(kw.toLowerCase()));
}

function showClaudeBlockAlarm(type) {
  const id = 'tt-claude-alarm';
  if (document.getElementById(id)) return;

  const div = document.createElement('div');
  div.id = id;
  div.className = 'tt-alarm';

  if (type === 'blocked') {
    div.style.background = 'linear-gradient(135deg, #cc0000cc, #ff000088)';
    div.style.border = '1px solid #ff2222';
    div.innerHTML = `
      <div style="font-size:15px;margin-bottom:6px">🔴 Claude Free limit reached!</div>
      <div style="font-weight:400;font-size:11px;opacity:0.9;line-height:1.6">
        Claude has blocked sending messages.<br>
        Upgrade to Claude Pro or wait for the reset.
      </div>
      <div style="font-size:10px;margin-top:6px;opacity:0.6;cursor:pointer"
           onclick="document.getElementById('${id}').remove()">✕ close</div>
    `;
    // Update the bar
    const badge = document.getElementById('tt-badge');
    const bar   = document.getElementById('tt-container');
    if (badge) { badge.textContent = '⛔'; badge.style.color = '#ff2222'; }
    if (bar)   { bar.style.borderColor = '#ff0000'; bar.style.boxShadow = '0 8px 32px rgba(255,0,0,0.4)'; }
  } else {
    div.style.background = 'linear-gradient(135deg, #ff6600cc, #ffaa0088)';
    div.style.border = '1px solid #ff8800';
    div.innerHTML = `
      <div style="font-size:15px;margin-bottom:6px">🟠 Claude Free quota — warning</div>
      <div style="font-weight:400;font-size:11px;opacity:0.9;line-height:1.6">
        <strong>${claudeMsgCount} messages</strong> sent this session.<br>
        You may be approaching the Free plan limit.
      </div>
    `;
    setTimeout(() => div?.remove(), 7000);
  }

  document.body.appendChild(div);
}

function watchClaudeQuota() {
  if (hostname !== 'claude.ai') return;

  setInterval(() => {
    // Only watch when inside an actual conversation (not the homepage)
    if (!getConvUUID()) return;

    // Detect blocking message in the DOM
    if (!claudeBlockDetected && detectClaudeBlock()) {
      claudeBlockDetected = true;
      showClaudeBlockAlarm('blocked');
    }

    // Preventive warning based on message count
    const msgCount = countClaudeMessages();
    if (msgCount !== claudeMsgCount) {
      claudeMsgCount = msgCount;
      // Warn at 8 messages on Claude Free (~10-15 depending on plan)
      if (msgCount >= 8 && !claudeQuotaShown) {
        claudeQuotaShown = true;
        showClaudeBlockAlarm('warning');
      }
    }
  }, 2000);
}

// =============================================
// MAIN LOOP
// =============================================

async function run() {
  // Don't count tokens on homepage / settings pages
  if (!isInConversation()) {
    updateBar(0, 'default', 0);
    return;
  }

  let result;
  if (hostname === 'claude.ai') {
    result = await fetchClaudeTokens();
  } else if (hostname === 'gemini.google.com') {
    result = fetchGeminiTokens();
  } else if (hostname === 'groq.com') {
    result = fetchGroqTokens();
  } else {
    result = fetchChatGPTTokens();
  }
  updateBar(result.tokens, result.model, result.fileTokens || 0);
}

function debouncedRun() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(run, 1500);
}

// Detect SPA navigation
function watchURL() {
  setInterval(() => {
    if (location.href !== lastURL) {
      lastURL = location.href;
      cachedOrgUUID = null;
      lastAlertLevel = -1;
      setTimeout(run, 1500);
    }
  }, 1000);
}

// =============================================
// INITIALIZATION
// =============================================

function init() {
  createBar();
  run();
  watchURL();
  if (hostname === 'chatgpt.com' || hostname === 'chat.openai.com') watchChatGPTQuota();
  if (hostname === 'claude.ai') watchClaudeQuota();

  const observer = new MutationObserver((mutations) => {
    if (mutations.some(m => m.addedNodes.length > 0)) debouncedRun();
  });
  window.__ttObserver = observer;
  observer.observe(document.body, { childList: true, subtree: true });
}

// Listen for plan changes from the popup
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'setPlan') {
    detectedPlan    = msg.plan;
    quotaAlertShown = false;
    updateQuotaBar(gptMessageCount, detectedPlan);
  }
});

// Load saved plan on startup
chrome.storage.local.get(['userPlan'], (data) => {
  if (data.userPlan) detectedPlan = data.userPlan;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(init, 2000));
} else {
  setTimeout(init, 2000);
}

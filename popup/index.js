// =============================================
// Context Token Tracker — Popup Script
// =============================================

const CIRCUMFERENCE = 2 * Math.PI * 50; // r=50 → 314.16

// Note: OpenAI and Anthropic do NOT publish exact message limits.
// Limits are dynamic and vary based on server conditions.
const PLAN_CONFIG = {
  free: { label: 'Free', msgLimit: null, windowTxt: 'dynamic', btnClass: 'active-free' },
  plus: { label: 'Plus', msgLimit: null, windowTxt: 'dynamic', btnClass: 'active-plus' },
  pro:  { label: 'Pro',  msgLimit: null, windowTxt: 'dynamic', btnClass: 'active-pro'  }
};

function setColor(pct) {
  if (pct >= 90) return { stroke: '#ff4444', bar: 'linear-gradient(90deg,#ff2222,#ff0000)', text: '#ff4444' };
  if (pct >= 70) return { stroke: '#ffaa00', bar: 'linear-gradient(90deg,#ffaa00,#ff6600)', text: '#ffaa00' };
  return           { stroke: '#00ff88', bar: 'linear-gradient(90deg,#00ff88,#00ccff)', text: '#00ff88' };
}

function formatNum(n) {
  return Number(n).toLocaleString('en-US');
}

// ── Plan selector ────────────────────────────
function setPlan(plan) {
  chrome.storage.local.set({ userPlan: plan }, () => {
    updatePlanUI(plan);
    // Send to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'setPlan', plan }).catch(() => {});
      }
    });
  });
}

function updatePlanUI(plan) {
  ['free', 'plus', 'pro'].forEach(p => {
    const btn = document.getElementById('btn-' + p);
    if (btn) btn.className = 'plan-btn' + (p === plan ? ' ' + PLAN_CONFIG[p].btnClass : '');
  });
}

// ── Main render ──────────────────────────────
function render(data) {
  const pct      = data.percent    || 0;
  const tokens   = data.tokens     || 0;
  const maxTok   = data.maxTokens  || 200000;
  const cost     = data.cost       || '0.000000';
  const site     = data.hostname   || '—';
  const updated  = data.lastUpdate || '—';
  const msgCount = data.msgCount   || 0;
  const plan     = data.userPlan   || 'free';

  const colors = setColor(pct);

  // Ring
  const ring = document.getElementById('ring-fill');
  if (ring) {
    ring.style.strokeDashoffset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
    ring.style.stroke = colors.stroke;
  }

  const el = (id) => document.getElementById(id);

  el('percent-display').textContent = `${pct}%`;
  el('site-badge').textContent      = site;
  el('stat-tokens').textContent     = formatNum(tokens) + ' tk';
  el('stat-max').textContent        = formatNum(maxTok) + ' tk (' + (data.model || '—') + ')';

  const remaining = Math.max(maxTok - tokens, 0);
  const remEl = el('stat-remaining');
  remEl.textContent = formatNum(remaining) + ' tk';
  remEl.className   = 'stat-value ' + (remaining < maxTok * 0.2 ? 'red' : remaining < maxTok * 0.4 ? 'orange' : 'green');

  el('stat-cost').textContent = '$' + cost;

  const fill = el('progress-fill');
  fill.style.width      = `${Math.min(pct, 100)}%`;
  fill.style.background = colors.bar;

  const barPct = el('bar-pct-text');
  barPct.textContent = `${pct}%`;
  barPct.style.color = colors.text;

  const hint = el('bar-hint');
  if (pct >= 90)       { hint.textContent = '🔴 Context almost full — start a new conversation!'; hint.style.color = '#ff4444'; }
  else if (pct >= 70)  { hint.textContent = '🟠 Context over 70% — consider wrapping up';        hint.style.color = '#ffaa00'; }
  else if (tokens === 0){ hint.textContent = 'Open Claude.ai, ChatGPT, Gemini or Groq to start'; hint.style.color = ''; }
  else                 { hint.textContent = '🟢 Context OK';                                      hint.style.color = '#00ff88'; }

  el('last-update').textContent = updated;

  // Plan section (ChatGPT only)
  const planSection = document.querySelector('.plan-card');
  if (planSection) {
    const isChatGPT = site && (site.includes('chatgpt') || site.includes('openai'));
    planSection.style.display = isChatGPT ? '' : 'none';
  }

  updatePlanUI(plan);

  const cfg = PLAN_CONFIG[plan];
  if (el('plan-msg-count')) el('plan-msg-count').textContent = msgCount;
  if (el('plan-msg-limit')) el('plan-msg-limit').textContent = plan === 'pro' ? '∞' : (cfg.msgLimit ?? 'dynamic');
  if (el('plan-window'))    el('plan-window').textContent    = cfg.windowTxt;
}

// ── Storage read ─────────────────────────────
function loadData() {
  chrome.storage.local.get(
    ['tokens', 'percent', 'maxTokens', 'cost', 'hostname', 'lastUpdate', 'model', 'msgCount', 'userPlan'],
    (data) => render(data)
  );
}

loadData();
setInterval(loadData, 2000);

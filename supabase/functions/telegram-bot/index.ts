/**
 * Telegram bot webhook — responds to /wizyty and /visitors with today's
 * page-view summary from public.analytics_events.
 *
 * Admin auth:
 *  - Set TELEGRAM_ADMIN_CHAT_IDS to a comma-separated list of allowed chat IDs.
 *    Only those chats can call data commands. Use /myid to discover your ID.
 *  - If unset, the bot refuses data commands (fail-closed).
 *
 * Setup endpoints (GET):
 *   ?setup=1     → re-register webhook with Telegram
 *   ?diag=1      → diagnostic JSON: webhook info + bot identity
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_IDS = new Set(
  (Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// In-memory diagnostics (resets on cold start)
const diag = {
  bootAt: new Date().toISOString(),
  lastUpdateAt: null as string | null,
  lastChatId: null as number | null,
  lastCommand: null as string | null,
  lastError: null as string | null,
  updates: 0,
  errors: 0,
};

async function tg(method: string, body: Record<string, unknown>) {
  if (!BOT_TOKEN) return null;
  try {
    const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return await r.json().catch(() => null);
  } catch (e) {
    diag.errors++;
    diag.lastError = `tg(${method}): ${(e as Error).message}`;
    return null;
  }
}

function isAdmin(chatId: number | undefined): boolean {
  if (!chatId) return false;
  if (ADMIN_IDS.size === 0) return false;
  return ADMIN_IDS.has(String(chatId));
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm} UTC`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]!));
}

async function todaysVisitsSummary(): Promise<string> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  try {
    const { data, error } = await supabase
      .from("analytics_events")
      .select("path, created_at, user_agent")
      .eq("event_type", "page_view")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      diag.errors++;
      diag.lastError = `db: ${error.message}`;
      return `⚠️ <b>Błąd bazy danych</b>\n<code>${escapeHtml(error.message)}</code>\nSpróbuj ponownie za chwilę.`;
    }

    const rows = data ?? [];
    if (rows.length === 0) {
      return `📭 <b>Brak wizyt dzisiaj</b>\nOd północy UTC nikt jeszcze nie odwiedził strony.`;
    }

    // Per-path counts
    const counts = new Map<string, number>();
    for (const r of rows) {
      const p = ((r.path as string) || "(unknown)").slice(0, 80);
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
    const topPaths = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([p, n], i) => `${i + 1}. <code>${escapeHtml(p)}</code> — <b>${n}</b>`)
      .join("\n");

    // Last 10 visits chronologically
    const recent = rows
      .slice(0, 10)
      .map((r) => {
        const t = fmtTime(r.created_at as string);
        const p = escapeHtml(((r.path as string) || "(unknown)").slice(0, 60));
        return `🕒 <b>${t}</b> — <code>${p}</code>`;
      })
      .join("\n");

    const dateStr = since.toISOString().slice(0, 10);

    return [
      `📊 <b>Wizyty — ${dateStr}</b>`,
      `Łącznie: <b>${rows.length}</b> · Unikalne ścieżki: <b>${counts.size}</b>`,
      ``,
      `<b>🔝 Top strony:</b>`,
      topPaths,
      ``,
      `<b>🕘 Ostatnie wizyty:</b>`,
      recent,
    ].join("\n");
  } catch (e) {
    diag.errors++;
    diag.lastError = `summary: ${(e as Error).message}`;
    return `⚠️ <b>Nieoczekiwany błąd</b>\n<code>${escapeHtml((e as Error).message)}</code>`;
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Setup: register webhook
  if (req.method === "GET" && url.searchParams.get("setup") === "1") {
    const webhookUrl = `${SUPABASE_URL}/functions/v1/telegram-bot`;
    const body: Record<string, unknown> = { url: webhookUrl, allowed_updates: ["message"] };
    if (WEBHOOK_SECRET) body.secret_token = WEBHOOK_SECRET;
    const r = await tg("setWebhook", body);
    return Response.json(r ?? { ok: false });
  }

  // Diagnostics JSON
  if (req.method === "GET" && url.searchParams.get("diag") === "1") {
    const info = await tg("getWebhookInfo", {});
    const me = await tg("getMe", {});
    return Response.json({
      bot: me?.result ?? null,
      webhook: info?.result ?? null,
      runtime: diag,
      adminConfigured: ADMIN_IDS.size > 0,
      adminCount: ADMIN_IDS.size,
      webhookSecretSet: Boolean(WEBHOOK_SECRET),
    });
  }

  // Diagnostics UI (HTML) — step-by-step webhook test
  if (req.method === "GET" && (url.searchParams.get("diag") === "ui" || url.pathname.endsWith("/diag"))) {
    const info = await tg("getWebhookInfo", {});
    const me = await tg("getMe", {});
    const botName = me?.result?.username ? `@${me.result.username}` : "(unknown)";
    const wh = info?.result ?? {};
    const ok = wh.url && !wh.last_error_message;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Telegram Bot Diag</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font:14px/1.5 -apple-system,system-ui,sans-serif;background:#020617;color:#e2e8f0;margin:0;padding:24px;max-width:780px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px;color:#10b981}
.card{background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:16px;margin:12px 0}
.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #1e293b}
.row:last-child{border:0}.k{color:#94a3b8}.v{font-family:ui-monospace,monospace;color:#fff;text-align:right;word-break:break-all;max-width:60%}
.ok{color:#10b981;font-weight:600}.bad{color:#ef4444;font-weight:600}.warn{color:#f59e0b}
ol{padding-left:20px}li{margin:8px 0}code{background:#1e293b;padding:2px 6px;border-radius:4px;color:#10b981;font-size:13px}
button{background:#10b981;color:#020617;border:0;padding:10px 16px;border-radius:6px;font-weight:600;cursor:pointer;font-size:14px;margin-right:8px}
button.sec{background:#1e293b;color:#e2e8f0}
a{color:#10b981}
.big{font-size:24px;font-weight:700}
.alert{padding:16px;border-radius:8px;margin:12px 0;font-weight:600;font-size:15px;display:flex;align-items:center;gap:12px}
.alert-ok{background:rgba(16,185,129,.15);border:2px solid #10b981;color:#10b981}
.alert-bad{background:rgba(239,68,68,.15);border:2px solid #ef4444;color:#ef4444}
.urlbox{display:flex;gap:8px;align-items:center}
.urlbox input{flex:1;background:#0b1220;border:1px solid #1e293b;color:#fff;padding:8px;border-radius:6px;font-family:ui-monospace,monospace;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}
th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #1e293b;font-family:ui-monospace,monospace}
th{color:#94a3b8;font-weight:600;font-size:11px;text-transform:uppercase}
.toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.toggle input{width:18px;height:18px;accent-color:#10b981}
.pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
</style></head><body>
<h1>🩺 Telegram Bot Diagnostics</h1>

<div id="alertBox" class="alert ${ok && wh.url === `${SUPABASE_URL}/functions/v1/telegram-bot` ? "alert-ok" : "alert-bad"}">
  <span style="font-size:24px">${ok && wh.url === `${SUPABASE_URL}/functions/v1/telegram-bot` ? "✅" : "⚠️"}</span>
  <span id="alertText">${ok && wh.url === `${SUPABASE_URL}/functions/v1/telegram-bot` ? "Webhook URL zgodny z oczekiwanym endpointem" : (wh.url ? "Webhook URL NIE PASUJE do oczekiwanego endpointu!" : "Webhook nie jest zarejestrowany")}</span>
</div>

<p class="toggle"><label class="toggle"><input type="checkbox" id="autoTog" checked> Auto-refresh co 5s</label> <span id="liveDot" class="pulse"></span> <span id="liveTxt" style="color:#94a3b8;font-size:12px">aktywny</span></p>

<div class="card">
  <h2 style="margin-top:0">Bot</h2>
  <div class="row"><span class="k">Nazwa</span><span class="v">${escapeHtml(botName)}</span></div>
  <div class="row"><span class="k">Admin configured</span><span class="v ${ADMIN_IDS.size > 0 ? "ok" : "warn"}">${ADMIN_IDS.size > 0 ? `✅ ${ADMIN_IDS.size}` : "❌ brak"}</span></div>
  <div class="row"><span class="k">Webhook secret</span><span class="v ${WEBHOOK_SECRET ? "ok" : "warn"}">${WEBHOOK_SECRET ? "✅" : "❌"}</span></div>
</div>

<div class="card">
  <h2 style="margin-top:0">🌐 Webhook (getWebhookInfo)</h2>
  <p style="margin:0 0 8px;color:#94a3b8">Oczekiwany endpoint:</p>
  <div class="urlbox" style="margin-bottom:8px">
    <input id="expectedUrl" readonly value="${escapeHtml(`${SUPABASE_URL}/functions/v1/telegram-bot`)}">
    <button class="sec" onclick="copyVal('expectedUrl', this)">📋 Kopiuj</button>
  </div>
  <p style="margin:8px 0;color:#94a3b8">Aktywny webhook URL:</p>
  <div class="urlbox" style="margin-bottom:12px">
    <input id="activeUrl" readonly value="${escapeHtml(wh.url ?? "")}">
    <button class="sec" onclick="copyVal('activeUrl', this)">📋 Kopiuj</button>
  </div>
  <div class="row"><span class="k">Match z oczekiwanym</span><span class="v" id="wh_match">${wh.url === `${SUPABASE_URL}/functions/v1/telegram-bot` ? '<span class="ok">✅ zgodny</span>' : '<span class="bad">❌ różny</span>'}</span></div>
  <div class="row"><span class="k">IP address</span><span class="v" id="wh_ip">${escapeHtml(wh.ip_address ?? "—")}</span></div>
  <div class="row"><span class="k">Custom certificate</span><span class="v" id="wh_cert">${wh.has_custom_certificate ? "tak" : "nie"}</span></div>
  <div class="row"><span class="k">Pending updates</span><span class="v" id="wh_pending">${wh.pending_update_count ?? 0}</span></div>
  <div class="row"><span class="k">Max connections</span><span class="v" id="wh_max">${wh.max_connections ?? "—"}</span></div>
  <div class="row"><span class="k">Allowed updates</span><span class="v" id="wh_allow">${escapeHtml((wh.allowed_updates ?? []).join(", ") || "(wszystkie)")}</span></div>
  <div class="row"><span class="k">Last error date</span><span class="v" id="wh_errdate">${wh.last_error_date ? new Date(wh.last_error_date * 1000).toISOString() : "—"}</span></div>
  <div class="row"><span class="k">Last error message</span><span class="v ${wh.last_error_message ? "bad" : "ok"}" id="wh_errmsg">${escapeHtml(wh.last_error_message ?? "brak")}</span></div>
  <div class="row"><span class="k">Last sync error date</span><span class="v" id="wh_syncerr">${wh.last_synchronization_error_date ? new Date(wh.last_synchronization_error_date * 1000).toISOString() : "—"}</span></div>
  <div class="row"><span class="k">Sprawdzono</span><span class="v" id="wh_checked">${new Date().toISOString()}</span></div>
  <p style="margin-top:12px">
    <button onclick="checkWebhook(true)">🔍 Sprawdź teraz</button>
    <a href="?setup=1"><button class="sec">♻️ Re-register</button></a>
  </p>
</div>

<div class="card">
  <h2 style="margin-top:0">📜 Historia sprawdzeń</h2>
  <p style="margin:0 0 8px;color:#94a3b8">Ostatnie 20 wywołań <code>getWebhookInfo</code> (zapisane lokalnie w przeglądarce).</p>
  <div style="overflow-x:auto">
    <table id="histTbl">
      <thead><tr><th>Czas (UTC)</th><th>URL</th><th>Match</th><th>Pending</th><th>Last error</th></tr></thead>
      <tbody><tr><td colspan="5" style="color:#94a3b8;text-align:center">Brak wpisów — kliknij „Sprawdź teraz".</td></tr></tbody>
    </table>
  </div>
  <p style="margin-top:8px"><button class="sec" onclick="clearHist()">🗑️ Wyczyść historię</button></p>
</div>

<div class="card">
  <h2 style="margin-top:0">Liczniki runtime (od bootu)</h2>
  <div class="row"><span class="k">Boot at</span><span class="v">${diag.bootAt}</span></div>
  <div class="row"><span class="k">Updates</span><span class="v big ok" id="updates">${diag.updates}</span></div>
  <div class="row"><span class="k">Errors</span><span class="v big ${diag.errors > 0 ? "bad" : "ok"}" id="errors">${diag.errors}</span></div>
  <div class="row"><span class="k">Last update at</span><span class="v" id="lastUpd">${diag.lastUpdateAt ?? "—"}</span></div>
  <div class="row"><span class="k">Last command</span><span class="v" id="lastCmd">${escapeHtml(diag.lastCommand ?? "—")}</span></div>
  <div class="row"><span class="k">Last error</span><span class="v" id="lastErr">${escapeHtml(diag.lastError ?? "—")}</span></div>
  <p style="margin-top:12px"><button onclick="refresh()">🔄 Odśwież liczniki</button>
  <a href="${botName !== "(unknown)" ? `https://t.me/${botName.slice(1)}` : "#"}" target="_blank"><button class="sec">💬 Otwórz bota w Telegramie</button></a></p>
</div>

<div class="card">
  <h2 style="margin-top:0">Endpointy</h2>
  <div class="row"><span class="k">UI diag</span><span class="v"><a href="?diag=ui">?diag=ui</a></span></div>
  <div class="row"><span class="k">JSON diag</span><span class="v"><a href="?diag=1">?diag=1</a></span></div>
  <div class="row"><span class="k">Re-register webhook</span><span class="v"><a href="?setup=1">?setup=1</a></span></div>
</div>

<script>
const EXPECTED_URL = ${JSON.stringify(`${SUPABASE_URL}/functions/v1/telegram-bot`)};
const HIST_KEY = 'tg-bot-diag-history-v1';

function esc(s){return String(s ?? '—').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function loadHist(){try{return JSON.parse(localStorage.getItem(HIST_KEY)||'[]')}catch{return []}}
function saveHist(h){try{localStorage.setItem(HIST_KEY, JSON.stringify(h.slice(0,20)))}catch{}}
function renderHist(){
  const h = loadHist();
  const tb = document.querySelector('#histTbl tbody');
  if(!h.length){tb.innerHTML = '<tr><td colspan="5" style="color:#94a3b8;text-align:center">Brak wpisów — kliknij „Sprawdź teraz".</td></tr>';return}
  tb.innerHTML = h.map(e => {
    const match = e.url === EXPECTED_URL ? '<span class="ok">✅</span>' : '<span class="bad">❌</span>';
    const err = e.err ? '<span class="bad">'+esc(e.err)+'</span>' : '<span class="ok">brak</span>';
    return '<tr><td>'+esc(e.t)+'</td><td style="max-width:280px;word-break:break-all">'+esc(e.url||'—')+'</td><td>'+match+'</td><td>'+(e.pending??0)+'</td><td>'+err+'</td></tr>';
  }).join('');
}
function pushHist(wh){
  const h = loadHist();
  h.unshift({t:new Date().toISOString(), url:wh?.url||'', pending:wh?.pending_update_count||0, err:wh?.last_error_message||''});
  saveHist(h); renderHist();
}
function clearHist(){localStorage.removeItem(HIST_KEY); renderHist()}
async function copyVal(id, btn){
  const el = document.getElementById(id);
  try{await navigator.clipboard.writeText(el.value); const o=btn.textContent; btn.textContent='✅ Skopiowano'; setTimeout(()=>btn.textContent=o,1500)}
  catch{el.select(); document.execCommand('copy')}
}
async function fetchDiag(){return fetch('?diag=1',{cache:'no-store'}).then(r=>r.json()).catch(()=>null)}

function updateAlert(wh){
  const box = document.getElementById('alertBox');
  const txt = document.getElementById('alertText');
  const icon = box.querySelector('span:first-child');
  if(!wh || !wh.url){box.className='alert alert-bad';icon.textContent='⚠️';txt.textContent='Webhook nie jest zarejestrowany';return}
  if(wh.url !== EXPECTED_URL){box.className='alert alert-bad';icon.textContent='⚠️';txt.textContent='Webhook URL NIE PASUJE do oczekiwanego endpointu!';return}
  if(wh.last_error_message){box.className='alert alert-bad';icon.textContent='⚠️';txt.textContent='Webhook zgodny, ale Telegram zwrócił błąd: '+wh.last_error_message;return}
  box.className='alert alert-ok';icon.textContent='✅';txt.textContent='Webhook URL zgodny z oczekiwanym endpointem';
}

async function refresh(){
  const r = await fetchDiag(); if(!r) return;
  document.getElementById('updates').textContent = r.runtime.updates;
  document.getElementById('errors').textContent = r.runtime.errors;
  document.getElementById('errors').className = 'v big ' + (r.runtime.errors>0?'bad':'ok');
  document.getElementById('lastUpd').textContent = r.runtime.lastUpdateAt ?? '—';
  document.getElementById('lastCmd').textContent = r.runtime.lastCommand ?? '—';
  document.getElementById('lastErr').textContent = r.runtime.lastError ?? '—';
  return r;
}

async function checkWebhook(record){
  const r = await refresh();
  if(!r || !r.webhook){updateAlert(null);return}
  const wh = r.webhook;
  document.getElementById('activeUrl').value = wh.url ?? '';
  document.getElementById('wh_match').innerHTML = wh.url === EXPECTED_URL ? '<span class="ok">✅ zgodny</span>' : '<span class="bad">❌ różny</span>';
  document.getElementById('wh_ip').textContent = wh.ip_address ?? '—';
  document.getElementById('wh_cert').textContent = wh.has_custom_certificate ? 'tak' : 'nie';
  document.getElementById('wh_pending').textContent = wh.pending_update_count ?? 0;
  document.getElementById('wh_max').textContent = wh.max_connections ?? '—';
  document.getElementById('wh_allow').textContent = (wh.allowed_updates ?? []).join(', ') || '(wszystkie)';
  document.getElementById('wh_errdate').textContent = wh.last_error_date ? new Date(wh.last_error_date*1000).toISOString() : '—';
  const em = document.getElementById('wh_errmsg');
  em.textContent = wh.last_error_message ?? 'brak';
  em.className = 'v ' + (wh.last_error_message ? 'bad' : 'ok');
  document.getElementById('wh_syncerr').textContent = wh.last_synchronization_error_date ? new Date(wh.last_synchronization_error_date*1000).toISOString() : '—';
  document.getElementById('wh_checked').textContent = new Date().toISOString();
  updateAlert(wh);
  if(record) pushHist(wh);
}

let autoTimer = null;
function setAuto(on){
  if(autoTimer){clearInterval(autoTimer);autoTimer=null}
  document.getElementById('liveDot').style.display = on ? 'inline-block' : 'none';
  document.getElementById('liveTxt').textContent = on ? 'aktywny (co 5s)' : 'wyłączony';
  if(on){autoTimer = setInterval(()=>checkWebhook(false), 5000)}
}
document.getElementById('autoTog').addEventListener('change', e => setAuto(e.target.checked));

renderHist();
setAuto(true);
</script>
</body></html>`;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  }


  if (req.method !== "POST") return new Response("ok");

  if (WEBHOOK_SECRET) {
    const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (got !== WEBHOOK_SECRET) return new Response("unauthorized", { status: 401 });
  }

  let update: any;
  try {
    update = await req.json();
  } catch {
    return new Response("ok");
  }

  const msg = update?.message ?? update?.edited_message;
  const chatId: number | undefined = msg?.chat?.id;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId) return new Response("ok");

  diag.updates++;
  diag.lastUpdateAt = new Date().toISOString();
  diag.lastChatId = chatId;

  const cmd = text.split(/\s+/)[0].toLowerCase().split("@")[0];
  diag.lastCommand = cmd;

  let reply = "";

  // Public commands (no auth required)
  if (cmd === "/start" || cmd === "/help") {
    reply = [
      `👋 <b>PH Labs Analytics Bot</b>`,
      ``,
      `<b>Komendy:</b>`,
      `/wizyty — dzisiejsze wizyty (tylko admin)`,
      `/visitors — to samo co /wizyty`,
      `/status — diagnostyka bota`,
      `/myid — pokaż Twój chat ID`,
      ``,
      isAdmin(chatId)
        ? `✅ Jesteś autoryzowanym adminem.`
        : `🔒 Nie masz dostępu do danych. Wyślij /myid i poproś o dodanie do TELEGRAM_ADMIN_CHAT_IDS.`,
    ].join("\n");
  } else if (cmd === "/myid") {
    reply = `🆔 Twój chat ID: <code>${chatId}</code>`;
  } else if (cmd === "/status") {
    reply = [
      `🩺 <b>Status bota</b>`,
      `Boot: <code>${diag.bootAt}</code>`,
      `Updates: <b>${diag.updates}</b> · Errors: <b>${diag.errors}</b>`,
      `Last cmd: <code>${diag.lastCommand ?? "—"}</code>`,
      `Last error: <code>${escapeHtml(diag.lastError ?? "—")}</code>`,
      `Admin configured: ${ADMIN_IDS.size > 0 ? "✅" : "❌"} (${ADMIN_IDS.size})`,
      `Webhook secret: ${WEBHOOK_SECRET ? "✅" : "❌"}`,
    ].join("\n");
  } else if (cmd === "/wizyty" || cmd === "/visitors") {
    if (!isAdmin(chatId)) {
      reply = [
        `🔒 <b>Brak dostępu</b>`,
        `Ta komenda jest tylko dla adminów.`,
        `Twój chat ID: <code>${chatId}</code>`,
        `Dodaj go do sekretu <code>TELEGRAM_ADMIN_CHAT_IDS</code>.`,
      ].join("\n");
    } else {
      reply = await todaysVisitsSummary();
    }
  } else {
    reply = "🤖 Nieznana komenda. Wyślij /help.";
  }

  await tg("sendMessage", { chat_id: chatId, text: reply, parse_mode: "HTML" });
  return new Response("ok");
});

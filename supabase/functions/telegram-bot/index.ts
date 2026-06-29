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

  // Diagnostics endpoint
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

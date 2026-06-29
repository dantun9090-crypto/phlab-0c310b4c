/**
 * Telegram bot webhook — responds to /wizyty and /visitors with today's
 * page-view summary from public.analytics_events.
 *
 * Setup:
 *  1. Create a bot via @BotFather and copy the token.
 *  2. Store it as a Lovable Cloud secret named TELEGRAM_BOT_TOKEN
 *     (optionally also TELEGRAM_WEBHOOK_SECRET — any random string).
 *  3. Deploy the function (auto-deploys on save).
 *  4. Register the webhook with Telegram (replace TOKEN + SECRET + URL):
 *
 *     curl -s "https://api.telegram.org/botTOKEN/setWebhook" \
 *       -d "url=https://vvqotfbqmwmukwcmuycg.supabase.co/functions/v1/telegram-bot" \
 *       -d "secret_token=SECRET" \
 *       --data-urlencode 'allowed_updates=["message"]'
 *
 *  5. Message the bot: /wizyty  (or /visitors)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

async function tg(method: string, body: Record<string, unknown>) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
}

async function todaysVisitsSummary(): Promise<string> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const { data, error } = await supabase
    .from("analytics_events")
    .select("path, created_at")
    .eq("event_type", "page_view")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return `⚠️ Error: ${error.message}`;
  const rows = data ?? [];
  if (rows.length === 0) return "📊 Dziś brak odwiedzin.";

  const counts = new Map<string, number>();
  for (const r of rows) {
    const p = (r.path as string) || "(unknown)";
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([p, n]) => `• <code>${p}</code> — ${n}`)
    .join("\n");

  return [
    `📊 <b>Wizyty dzisiaj</b>`,
    `Łącznie: <b>${rows.length}</b>`,
    `Unikalne ścieżki: <b>${counts.size}</b>`,
    ``,
    `<b>Top strony:</b>`,
    top,
  ].join("\n");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");

  if (WEBHOOK_SECRET) {
    const got = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (got !== WEBHOOK_SECRET) return new Response("unauthorized", { status: 401 });
  }

  let update: any;
  try { update = await req.json(); } catch { return new Response("ok"); }

  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId) return new Response("ok");

  const cmd = text.split(/\s+/)[0].toLowerCase().split("@")[0];

  let reply = "";
  if (cmd === "/start" || cmd === "/help") {
    reply = "👋 Komendy:\n/wizyty — dzisiejsze wizyty\n/visitors — same as /wizyty";
  } else if (cmd === "/wizyty" || cmd === "/visitors") {
    reply = await todaysVisitsSummary();
  } else {
    reply = "🤖 Nieznana komenda. /help";
  }

  await tg("sendMessage", { chat_id: chatId, text: reply, parse_mode: "HTML" });
  return new Response("ok");
});

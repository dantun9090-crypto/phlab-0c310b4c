/**
 * Shared server-only Telegram alert helper.
 *
 * Uses the Lovable connector gateway (same pattern as backlink-watcher).
 * Silently no-ops if LOVABLE_API_KEY or TELEGRAM_API_KEY are not configured
 * so callers can fire-and-forget without try/catch noise.
 */
const TELEGRAM_GATEWAY = 'https://connector-gateway.lovable.dev/telegram';
const DEFAULT_CHAT_ID = '7971499178';

export async function sendTelegramAlert(text: string): Promise<boolean> {
  const lovable = process.env.LOVABLE_API_KEY;
  const tg = process.env.TELEGRAM_API_KEY;
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID || DEFAULT_CHAT_ID;
  if (!lovable || !tg) return false;
  try {
    const res = await fetch(`${TELEGRAM_GATEWAY}/sendMessage`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${lovable}`,
        'X-Connection-Api-Key': tg,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

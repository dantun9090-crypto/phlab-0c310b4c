import { createFileRoute } from '@tanstack/react-router';
import { createHash, timingSafeEqual } from 'crypto';

const GATEWAY_URL = 'https://connector-gateway.lovable.dev/telegram';

function deriveSecret(apiKey: string) {
  return createHash('sha256').update(`telegram-webhook:${apiKey}`).digest('base64url');
}

function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

async function sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  const res = await fetch(`${GATEWAY_URL}/sendMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
      'X-Connection-Api-Key': process.env.TELEGRAM_API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', ...extra }),
  });
  if (!res.ok) {
    console.error('telegram sendMessage failed', res.status, await res.text());
  }
}

function replyFor(text: string): string {
  const t = text.trim().toLowerCase();

  if (t === '/start') {
    return [
      '👋 <b>Witaj w PH Labs!</b>',
      '',
      'Jestem botem powiadomień sklepu phlabs.co.uk.',
      '',
      'Dostępne komendy:',
      '/help – lista komend',
      '/status – status sklepu',
      '/sklep – link do sklepu',
      '/kontakt – dane kontaktowe',
      '/id – Twój chat ID',
    ].join('\n');
  }
  if (t === '/help') {
    return [
      '<b>Komendy:</b>',
      '/start – powitanie',
      '/status – status sklepu',
      '/sklep – link do sklepu',
      '/kontakt – dane kontaktowe',
      '/id – Twój chat ID',
    ].join('\n');
  }
  if (t === '/status') return '✅ Sklep online: https://phlabs.co.uk';
  if (t === '/sklep') return '🛒 https://phlabs.co.uk/products';
  if (t === '/kontakt') return '📧 info@phlabs.co.uk\n🌐 https://phlabs.co.uk';
  if (t === '/id') return ''; // handled separately to include chat id
  return '🤖 Nie rozumiem. Wpisz /help, aby zobaczyć listę komend.';
}

export const Route = createFileRoute('/api/public/telegram/webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.TELEGRAM_API_KEY;
        if (!apiKey) return new Response('Not configured', { status: 500 });

        const expected = deriveSecret(apiKey);
        const got = request.headers.get('X-Telegram-Bot-Api-Secret-Token') ?? '';
        if (!safeEqual(got, expected)) return new Response('Unauthorized', { status: 401 });

        let update: any;
        try {
          update = await request.json();
        } catch {
          return Response.json({ ok: true, ignored: 'invalid-json' });
        }

        const message = update?.message ?? update?.edited_message;
        const chatId = message?.chat?.id;
        const text: string = message?.text ?? '';
        if (!chatId) return Response.json({ ok: true, ignored: 'no-chat' });

        let reply = replyFor(text);
        if (text.trim().toLowerCase() === '/id') {
          reply = `🆔 Twój chat ID: <code>${chatId}</code>`;
        }

        await sendMessage(chatId, reply);
        return Response.json({ ok: true });
      },
    },
  },
});

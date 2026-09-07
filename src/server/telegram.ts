import { supportTelegramUrl } from "@/lib/support";

function miniAppUrl() {
  const raw = (process.env.MINIAPP_URL ?? "").trim().replace(/\/$/, "");
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  return `https://${raw}`;
}

type TelegramSendResult =
  | { ok: true }
  | { ok: false; retryAfterSec?: number; blocked?: boolean; error: string };

/**
 * Отправка в личку через Bot API.
 * Воркеры не держат grammY — только HTTP, чтобы не тянуть webhook-цикл.
 */
export async function sendTelegramMessage(
  telegramId: bigint | number | string,
  text: string,
  deepLink?: string,
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN не задан" };
  }

  const appUrl = miniAppUrl();
  const href = deepLink && appUrl ? `${appUrl}${deepLink.startsWith("/") ? deepLink : `/${deepLink}`}` : appUrl;
  const httpsApp = href.startsWith("https://");

  const replyMarkup = href
    ? {
        inline_keyboard: [
          [
            httpsApp
              ? { text: "Открыть приложение", web_app: { url: href } }
              : { text: "Открыть приложение", url: href },
          ],
        ],
      }
    : undefined;

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(telegramId),
      text,
      reply_markup: replyMarkup,
    }),
  });

  const body = (await response.json().catch(() => null)) as {
    ok?: boolean;
    error_code?: number;
    description?: string;
    parameters?: { retry_after?: number };
  } | null;

  if (body?.ok) return { ok: true };

  const code = body?.error_code ?? response.status;
  const error = body?.description ?? `telegram ${code}`;
  if (code === 429) {
    return { ok: false, retryAfterSec: body?.parameters?.retry_after ?? 5, error };
  }
  if (code === 403 || /blocked|deactivated|chat not found/i.test(error)) {
    return { ok: false, blocked: true, error };
  }
  return { ok: false, error };
}

export function supportHint() {
  return `Написать в поддержку: ${supportTelegramUrl()}`;
}

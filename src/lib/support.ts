/** Telegram-аккаунт поддержки. Без @, задаётся в .env. */
export function supportUsername() {
  const raw = process.env.SUPPORT_TELEGRAM_USERNAME?.trim() || "profibux_support";
  return raw.replace(/^@/, "");
}

export function supportTelegramUrl(prefill?: string) {
  const base = `https://t.me/${supportUsername()}`;
  if (!prefill) return base;
  return `${base}?text=${encodeURIComponent(prefill)}`;
}

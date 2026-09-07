/**
 * Ссылки из админки (баннеры, картинки) нельзя принимать как есть:
 * `javascript:` и протокол-относительные `//evil` в <Link> / <img> — XSS.
 */

function trimmed(value?: string | null) {
  return value?.trim() ?? "";
}

export function sanitizeHttpUrl(value?: string | null): string | null {
  const input = trimmed(value);
  if (!input) return null;
  if (input.startsWith("/") && !input.startsWith("//") && !input.includes("\\")) {
    if (/^[a-z][a-z0-9+.-]*:/i.test(input)) return null;
    return input;
  }
  try {
    const url = new URL(input);
    if (url.protocol === "http:" || url.protocol === "https:") return input;
  } catch {
    return null;
  }
  return null;
}

/** Пустое значение — ок. Непустое, но опасное/битое — ошибка, а не тихий null. */
export function requireSanitizedUrl(
  value: string | undefined | null,
  field: "href" | "image",
): string | null {
  const input = trimmed(value);
  if (!input) return null;
  const cleaned = sanitizeHttpUrl(input);
  if (cleaned) return cleaned;
  throw new Error(
    field === "image"
      ? "Картинка не сохранится: нужна прямая ссылка http:// или https:// на изображение"
      : "Ссылка не сохранится: укажите путь вроде /referrals или адрес https://",
  );
}

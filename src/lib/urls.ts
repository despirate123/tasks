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

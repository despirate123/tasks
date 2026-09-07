import type { Prisma } from "@/generated/prisma";

type Money = Prisma.Decimal | number | string;

function toNumber(value: Money): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseFloat(value);
  return Number.parseFloat(value.toString());
}

/** Неразрывные пробелы: на узком экране «₽» не уезжает на следующую строку. */
function noWrapMoney(value: string) {
  return value.replace(/\s/g, "\u00A0");
}

/** «1 250 ₽», «1 250,50 ₽» — копейки показываем только когда они есть. */
export function formatMoney(value: Money, currency = "RUB"): string {
  const n = toNumber(value);
  const hasCents = Math.abs(n % 1) > 0.0001;
  const amount = n.toLocaleString("ru-RU", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return noWrapMoney(
    currency === "USDT" ? `${amount}\u00A0USDT` : `${amount}\u00A0₽`,
  );
}

/** Со знаком — для истории операций. */
export function formatMoneySigned(value: Money, currency = "RUB"): string {
  const n = toNumber(value);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + formatMoney(Math.abs(n), currency);
}

export function formatCrypto(value: Money, asset = "USDT"): string {
  const n = toNumber(value);
  return noWrapMoney(`${n.toFixed(2)}\u00A0${asset}`);
}

/**
 * Время одобрения в человеческом виде.
 * Показываем приблизительно — точность здесь вредна, она создаёт
 * ложные ожидания и повод для претензий.
 */
export function formatEta(minutes: number | null | undefined): string {
  if (minutes == null) return "уточняется";
  if (minutes < 60) return `≈ ${minutes} мин`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `≈ ${hours} ${plural(hours, "час", "часа", "часов")}`;
  }
  const days = Math.round(minutes / 1440);
  return `≈ ${days} ${plural(days, "день", "дня", "дней")}`;
}

export function plural(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

/** «только что», «5 мин назад», «вчера», «3 сентября». */
export function formatRelative(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "только что";
  if (diffMin < 60) return `${diffMin} ${plural(diffMin, "мин", "мин", "мин")} назад`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH} ${plural(diffH, "час", "часа", "часов")} назад`;

  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "вчера";
  if (diffD < 7) return `${diffD} ${plural(diffD, "день", "дня", "дней")} назад`;

  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export function formatDateTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Остаток времени до дедлайна: «2 ч 14 мин», «истекло». */
export function formatCountdown(target: Date | string | null): string {
  if (!target) return "—";
  const d = typeof target === "string" ? new Date(target) : target;
  const ms = d.getTime() - Date.now();
  if (ms <= 0) return "истекло";
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days} ${plural(days, "день", "дня", "дней")} ${hours} ч`;
  if (hours > 0) return `${hours} ч ${mins} мин`;
  return `${mins} мин`;
}

export function maskCard(digits: string): string {
  const clean = digits.replace(/\D/g, "");
  return `•••• ${clean.slice(-4)}`;
}

export function maskCryptoAddress(address: string): string {
  if (address.length <= 12) return address;
  return `${address.slice(0, 5)}…${address.slice(-4)}`;
}

export function formatPercent(value: Money): string {
  const n = toNumber(value);
  return noWrapMoney(
    `${n.toLocaleString("ru-RU", { maximumFractionDigits: 1 })} %`,
  );
}

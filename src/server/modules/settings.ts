import { db } from "@/server/db";

/**
 * Настройки платформы, редактируемые из админки без релиза:
 * минимальные суммы вывода, комиссии, лимиты, проценты рефералов.
 *
 * Кэш в памяти процесса с коротким TTL: значения читаются на каждый расчёт
 * вывода, а меняются раз в месяц. Ходить в БД каждый раз незачем.
 */
const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { value: unknown; expires: number }>();

export const DEFAULT_SETTINGS: Record<string, number | string | boolean> = {
  "withdrawal.min.RUB_CARD": 500,
  "withdrawal.min.USDT": 1000,
  "withdrawal.fee.RUB_CARD": 0,
  "withdrawal.fee.USDT": 2,
  "withdrawal.dailyLimit.user": 50000,
  "withdrawal.dailyLimit.platform": 1000000,
  "withdrawal.autoApprove.threshold": 3000,
  "withdrawal.secondApproval.threshold": 30000,
  "offer.default.holdHours": 24,
  "offer.margin.percent": 40,
  "referral.level1.percent": 10,
  "referral.level2.percent": 3,
  "moderation.slaMinutes": 1440,
  "moderation.maxRevisions": 2,
  "fx.spread.percent": 2,
  "fx.anomaly.percent": 10,
  "antifraud.autoReviewScore": 50,
};

export async function getSetting<T extends number | string | boolean>(
  key: string,
  fallback: T,
): Promise<T> {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value as T;

  const row = await db.appSetting.findUnique({ where: { key } });
  const value = (row?.value ?? DEFAULT_SETTINGS[key] ?? fallback) as T;
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function setSetting(
  key: string,
  value: number | string | boolean,
  updatedById?: string,
) {
  cache.delete(key);
  return db.appSetting.upsert({
    where: { key },
    create: { key, value, updatedById },
    update: { value, updatedById },
  });
}

export async function getAllSettings() {
  const rows = await db.appSetting.findMany({ orderBy: { key: "asc" } });
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return Object.entries(DEFAULT_SETTINGS).map(([key, defaultValue]) => ({
    key,
    value: map.get(key) ?? defaultValue,
    isOverridden: map.has(key),
    description: rows.find((r) => r.key === key)?.description ?? null,
  }));
}

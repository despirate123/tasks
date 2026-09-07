export const REWARD_CHIPS = [
  { key: "", label: "Любая сумма" },
  { key: "to150", label: "до 150\u00A0₽" },
  { key: "150to400", label: "150–400\u00A0₽" },
  { key: "from400", label: "от 400\u00A0₽" },
] as const;

export type RewardFilter = {
  minReward?: number;
  maxReward?: number;
};

/**
 * Старые ключи (`0-150`) оставляем: часть клиентов и закладок уже
 * ходит с ними. Новый `to150` безопаснее в WebView — дефис после нуля
 * отдельные оболочки режут или воспринимают как выражение.
 */
const REWARD_RANGES: Record<string, RewardFilter> = {
  to150: { minReward: 0, maxReward: 150 },
  "0-150": { minReward: 0, maxReward: 150 },
  lte150: { minReward: 0, maxReward: 150 },
  "150to400": { minReward: 150, maxReward: 400 },
  "150-400": { minReward: 150, maxReward: 400 },
  from400: { minReward: 400 },
  "400": { minReward: 400 },
  gte400: { minReward: 400 },
};

export function firstSearchParam(
  value?: string | string[] | null,
): string | undefined {
  if (Array.isArray(value)) {
    const first = value.find((item) => item != null && String(item).length > 0);
    return first == null ? undefined : String(first);
  }
  if (value == null || value === "") return undefined;
  return String(value);
}

export function parseRewardFilter(
  raw?: string | string[] | null,
): RewardFilter {
  const key = firstSearchParam(raw)?.trim();
  if (!key) return {};
  return REWARD_RANGES[key] ?? {};
}

export function matchesRewardFilter(amount: number, filter: RewardFilter) {
  if (!Number.isFinite(amount)) return false;
  if (filter.minReward != null && amount < filter.minReward) return false;
  if (filter.maxReward != null && amount > filter.maxReward) return false;
  return true;
}

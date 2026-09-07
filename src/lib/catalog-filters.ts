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
 * «до 150» — только верхняя граница. Нижний порог 0 в Prisma не нужен
 * и в части клиентов ломал сравнение. Старые ключи (`0-150`) читаем.
 */
const REWARD_RANGES: Record<string, RewardFilter> = {
  to150: { maxReward: 150 },
  "0-150": { maxReward: 150 },
  lte150: { maxReward: 150 },
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
  if (REWARD_RANGES[key]) return REWARD_RANGES[key];

  const normalized = key.replace(/[–—−]/g, "-").toLowerCase();
  if (REWARD_RANGES[normalized]) return REWARD_RANGES[normalized];
  if (normalized === "0-150" || normalized === "to150" || normalized === "lte150") {
    return { maxReward: 150 };
  }
  if (normalized === "150-400" || normalized === "150to400") {
    return { minReward: 150, maxReward: 400 };
  }
  if (normalized === "400" || normalized === "from400" || normalized === "gte400") {
    return { minReward: 400 };
  }
  return {};
}

export function isRewardChipActive(
  rewardKey: string | undefined,
  chipKey: string,
) {
  if (chipKey === "") return !rewardKey;
  if ((rewardKey ?? "") === chipKey) return true;
  if (chipKey === "to150") {
    return rewardKey === "0-150" || rewardKey === "lte150";
  }
  if (chipKey === "150to400") return rewardKey === "150-400";
  if (chipKey === "from400") return rewardKey === "400" || rewardKey === "gte400";
  return false;
}

export function rewardFilterLabel(rewardKey: string | undefined) {
  const chip = REWARD_CHIPS.find(
    (item) => item.key !== "" && isRewardChipActive(rewardKey, item.key),
  );
  return chip?.label;
}

export function matchesRewardFilter(amount: number, filter: RewardFilter) {
  if (!Number.isFinite(amount)) return false;
  if (filter.minReward != null && amount < filter.minReward) return false;
  if (filter.maxReward != null && amount > filter.maxReward) return false;
  return true;
}

export type CatalogQueryState = {
  q?: string;
  sort?: string;
  category?: string;
  reward?: string;
  difficulty?: string[];
};

export function catalogHref(
  state: CatalogQueryState,
  patch: Partial<CatalogQueryState> = {},
) {
  const next = { ...state, ...patch };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.sort) params.set("sort", next.sort);
  if (next.category) params.set("category", next.category);
  if (next.reward) params.set("reward", next.reward);
  for (const value of next.difficulty ?? []) params.append("difficulty", value);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/";
}

export function toggleDifficultyList(current: string[], value: string) {
  const next = new Set(current);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return [...next];
}

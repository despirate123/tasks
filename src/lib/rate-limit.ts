const buckets = new Map<string, { n: number; reset: number }>();

/** Простой лимит в памяти процесса. Для одного инстанса на старте достаточно. */
export function rateLimit(key: string, max: number, windowMs: number) {
  const now = Date.now();
  const slot = buckets.get(key);
  if (!slot || now > slot.reset) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  slot.n += 1;
  return slot.n <= max;
}

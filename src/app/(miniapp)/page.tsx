import Link from "next/link";
import { Search, SlidersHorizontal, Wallet2 } from "lucide-react";
import type { Difficulty } from "@/generated/prisma";
import { getCurrentUser } from "@/server/auth";
import { getCategoriesWithCounts, listOffers } from "@/server/modules/offers";
import { getWallet } from "@/server/modules/wallet";
import { db } from "@/server/db";
import { formatMoney } from "@/lib/format";
import { DIFFICULTY, DIFFICULTY_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { OfferCard } from "@/components/domain";

const SORTS = [
  { key: "", label: "Рекомендуем" },
  { key: "reward", label: "Дороже" },
  { key: "eta", label: "Быстрее" },
  { key: "new", label: "Новые" },
] as const;

type SearchParams = Promise<{
  difficulty?: string | string[];
  category?: string;
  sort?: string;
  q?: string;
}>;

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const rawDifficulty = Array.isArray(params.difficulty)
    ? params.difficulty
    : params.difficulty
      ? [params.difficulty]
      : [];
  const difficulty = rawDifficulty.filter((d): d is Difficulty =>
    DIFFICULTY_ORDER.includes(d as Difficulty),
  );

  const user = await getCurrentUser();

  const [offers, categories, wallet, activeCount] = await Promise.all([
    listOffers({
      difficulty: difficulty.length ? difficulty : undefined,
      categorySlug: params.category,
      search: params.q,
      sort: params.sort as "reward" | "eta" | "new" | undefined,
    }),
    getCategoriesWithCounts(),
    user ? getWallet(user.id) : null,
    user
      ? db.taskSubmission.count({
          where: {
            userId: user.id,
            status: { in: ["DRAFT", "PENDING_REVIEW", "IN_REVIEW", "NEEDS_REVISION"] },
          },
        })
      : 0,
  ]);

  const takenOfferIds = user
    ? new Set(
        (
          await db.taskSubmission.findMany({
            where: {
              userId: user.id,
              offerId: { in: offers.map((o) => o.id) },
              status: { notIn: ["CANCELLED", "EXPIRED"] },
            },
            select: { offerId: true },
          })
        ).map((s) => s.offerId),
      )
    : new Set<string>();

  const hasFilters = Boolean(
    difficulty.length || params.category || params.q || params.sort,
  );

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.sort) next.set("sort", params.sort);
    if (params.category) next.set("category", params.category);
    for (const d of difficulty) next.append("difficulty", d);

    for (const [key, value] of Object.entries(patch)) {
      next.delete(key);
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };

  const toggleDifficultyHref = (value: Difficulty) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.sort) next.set("sort", params.sort);
    if (params.category) next.set("category", params.category);
    const set = new Set(difficulty);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    for (const d of set) next.append("difficulty", d);
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };

  return (
    <div className="space-y-4">
      {wallet ? (
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-card bg-surface-raised/70 p-3.5 ring-1 ring-inset ring-border-subtle transition active:scale-[0.99]"
        >
          <span className="flex size-10 items-center justify-center rounded-xl bg-money-500/12 text-money-400">
            <Wallet2 className="size-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] tracking-wide text-content-muted uppercase">
              Ваш баланс
            </span>
            <span className="tabular block text-lg leading-tight font-bold text-money-400">
              {formatMoney(wallet.available)}
            </span>
          </span>
          {activeCount > 0 ? (
            <span className="rounded-pill bg-brand-500/14 px-3 py-1.5 text-[12px] font-medium text-brand-300 ring-1 ring-inset ring-brand-500/28">
              {activeCount} в работе
            </span>
          ) : (
            <span className="text-[12px] font-medium text-content-muted">Вывести →</span>
          )}
        </Link>
      ) : null}

      <div>
        <h1 className="text-[22px] leading-tight font-bold">Задания</h1>
        <p className="mt-1 text-[13px] text-content-secondary">
          Выполните условия, приложите доказательства и получите вознаграждение.
        </p>
      </div>

      <form action="/" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-content-muted" />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Название или бренд"
            className="pl-10"
          />
        </div>
        {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
        <Button type="submit" variant="secondary" size="icon" aria-label="Найти">
          <Search />
        </Button>
      </form>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        {DIFFICULTY_ORDER.map((value) => {
          const active = difficulty.includes(value);
          const meta = DIFFICULTY[value];
          return (
            <Link
              key={value}
              href={toggleDifficultyHref(value)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
                active
                  ? meta.className
                  : "bg-surface-raised/70 text-content-secondary ring-border-subtle",
              )}
            >
              <span className={cn("size-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </Link>
          );
        })}

        <span className="mx-1 w-px shrink-0 self-stretch bg-border-subtle" />

        {SORTS.map((sort) => (
          <Link
            key={sort.key || "default"}
            href={buildHref({ sort: sort.key || undefined })}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
              (params.sort ?? "") === sort.key
                ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
                : "bg-surface-raised/70 text-content-secondary ring-border-subtle",
            )}
          >
            {sort.key === "" ? <SlidersHorizontal className="size-3" /> : null}
            {sort.label}
          </Link>
        ))}
      </div>

      {categories.length > 0 ? (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
          <Link
            href={buildHref({ category: undefined })}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
              !params.category
                ? "bg-surface-overlay text-content-primary ring-border-strong"
                : "bg-surface-raised/70 text-content-secondary ring-border-subtle",
            )}
          >
            Все категории
          </Link>
          {categories.map((category) => (
            <Link
              key={category.slug}
              href={buildHref({ category: category.slug })}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
                params.category === category.slug
                  ? "bg-surface-overlay text-content-primary ring-border-strong"
                  : "bg-surface-raised/70 text-content-secondary ring-border-subtle",
              )}
            >
              {category.icon ? <span>{category.icon}</span> : null}
              {category.name}
              <span className="tabular text-content-muted">{category._count.offers}</span>
            </Link>
          ))}
        </div>
      ) : null}

      {offers.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="Подходящих заданий нет"
          description={
            hasFilters
              ? "Попробуйте убрать часть фильтров — возможно, вы отсекли слишком много."
              : "Новые задания появляются каждый день. Включите уведомления, чтобы не пропустить."
          }
          action={
            hasFilters ? (
              <Button variant="secondary" size="sm" asChild>
                <Link href="/">Сбросить фильтры</Link>
              </Button>
            ) : (
              <Button variant="secondary" size="sm" asChild>
                <Link href="/notifications">Настроить уведомления</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-2.5">
          <p className="text-[12px] text-content-muted">
            Найдено заданий: <span className="tabular font-semibold">{offers.length}</span>
          </p>
          {offers.map((offer) => (
            <div key={offer.id} className="animate-fade-up">
              <OfferCard offer={offer} taken={takenOfferIds.has(offer.id)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

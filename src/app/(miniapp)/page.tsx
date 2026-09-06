import Link from "next/link";
import { Search, SlidersHorizontal, Wallet2 } from "lucide-react";
import type { Difficulty } from "@/generated/prisma";
import { getCurrentUser } from "@/server/auth";
import { getCategoriesWithCounts, listOffers } from "@/server/modules/offers";
import { getWallet } from "@/server/modules/wallet";
import { getUserSubmissions } from "@/server/modules/submissions";
import { db } from "@/server/db";
import { formatMoney } from "@/lib/format";
import {
  ACTIVE_SUBMISSION_STATUSES,
  DIFFICULTY,
  DIFFICULTY_ORDER,
} from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { OfferCard } from "@/components/domain";
import { ActiveWork } from "@/components/active-work";
import { HomeHeader } from "@/components/home-header";
import { ChipScroller } from "@/components/chip-scroller";
import { ChipDot, chipClass } from "@/lib/chips";

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

  const [offers, categories, wallet, activeWork] = await Promise.all([
    listOffers({
      difficulty: difficulty.length ? difficulty : undefined,
      categorySlug: params.category,
      search: params.q,
      sort: params.sort as "reward" | "eta" | "new" | undefined,
    }),
    getCategoriesWithCounts(),
    user ? getWallet(user.id) : null,
    user ? getUserSubmissions(user.id, ACTIVE_SUBMISSION_STATUSES) : [],
  ]);

  // Помечаем в каталоге офферы, по которым у участника уже есть выполнение.
  // «В работе» и «Выполнено» — разные вещи: первое требует действия,
  // второе просто объясняет, почему задание нельзя взять снова.
  const mineByOffer = new Map<string, "active" | "done">();
  if (user) {
    const own = await db.taskSubmission.findMany({
      where: {
        userId: user.id,
        offerId: { in: offers.map((o) => o.id) },
        status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] },
      },
      select: { offerId: true, status: true },
    });
    for (const submission of own) {
      const state = ACTIVE_SUBMISSION_STATUSES.includes(submission.status)
        ? "active"
        : "done";
      // «В работе» приоритетнее: если по офферу есть и активное выполнение,
      // и завершённое, участнику важнее первое.
      if (state === "active" || !mineByOffer.has(submission.offerId)) {
        mineByOffer.set(submission.offerId, state);
      }
    }
  }

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
    <div className="space-y-3">
      <HomeHeader />

      {wallet ? (
        <Link
          href="/profile"
          className="flex items-center gap-3 rounded-card glass-thin px-3 py-2.5 ring-1 ring-inset ring-[var(--acid)]/20 transition-[transform,box-shadow,background] duration-300 ease-soft hover:-translate-y-px active:scale-[0.99]"
        >
          <span className="flex size-9 items-center justify-center rounded-full bg-[var(--acid)]/12 text-[var(--acid)]">
            <Wallet2 className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] tracking-wide text-content-muted uppercase">
              Баланс
            </span>
            <span className="tabular block text-[17px] leading-tight font-bold text-money-400">
              {formatMoney(wallet.available)}
            </span>
          </span>
          <span className="text-[12px] font-medium text-[var(--acid)]">Вывести →</span>
        </Link>
      ) : null}

      <ActiveWork items={activeWork} />

      <div className="space-y-2">
        <h1 className="text-[17px] leading-tight font-bold">
          Задания
          {offers.length > 0 ? (
            <span className="tabular ml-1.5 text-[13px] font-medium text-content-muted">
              {offers.length}
            </span>
          ) : null}
        </h1>

        <form action="/" className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-content-muted" />
          <Input
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Название или бренд"
            className="h-10 pl-10"
          />
          {params.sort ? <input type="hidden" name="sort" value={params.sort} /> : null}
          {params.category ? (
            <input type="hidden" name="category" value={params.category} />
          ) : null}
          {difficulty.map((value) => (
            <input key={value} type="hidden" name="difficulty" value={value} />
          ))}
        </form>

        <ChipScroller>
          {DIFFICULTY_ORDER.map((value) => {
            const active = difficulty.includes(value);
            const meta = DIFFICULTY[value];
            return (
              <Link
                key={value}
                href={toggleDifficultyHref(value)}
                className={chipClass(active, active ? meta.className : undefined)}
              >
                <span className={cn("size-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </Link>
            );
          })}

          <span className="mx-1 w-px shrink-0 self-stretch bg-border-subtle" />

          {SORTS.map((sort) => {
            const active = (params.sort ?? "") === sort.key;
            return (
              <Link
                key={sort.key || "default"}
                href={buildHref({ sort: sort.key || undefined })}
                className={chipClass(active)}
              >
                {active ? (
                  <ChipDot />
                ) : sort.key === "" ? (
                  <SlidersHorizontal className="size-3" />
                ) : null}
                {sort.label}
              </Link>
            );
          })}

          {categories.length > 0 ? (
            <>
              <span className="mx-1 w-px shrink-0 self-stretch bg-border-subtle" />
              <Link
                href={buildHref({ category: undefined })}
                className={chipClass(!params.category)}
              >
                {!params.category ? <ChipDot /> : null}
                Все категории
              </Link>
              {categories.map((category) => {
                const active = params.category === category.slug;
                return (
                  <Link
                    key={category.slug}
                    href={buildHref({ category: category.slug })}
                    className={chipClass(active)}
                  >
                    {active ? <ChipDot /> : null}
                    {category.icon ? <span>{category.icon}</span> : null}
                    {category.name}
                  </Link>
                );
              })}
            </>
          ) : null}
        </ChipScroller>
      </div>

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
        <div className="motion-list grid grid-cols-2 items-start gap-2">
          {offers.map((offer) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              mine={mineByOffer.get(offer.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

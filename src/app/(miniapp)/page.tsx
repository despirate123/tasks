import { Suspense } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, Wallet2 } from "lucide-react";
import type { Difficulty } from "@/generated/prisma";
import { getCurrentUser } from "@/server/auth";
import { getCategoriesWithCounts, listOffers } from "@/server/modules/offers";
import { getWallet } from "@/server/modules/wallet";
import { getUserSubmissions } from "@/server/modules/submissions";
import { db } from "@/server/db";
import { Money } from "@/components/money";
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
import { resolveOfferAccent } from "@/server/offer-accent";
import { ActiveWork } from "@/components/active-work";
import { HomeHeader } from "@/components/home-header";
import { ChipScroller } from "@/components/chip-scroller";
import { ChipDot, chipClass } from "@/lib/chips";
import { HowItWorks } from "@/components/how-it-works";
import {
  HomeCatalogSkeleton,
  HomeHeaderSkeleton,
  HomeWalletSkeleton,
} from "@/components/page-skeleton";

type CatalogOffer = Awaited<ReturnType<typeof listOffers>>["items"][number];

const CATALOG_PAGE = 12;
const REWARD_CHIPS = [
  { key: "", label: "Любая сумма" },
  { key: "0-150", label: "до 150\u00A0₽" },
  { key: "150-400", label: "150–400\u00A0₽" },
  { key: "400", label: "от 400\u00A0₽" },
] as const;

function parseReward(raw?: string): { minReward?: number; maxReward?: number } {
  if (raw === "0-150") return { minReward: 0, maxReward: 150 };
  if (raw === "150-400") return { minReward: 150, maxReward: 400 };
  if (raw === "400") return { minReward: 400 };
  return {};
}

async function HybridCatalog({
  offers,
  mineByOffer,
}: {
  offers: CatalogOffer[];
  mineByOffer: Map<string, "active" | "done">;
}) {
  const hero =
    offers.find((offer) => offer.isHot) ??
    offers.find((offer) => offer.isFeatured) ??
    offers[0];
  const rest = offers.filter((offer) => offer.id !== hero.id);
  const [heroAccent, ...restAccents] = await Promise.all(
    [hero, ...rest].map((offer) =>
      resolveOfferAccent(offer.iconUrl, offer.brandName ?? offer.title),
    ),
  );

  return (
    <div className="motion-list space-y-2">
      <OfferCard
        offer={hero}
        mine={mineByOffer.get(hero.id) ?? null}
        layout="wide"
        accent={heroAccent.color}
      />
      {rest.length > 0 ? (
        <div className="grid grid-cols-2 items-start gap-2">
          {rest.map((offer, index) => (
            <OfferCard
              key={offer.id}
              offer={offer}
              mine={mineByOffer.get(offer.id) ?? null}
              accent={restAccents[index]?.color}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

const SORTS = [
  { key: "", label: "Рекомендуем" },
  { key: "popular", label: "Популярные" },
  { key: "reward", label: "Дороже" },
  { key: "eta", label: "Быстрее" },
  { key: "new", label: "Новые" },
] as const;

type SearchParams = Promise<{
  difficulty?: string | string[];
  category?: string;
  sort?: string;
  q?: string;
  reward?: string;
  take?: string;
  howto?: string;
}>;

type CatalogQuery = Awaited<SearchParams>;

function parseDifficulty(params: CatalogQuery): Difficulty[] {
  const rawDifficulty = Array.isArray(params.difficulty)
    ? params.difficulty
    : params.difficulty
      ? [params.difficulty]
      : [];
  return rawDifficulty.filter((d): d is Difficulty =>
    DIFFICULTY_ORDER.includes(d as Difficulty),
  );
}

async function HomeWalletAndWork() {
  const user = await getCurrentUser();
  if (!user) return null;

  const [wallet, activeWork] = await Promise.all([
    getWallet(user.id),
    getUserSubmissions(user.id, ACTIVE_SUBMISSION_STATUSES),
  ]);

  return (
    <>
      <Link
        href="/profile"
        className="clip-frame flex items-center gap-3 overflow-hidden rounded-card glass-thin px-3 py-2.5 ring-1 ring-inset ring-[var(--acid)]/20 transition-[background] duration-300 ease-soft active:scale-[0.99]"
      >
        <span className="flex size-9 items-center justify-center rounded-full bg-[var(--acid)]/12 text-[var(--acid)]">
          <Wallet2 className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] tracking-wide text-content-muted uppercase">
            Баланс
          </span>
          <span className="block text-[17px] font-bold text-money-400">
            <Money value={wallet.available} />
          </span>
        </span>
        <span className="text-[12px] font-medium text-[var(--acid)]">Вывести →</span>
      </Link>
      <ActiveWork items={activeWork} />
    </>
  );
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  return (
    <div className="space-y-3">
      <Suspense fallback={<HomeHeaderSkeleton />}>
        <HomeHeader />
      </Suspense>
      <Suspense fallback={<HomeWalletSkeleton />}>
        <HomeWalletAndWork />
      </Suspense>
      <Suspense fallback={<HomeCatalogSkeleton />}>
        <HomeCatalog params={params} />
      </Suspense>
    </div>
  );
}

async function HomeCatalog({ params }: { params: CatalogQuery }) {
  const difficulty = parseDifficulty(params);
  const user = await getCurrentUser();
  const reward = parseReward(params.reward);
  const take = Math.min(
    Math.max(Number(params.take) || CATALOG_PAGE, CATALOG_PAGE),
    80,
  );

  const [catalog, categories, own] = await Promise.all([
    listOffers({
      difficulty: difficulty.length ? difficulty : undefined,
      categorySlug: params.category,
      search: params.q,
      sort: params.sort as "reward" | "eta" | "new" | "popular" | undefined,
      take,
      ...reward,
    }),
    getCategoriesWithCounts(),
    user
      ? db.taskSubmission.findMany({
          where: {
            userId: user.id,
            status: { notIn: ["CANCELLED", "EXPIRED", "REJECTED"] },
          },
          select: { offerId: true, status: true },
        })
      : Promise.resolve([]),
  ]);

  // Помечаем в каталоге офферы, по которым у участника уже есть выполнение.
  // «В работе» и «Выполнено» — разные вещи: первое требует действия,
  // второе просто объясняет, почему задание нельзя взять снова.
  const mineByOffer = new Map<string, "active" | "done">();
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

  const offers = catalog.items;
  const hasFilters = Boolean(
    difficulty.length || params.category || params.q || params.sort || params.reward,
  );

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.sort) next.set("sort", params.sort);
    if (params.category) next.set("category", params.category);
    if (params.reward) next.set("reward", params.reward);
    for (const d of difficulty) next.append("difficulty", d);

    for (const [key, value] of Object.entries(patch)) {
      next.delete(key);
      if (value) next.set(key, value);
    }
    next.delete("take");
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };

  const toggleDifficultyHref = (value: Difficulty) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.sort) next.set("sort", params.sort);
    if (params.category) next.set("category", params.category);
    if (params.reward) next.set("reward", params.reward);
    const set = new Set(difficulty);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    for (const d of set) next.append("difficulty", d);
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };

  const moreHref = (() => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (params.sort) next.set("sort", params.sort);
    if (params.category) next.set("category", params.category);
    if (params.reward) next.set("reward", params.reward);
    for (const d of difficulty) next.append("difficulty", d);
    next.set("take", String(take + CATALOG_PAGE));
    return `/?${next.toString()}`;
  })();

  return (
    <>
      <div className="space-y-2">
        <HowItWorks
          defaultOpen={params.howto === "1"}
          title={
            <h1 className="text-[17px] leading-tight font-bold">
              Задания
              {offers.length > 0 ? (
                <span className="tabular ml-1.5 text-[13px] font-medium text-content-muted">
                  {offers.length}
                </span>
              ) : null}
            </h1>
          }
        />

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
          {params.reward ? (
            <input type="hidden" name="reward" value={params.reward} />
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

          <span className="mx-1 w-px shrink-0 self-stretch bg-border-subtle" />
          {REWARD_CHIPS.map((chip) => {
            const active = (params.reward ?? "") === chip.key;
            return (
              <Link
                key={chip.key || "any-reward"}
                href={buildHref({ reward: chip.key || undefined })}
                className={chipClass(active)}
              >
                {active ? <ChipDot /> : null}
                {chip.label}
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
        <>
          <HybridCatalog offers={offers} mineByOffer={mineByOffer} />
          {catalog.hasMore ? (
            <div className="pt-1">
              <Button variant="secondary" size="md" block asChild>
                <Link href={moreHref}>Показать ещё</Link>
              </Button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}

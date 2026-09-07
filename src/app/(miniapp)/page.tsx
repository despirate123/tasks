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
import { HowItWorksAutoOpen, HowItWorksButton } from "@/components/how-it-works";
import {
  HomeCatalogSkeleton,
  HomeHeaderSkeleton,
  HomeWalletSkeleton,
} from "@/components/page-skeleton";
import {
  REWARD_CHIPS,
  firstSearchParam,
  parseRewardFilter,
} from "@/lib/catalog-filters";

type CatalogOffer = Awaited<ReturnType<typeof listOffers>>["items"][number];

const CATALOG_PAGE = 12;

async function CatalogResults({
  offers,
  mineByOffer,
  layout,
}: {
  offers: CatalogOffer[];
  mineByOffer: Map<string, "active" | "done">;
  layout: "hybrid" | "list";
}) {
  const accents = await Promise.all(
    offers.map((offer) =>
      resolveOfferAccent(offer.iconUrl, offer.brandName ?? offer.title),
    ),
  );

  if (layout === "list") {
    return (
      <div className="motion-list space-y-2">
        {offers.map((offer, index) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            mine={mineByOffer.get(offer.id) ?? null}
            layout="wide"
            accent={accents[index]?.color}
          />
        ))}
      </div>
    );
  }

  const heroIndex = Math.max(
    0,
    offers.findIndex((offer) => offer.isHot) >= 0
      ? offers.findIndex((offer) => offer.isHot)
      : offers.findIndex((offer) => offer.isFeatured),
  );
  const hero = offers[heroIndex];
  const rest = offers.filter((offer) => offer.id !== hero.id);

  return (
    <div className="motion-list space-y-2">
      <OfferCard
        offer={hero}
        mine={mineByOffer.get(hero.id) ?? null}
        layout="wide"
        accent={accents[heroIndex]?.color}
      />
      {rest.length > 0 ? (
        <div className="grid grid-cols-2 items-start gap-2">
          {rest.map((offer) => {
            const index = offers.findIndex((item) => item.id === offer.id);
            return (
              <OfferCard
                key={offer.id}
                offer={offer}
                mine={mineByOffer.get(offer.id) ?? null}
                accent={accents[index]?.color}
              />
            );
          })}
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
  category?: string | string[];
  sort?: string | string[];
  q?: string | string[];
  reward?: string | string[];
  take?: string | string[];
  howto?: string | string[];
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
  const rewardKey = firstSearchParam(params.reward);
  const category = firstSearchParam(params.category);
  const sort = firstSearchParam(params.sort);
  const query = firstSearchParam(params.q);
  const howto = firstSearchParam(params.howto);
  const reward = parseRewardFilter(rewardKey);
  const take = Math.min(
    Math.max(Number(firstSearchParam(params.take)) || CATALOG_PAGE, CATALOG_PAGE),
    80,
  );

  const [catalog, categories, own] = await Promise.all([
    listOffers({
      difficulty: difficulty.length ? difficulty : undefined,
      categorySlug: category,
      search: query,
      sort: sort as "reward" | "eta" | "new" | "popular" | undefined,
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
    difficulty.length || category || query || sort || rewardKey,
  );

  const writeBase = (next: URLSearchParams) => {
    if (query) next.set("q", query);
    if (sort) next.set("sort", sort);
    if (category) next.set("category", category);
    if (rewardKey) next.set("reward", rewardKey);
    for (const d of difficulty) next.append("difficulty", d);
  };

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    writeBase(next);
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
    if (query) next.set("q", query);
    if (sort) next.set("sort", sort);
    if (category) next.set("category", category);
    if (rewardKey) next.set("reward", rewardKey);
    const set = new Set(difficulty);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    for (const d of set) next.append("difficulty", d);
    const qs = next.toString();
    return qs ? `/?${qs}` : "/";
  };

  const moreHref = (() => {
    const next = new URLSearchParams();
    writeBase(next);
    next.set("take", String(take + CATALOG_PAGE));
    return `/?${next.toString()}`;
  })();

  return (
    <>
      <div className="space-y-2">
        <HowItWorksAutoOpen active={howto === "1"} />
        <div className="flex items-center justify-between gap-2">
          <h1 className="min-w-0 text-[17px] leading-tight font-bold">
            Задания
            {offers.length > 0 ? (
              <span className="tabular ml-1.5 text-[13px] font-medium text-content-muted">
                {offers.length}
              </span>
            ) : null}
          </h1>
          <HowItWorksButton />
        </div>

        <form action="/" className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-content-muted" />
          <Input
            name="q"
            defaultValue={query ?? ""}
            placeholder="Название или бренд"
            className="h-10 pl-10"
          />
          {sort ? <input type="hidden" name="sort" value={sort} /> : null}
          {category ? <input type="hidden" name="category" value={category} /> : null}
          {rewardKey ? <input type="hidden" name="reward" value={rewardKey} /> : null}
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
                data-chip-active={active || undefined}
                className={chipClass(active, active ? meta.className : undefined)}
              >
                <span className={cn("size-1.5 rounded-full", meta.dot)} />
                {meta.label}
              </Link>
            );
          })}

          <span className="mx-1 w-px shrink-0 self-stretch bg-border-subtle" />

          {SORTS.map((item) => {
            const active = (sort ?? "") === item.key;
            return (
              <Link
                key={item.key || "default"}
                href={buildHref({ sort: item.key || undefined })}
                data-chip-active={active || undefined}
                className={chipClass(active)}
              >
                {active ? (
                  <ChipDot />
                ) : item.key === "" ? (
                  <SlidersHorizontal className="size-3" />
                ) : null}
                {item.label}
              </Link>
            );
          })}

          <span className="mx-1 w-px shrink-0 self-stretch bg-border-subtle" />
          {REWARD_CHIPS.map((chip) => {
            const active =
              (rewardKey ?? "") === chip.key ||
              (chip.key === "to150" && (rewardKey === "0-150" || rewardKey === "lte150")) ||
              (chip.key === "150to400" && rewardKey === "150-400") ||
              (chip.key === "from400" && (rewardKey === "400" || rewardKey === "gte400"));
            return (
              <Link
                key={chip.key || "any-reward"}
                href={buildHref({ reward: chip.key || undefined })}
                data-chip-active={active || undefined}
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
                data-chip-active={!category || undefined}
                className={chipClass(!category)}
              >
                {!category ? <ChipDot /> : null}
                Все категории
              </Link>
              {categories.map((item) => {
                const active = category === item.slug;
                return (
                  <Link
                    key={item.slug}
                    href={buildHref({ category: item.slug })}
                    data-chip-active={active || undefined}
                    className={chipClass(active)}
                  >
                    {active ? <ChipDot /> : null}
                    {item.icon ? <span>{item.icon}</span> : null}
                    {item.name}
                  </Link>
                );
              })}
            </>
          ) : null}
        </ChipScroller>
        {hasFilters ? (
          <p className="text-[12px]">
            <Link href="/" className="font-medium text-[var(--acid)]">
              Сбросить фильтры
            </Link>
          </p>
        ) : null}
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
          <CatalogResults
            offers={offers}
            mineByOffer={mineByOffer}
            layout={hasFilters || offers.length <= 3 ? "list" : "hybrid"}
          />
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

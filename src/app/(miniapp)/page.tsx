import { Suspense } from "react";
import Link from "next/link";
import { Search, Wallet2 } from "lucide-react";
import type { Difficulty } from "@/generated/prisma";
import { getCurrentUser } from "@/server/auth";
import { getCategoriesWithCounts, listCatalogOffers } from "@/server/modules/offers";
import { getWallet } from "@/server/modules/wallet";
import { getActiveWork } from "@/server/modules/submissions";
import { db } from "@/server/db";
import { Money } from "@/components/money";
import { ACTIVE_SUBMISSION_STATUSES, DIFFICULTY, DIFFICULTY_ORDER } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { OfferCard } from "@/components/domain";
import { resolveOfferAccent } from "@/server/offer-accent";
import { ActiveWork } from "@/components/active-work";
import { HomeHeader } from "@/components/home-header";
import {
  HomeCatalogCardsSkeleton,
  HomeCatalogToolbarSkeleton,
  HomeHeaderSkeleton,
  HomeWalletSkeleton,
} from "@/components/page-skeleton";
import { CatalogToolbar } from "@/components/catalog-toolbar";
import {
  CatalogNavProvider,
  CatalogPendingFrame,
  FilterLink,
} from "@/components/catalog-nav";
import {
  firstSearchParam,
  parseRewardFilter,
  rewardFilterLabel,
} from "@/lib/catalog-filters";

export const dynamic = "force-dynamic";

type CatalogOffer = Awaited<ReturnType<typeof listCatalogOffers>>["items"][number];

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
      <div className="catalog-results-fade space-y-2">
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
    <div className="catalog-results-fade space-y-2">
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
    getActiveWork(user.id),
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

async function HomeCatalogChrome() {
  const categories = await getCategoriesWithCounts();
  return (
    <CatalogToolbar
      categories={categories.map((item) => ({
        slug: item.slug,
        name: item.name,
        icon: item.icon,
      }))}
    />
  );
}

async function HomeCatalogResults({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const difficulty = parseDifficulty(params);
  const user = await getCurrentUser();
  const rewardKey = firstSearchParam(params.reward);
  const category = firstSearchParam(params.category);
  const sort = firstSearchParam(params.sort);
  const query = firstSearchParam(params.q);
  const reward = parseRewardFilter(rewardKey);
  const take = Math.min(
    Math.max(Number(firstSearchParam(params.take)) || CATALOG_PAGE, CATALOG_PAGE),
    80,
  );

  const [catalog, own] = await Promise.all([
    listCatalogOffers({
      difficulty: difficulty.length ? difficulty : undefined,
      categorySlug: category,
      search: query,
      sort: sort as "reward" | "eta" | "new" | "popular" | undefined,
      take,
      ...reward,
    }),
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

  const mineByOffer = new Map<string, "active" | "done">();
  for (const submission of own) {
    const state = ACTIVE_SUBMISSION_STATUSES.includes(submission.status)
      ? "active"
      : "done";
    if (state === "active" || !mineByOffer.has(submission.offerId)) {
      mineByOffer.set(submission.offerId, state);
    }
  }

  const offers = catalog.items;
  const hasFilters = Boolean(
    difficulty.length || category || query || sort || rewardKey,
  );

  const moreParams = new URLSearchParams();
  if (query) moreParams.set("q", query);
  if (sort) moreParams.set("sort", sort);
  if (category) moreParams.set("category", category);
  if (rewardKey) moreParams.set("reward", rewardKey);
  for (const value of difficulty) moreParams.append("difficulty", value);
  moreParams.set("take", String(take + CATALOG_PAGE));
  const moreHref = `/?${moreParams.toString()}`;

  if (offers.length === 0) {
    return (
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
              <FilterLink href="/">Сбросить фильтры</FilterLink>
            </Button>
          ) : (
            <Button variant="secondary" size="sm" asChild>
              <Link href="/notifications">Настроить уведомления</Link>
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-content-muted">
        <span>
          {offers.length} шт.
          {rewardFilterLabel(rewardKey) ? ` · ${rewardFilterLabel(rewardKey)}` : ""}
          {difficulty.length
            ? ` · ${difficulty.map((value) => DIFFICULTY[value].label).join(", ")}`
            : ""}
        </span>
        {hasFilters ? (
          <FilterLink href="/" className="font-medium text-[var(--acid)]">
            Сбросить
          </FilterLink>
        ) : null}
      </p>
      <CatalogResults
        offers={offers}
        mineByOffer={mineByOffer}
        layout={hasFilters || offers.length <= 3 ? "list" : "hybrid"}
      />
      {catalog.hasMore ? (
        <div className="pt-1">
          <Button variant="secondary" size="md" block asChild>
            <FilterLink href={moreHref}>Показать ещё</FilterLink>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export default function CatalogPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <CatalogNavProvider>
      <div className="space-y-3">
        <Suspense fallback={<HomeHeaderSkeleton />}>
          <HomeHeader />
        </Suspense>
        <Suspense fallback={<HomeWalletSkeleton />}>
          <HomeWalletAndWork />
        </Suspense>
        <Suspense fallback={<HomeCatalogToolbarSkeleton />}>
          <HomeCatalogChrome />
        </Suspense>
        <CatalogPendingFrame>
          <Suspense fallback={<HomeCatalogCardsSkeleton />}>
            <HomeCatalogResults searchParams={searchParams} />
          </Suspense>
        </CatalogPendingFrame>
      </div>
    </CatalogNavProvider>
  );
}

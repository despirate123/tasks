"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import type { Difficulty } from "@/generated/prisma";
import { DIFFICULTY, DIFFICULTY_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { ChipScroller } from "@/components/chip-scroller";
import { ChipDot, chipClass } from "@/lib/chips";
import { HowItWorksAutoOpen, HowItWorksButton } from "@/components/how-it-works";
import { FilterLink, useCatalogNav } from "@/components/catalog-nav";
import {
  REWARD_CHIPS,
  catalogHref,
  isRewardChipActive,
  rewardFilterLabel,
  toggleDifficultyList,
} from "@/lib/catalog-filters";

const SORTS = [
  { key: "", label: "Рекомендуем" },
  { key: "popular", label: "Популярные" },
  { key: "reward", label: "Дороже" },
  { key: "eta", label: "Быстрее" },
  { key: "new", label: "Новые" },
] as const;

export type CatalogCategory = {
  slug: string;
  name: string;
  icon: string | null;
};

function useCatalogState() {
  const params = useSearchParams();
  const difficulty = params
    .getAll("difficulty")
    .filter((value): value is Difficulty =>
      DIFFICULTY_ORDER.includes(value as Difficulty),
    );
  return {
    q: params.get("q") || undefined,
    sort: params.get("sort") || undefined,
    category: params.get("category") || undefined,
    reward: params.get("reward") || undefined,
    difficulty,
  };
}

export function CatalogToolbar({
  categories,
}: {
  categories: CatalogCategory[];
}) {
  const state = useCatalogState();
  const { navigate } = useCatalogNav();
  const [query, setQuery] = useState(state.q ?? "");
  const howto = useSearchParams().get("howto") === "1";

  useEffect(() => {
    setQuery(state.q ?? "");
  }, [state.q]);

  const hasFilters = Boolean(
    state.difficulty.length || state.category || state.q || state.sort || state.reward,
  );

  return (
    <div className="space-y-2">
      <HowItWorksAutoOpen active={howto} />
      <div className="flex items-center justify-between gap-2">
        <h1 className="min-w-0 text-[17px] leading-tight font-bold">Задания</h1>
        <HowItWorksButton />
      </div>

      <form
        className="relative"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(
            catalogHref(state, { q: query.trim() || undefined }),
          );
        }}
      >
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-content-muted" />
        <Input
          name="q"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Название или бренд"
          className="h-10 pl-10"
        />
      </form>

      <div className="flex flex-wrap gap-2">
        {REWARD_CHIPS.map((chip) => {
          const active = isRewardChipActive(state.reward, chip.key);
          return (
            <FilterLink
              key={chip.key || "any-reward"}
              href={catalogHref(state, { reward: chip.key || undefined })}
              data-chip-active={active || undefined}
              className={chipClass(active)}
            >
              {active ? <ChipDot /> : null}
              {chip.label}
            </FilterLink>
          );
        })}
      </div>

      <ChipScroller>
        {DIFFICULTY_ORDER.map((value) => {
          const active = state.difficulty.includes(value);
          const meta = DIFFICULTY[value];
          return (
            <FilterLink
              key={value}
              href={catalogHref(state, {
                difficulty: toggleDifficultyList(state.difficulty, value),
              })}
              data-chip-active={active || undefined}
              className={chipClass(active, active ? meta.className : undefined)}
            >
              <span className={cn("size-1.5 rounded-full", meta.dot)} />
              {meta.label}
            </FilterLink>
          );
        })}

        <span className="mx-1 w-px shrink-0 self-stretch bg-border-subtle" />

        {SORTS.map((item) => {
          const active = (state.sort ?? "") === item.key;
          return (
            <FilterLink
              key={item.key || "default"}
              href={catalogHref(state, { sort: item.key || undefined })}
              data-chip-active={active || undefined}
              className={chipClass(active)}
            >
              {active ? (
                <ChipDot />
              ) : item.key === "" ? (
                <SlidersHorizontal className="size-3" />
              ) : null}
              {item.label}
            </FilterLink>
          );
        })}

        <span className="mx-1 w-px shrink-0 self-stretch bg-border-subtle" />

        {categories.length > 0 ? (
          <>
            <FilterLink
              href={catalogHref(state, { category: undefined })}
              data-chip-active={!state.category || undefined}
              className={chipClass(!state.category)}
            >
              {!state.category ? <ChipDot /> : null}
              Все категории
            </FilterLink>
            {categories.map((item) => {
              const active = state.category === item.slug;
              return (
                <FilterLink
                  key={item.slug}
                  href={catalogHref(state, { category: item.slug })}
                  data-chip-active={active || undefined}
                  className={chipClass(active)}
                >
                  {active ? <ChipDot /> : null}
                  {item.icon ? <span>{item.icon}</span> : null}
                  {item.name}
                </FilterLink>
              );
            })}
          </>
        ) : null}
      </ChipScroller>

      {hasFilters ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-content-secondary">
          <span>
            {rewardFilterLabel(state.reward)
              ? rewardFilterLabel(state.reward)
              : "Фильтр"}
            {state.difficulty.length
              ? ` · ${state.difficulty.map((value) => DIFFICULTY[value].label).join(", ")}`
              : ""}
            {state.category
              ? ` · ${categories.find((item) => item.slug === state.category)?.name ?? state.category}`
              : ""}
            {state.q ? ` · «${state.q}»` : ""}
          </span>
          <FilterLink href="/" className="font-medium text-[var(--acid)]">
            Сбросить
          </FilterLink>
        </p>
      ) : null}
    </div>
  );
}

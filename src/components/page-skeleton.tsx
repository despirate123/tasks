import { OfferCardSkeleton } from "@/components/domain";
import { Skeleton } from "@/components/ui/misc";

export function HomeHeaderSkeleton() {
  return (
    <div className="flex items-center gap-3 pb-3">
      <Skeleton className="size-12 rounded-full" />
      <div className="ml-auto flex gap-2">
        <Skeleton className="size-10 rounded-full" />
        <Skeleton className="size-10 rounded-full" />
      </div>
    </div>
  );
}

export function HomeWalletSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-14 w-full rounded-card" />
      <Skeleton className="h-12 w-full rounded-card" />
    </div>
  );
}

export function HomeCatalogToolbarSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-10 w-full rounded-2xl" />
      <div className="flex gap-2 overflow-hidden">
        <Skeleton className="h-8 w-20 shrink-0 rounded-pill" />
        <Skeleton className="h-8 w-24 shrink-0 rounded-pill" />
        <Skeleton className="h-8 w-20 shrink-0 rounded-pill" />
      </div>
    </div>
  );
}

export function HomeCatalogCardsSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-[5.5rem] w-full rounded-card" />
      <div className="grid grid-cols-2 gap-2">
        <OfferCardSkeleton />
        <OfferCardSkeleton />
      </div>
    </div>
  );
}

export function HomeCatalogSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="h-10 w-full rounded-2xl" />
      <div className="flex gap-2 overflow-hidden">
        <Skeleton className="h-8 w-20 shrink-0 rounded-pill" />
        <Skeleton className="h-8 w-24 shrink-0 rounded-pill" />
        <Skeleton className="h-8 w-20 shrink-0 rounded-pill" />
      </div>
      <Skeleton className="h-[5.5rem] w-full rounded-card" />
      <div className="grid grid-cols-2 gap-2">
        <OfferCardSkeleton />
        <OfferCardSkeleton />
        <OfferCardSkeleton />
        <OfferCardSkeleton />
      </div>
    </div>
  );
}

export function MiniAppPageSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-[4.5rem] w-full rounded-card" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-12 rounded-2xl" />
        <Skeleton className="h-12 rounded-2xl" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
      </div>
      <Skeleton className="h-40 w-full rounded-card" />
    </div>
  );
}

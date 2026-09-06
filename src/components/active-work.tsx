import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Difficulty, Prisma, SubmissionStatus } from "@/generated/prisma";
import { submissionNextAction } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { OfferAvatar } from "@/components/domain";

const URGENCY: Record<string, number> = {
  NEEDS_REVISION: 0,
  DRAFT: 1,
  IN_REVIEW: 2,
  PENDING_REVIEW: 3,
};

export type ActiveWorkItem = {
  id: string;
  status: SubmissionStatus;
  rewardAmount: Prisma.Decimal | number | string;
  expiresAt: Date | null;
  payoutAvailableAt?: Date | null;
  paidAt?: Date | null;
  reviewedAt?: Date | null;
  submittedAt?: Date | null;
  startedAt: Date;
  offer: {
    title: string;
    brandName: string | null;
    iconUrl: string | null;
    difficulty: Difficulty;
  };
};

function sortByUrgency(items: ActiveWorkItem[]) {
  return [...items].sort(
    (a, b) => (URGENCY[a.status] ?? 9) - (URGENCY[b.status] ?? 9),
  );
}

export function ActiveWork({ items }: { items: ActiveWorkItem[] }) {
  if (items.length === 0) return null;

  const sorted = sortByUrgency(items);
  const top = sorted[0];
  const urgent = top.status === "DRAFT" || top.status === "NEEDS_REVISION";
  const href = items.length === 1 ? `/submissions/${top.id}` : "/my-tasks";
  const preview = sorted.slice(0, 3);

  return (
    <Link
      href={href}
      className="clip-frame flex items-center gap-3 overflow-hidden rounded-card glass-thin px-3 py-2.5 ring-1 ring-inset ring-white/10 transition-[background] duration-300 ease-soft active:scale-[0.99]"
    >
      <span className="flex shrink-0">
        {preview.map((item, index) => (
          <span
            key={item.id}
            className={cn(index > 0 && "-ml-2")}
            style={{ zIndex: preview.length - index }}
          >
            <OfferAvatar
              title={item.offer.brandName ?? item.offer.title}
              iconUrl={item.offer.iconUrl}
              size="sm"
              className="ring-2 ring-[var(--canvas)]"
            />
          </span>
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-semibold">
          В работе · {items.length}
        </span>
        <span
          className={cn(
            "mt-0.5 block truncate text-[12px]",
            urgent ? "text-[var(--acid)]" : "text-content-muted",
          )}
        >
          {submissionNextAction(top.status)}
          {top.offer.brandName ? ` · ${top.offer.brandName}` : ""}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-content-muted" />
    </Link>
  );
}

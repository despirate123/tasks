import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Difficulty, Prisma, SubmissionStatus } from "@/generated/prisma";
import { formatCountdown, formatMoney, formatRelative } from "@/lib/format";
import { submissionNextAction } from "@/lib/labels";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/misc";
import { OfferAvatar, SubmissionStatusBadge } from "@/components/domain";

const PREVIEW_LIMIT = 3;

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

function metaLine(item: ActiveWorkItem) {
  if (item.status === "DRAFT" && item.expiresAt) {
    return `осталось ${formatCountdown(item.expiresAt)}`;
  }
  if (item.status === "PENDING_PAYOUT" && item.payoutAvailableAt) {
    return `зачисление через ${formatCountdown(item.payoutAvailableAt)}`;
  }
  return formatRelative(
    item.paidAt ?? item.reviewedAt ?? item.submittedAt ?? item.startedAt,
  );
}

export function ActiveWork({ items }: { items: ActiveWorkItem[] }) {
  if (items.length === 0) return null;

  const preview = sortByUrgency(items).slice(0, PREVIEW_LIMIT);

  return (
    <div className="space-y-2.5">
      <SectionTitle
        action={
          <Link
            href="/my-tasks"
            className="text-[12px] font-medium text-brand-300 transition-colors duration-300 ease-soft hover:text-brand-50"
          >
            Все мои
          </Link>
        }
      >
        В работе
        <span className="tabular ml-1.5 text-content-muted">{items.length}</span>
      </SectionTitle>

      <Card className="motion-list divide-y divide-border-subtle overflow-hidden">
        {preview.map((item) => {
          const action = submissionNextAction(item.status);
          const urgent =
            item.status === "DRAFT" || item.status === "NEEDS_REVISION";
          return (
            <Link
              key={item.id}
              href={`/submissions/${item.id}`}
              className="flex items-center gap-3 px-3.5 py-3.5 transition-colors duration-300 ease-soft hover:bg-surface-overlay/50 active:bg-surface-overlay"
            >
              <OfferAvatar
                title={item.offer.brandName ?? item.offer.title}
                iconUrl={item.offer.iconUrl}
                size="sm"
              />
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-[13.5px] font-semibold">
                    {item.offer.title}
                  </span>
                  <span className="tabular shrink-0 text-[13.5px] font-bold text-money-400">
                    {formatMoney(item.rewardAmount)}
                  </span>
                </span>
                <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <SubmissionStatusBadge status={item.status} />
                </span>
                <span className="mt-1.5 flex items-center justify-between gap-2 text-[11.5px] text-content-muted">
                  <span>{metaLine(item)}</span>
                  <span
                    className={`inline-flex items-center gap-0.5 ${
                      urgent ? "font-medium text-brand-300" : ""
                    }`}
                  >
                    {action}
                    <ChevronRight className="size-3.5" />
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </Card>
    </div>
  );
}

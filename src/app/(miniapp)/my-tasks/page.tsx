import Link from "next/link";
import { ChevronRight, ListChecks } from "lucide-react";
import type { SubmissionStatus } from "@/generated/prisma";
import { getCurrentUser } from "@/server/auth";
import { getUserSubmissions } from "@/server/modules/submissions";
import { formatCountdown, formatMoney, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { DifficultyBadge, OfferAvatar, SubmissionStatusBadge } from "@/components/domain";

const TABS: { key: string; label: string; statuses: SubmissionStatus[] }[] = [
  {
    key: "active",
    label: "Активные",
    statuses: ["DRAFT", "PENDING_REVIEW", "IN_REVIEW", "NEEDS_REVISION"],
  },
  { key: "payout", label: "Ожидают выплаты", statuses: ["PENDING_PAYOUT"] },
  { key: "paid", label: "Выплачено", statuses: ["PAID"] },
  {
    key: "closed",
    label: "Отклонённые",
    statuses: ["REJECTED", "EXPIRED", "CANCELLED"],
  },
];

export default async function MyTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (!user) {
    return (
      <EmptyState
        icon={<ListChecks />}
        title="Откройте приложение через Telegram"
        description="Мини-приложение работает внутри Telegram — так мы понимаем, кому начислять вознаграждение."
      />
    );
  }

  const tab = TABS.find((t) => t.key === params.tab) ?? TABS[0];
  const all = await getUserSubmissions(user.id);
  const counts = new Map(
    TABS.map((t) => [t.key, all.filter((s) => t.statuses.includes(s.status)).length]),
  );
  const submissions = all.filter((s) => tab.statuses.includes(s.status));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] leading-tight font-bold">Мои задания</h1>
        <p className="mt-1 text-[13px] text-content-secondary">
          Статус каждого выполнения и что от вас требуется дальше.
        </p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        {TABS.map((item) => {
          const active = item.key === tab.key;
          const count = counts.get(item.key) ?? 0;
          return (
            <Link
              key={item.key}
              href={`/my-tasks?tab=${item.key}`}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
                active
                  ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
                  : "bg-surface-raised/70 text-content-secondary ring-border-subtle",
              )}
            >
              {item.label}
              {count > 0 ? <span className="tabular opacity-70">{count}</span> : null}
            </Link>
          );
        })}
      </div>

      {submissions.length === 0 ? (
        <EmptyState
          icon={<ListChecks />}
          title={
            tab.key === "active"
              ? "Активных заданий нет"
              : tab.key === "paid"
                ? "Выплат пока нет"
                : "Здесь пока пусто"
          }
          description={
            tab.key === "active"
              ? "Возьмите задание из каталога — большинство выполняется за несколько минут."
              : "Выполненные задания появятся здесь после проверки модератором."
          }
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/">Смотреть задания</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {submissions.map((submission) => (
            <Link
              key={submission.id}
              href={`/submissions/${submission.id}`}
              className="block animate-fade-up"
            >
              <Card interactive className="p-3.5">
                <div className="flex gap-3">
                  <OfferAvatar
                    title={submission.offer.brandName ?? submission.offer.title}
                    iconUrl={submission.offer.iconUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-[14.5px] leading-snug font-semibold">
                        {submission.offer.title}
                      </p>
                      <p className="tabular shrink-0 text-[14.5px] font-bold text-money-400">
                        {formatMoney(submission.rewardAmount)}
                      </p>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <SubmissionStatusBadge status={submission.status} />
                      <DifficultyBadge difficulty={submission.offer.difficulty} />
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-2 text-[11.5px] text-content-muted">
                      <span>
                        {submission.status === "DRAFT" && submission.expiresAt
                          ? `осталось ${formatCountdown(submission.expiresAt)}`
                          : submission.status === "PENDING_PAYOUT" &&
                              submission.payoutAvailableAt
                            ? `зачисление через ${formatCountdown(submission.payoutAvailableAt)}`
                            : formatRelative(
                                submission.paidAt ??
                                  submission.reviewedAt ??
                                  submission.submittedAt ??
                                  submission.startedAt,
                              )}
                      </span>
                      <span className="inline-flex items-center gap-0.5">
                        {submission.status === "DRAFT"
                          ? "Загрузить пруфы"
                          : submission.status === "NEEDS_REVISION"
                            ? "Доработать"
                            : "Подробнее"}
                        <ChevronRight className="size-3.5" />
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { AlertTriangle, Clock, ImageIcon, ShieldCheck } from "lucide-react";
import { requireRole, displayName } from "@/server/auth";
import { getModerationQueue } from "@/server/modules/submissions";
import {
  formatCountdown,
  formatMoney,
  formatPercent,
  formatRelative,
  plural,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { OfferAvatar, RiskBadge } from "@/components/domain";

export default async function ModerationQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  await requireRole("MODERATOR");
  const params = await searchParams;
  const onlyOverdue = params.filter === "overdue";

  const queue = await getModerationQueue({ onlyOverdue, take: 60 });
  const overdueCount = queue.filter((item) => item.overdue).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[24px] leading-tight font-bold">Модерация</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-content-secondary">
            Сначала просроченные, затем рискованные и дорогие, затем по порядку
            поступления.
          </p>
        </div>
        {queue.length > 0 ? (
          <Button variant="primary" asChild>
            <Link href={`/admin/moderation/${queue[0].id}`}>
              <ShieldCheck />
              Начать проверку
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/moderation"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
            !onlyOverdue
              ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
              : "bg-surface-raised/70 text-content-secondary ring-border-subtle",
          )}
        >
          Вся очередь {queue.length > 0 && !onlyOverdue ? queue.length : ""}
        </Link>
        <Link
          href="/admin/moderation?filter=overdue"
          className={cn(
            "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition",
            onlyOverdue
              ? "bg-hard/12 text-hard ring-hard/25"
              : "bg-surface-raised/70 text-content-secondary ring-border-subtle",
          )}
        >
          <AlertTriangle className="size-3" />
          Просроченные {overdueCount > 0 ? overdueCount : ""}
        </Link>
      </div>

      {queue.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="Очередь пуста"
          description={
            onlyOverdue
              ? "Нарушений SLA нет — все выполнения проверены в заявленный срок."
              : "Все выполнения обработаны. Новые появятся здесь автоматически."
          }
        />
      ) : (
        <div className="space-y-2.5">
          {queue.map((item) => {
            const photos = item.proofs.filter((p) => p.kind === "PHOTO").length;
            const videos = item.proofs.filter((p) => p.kind === "VIDEO").length;
            const total =
              (item.user.stats?.tasksApproved ?? 0) + 0;

            return (
              <Link
                key={item.id}
                href={`/admin/moderation/${item.id}`}
                className="block"
              >
                <Card
                  interactive
                  className={cn(
                    "p-4",
                    item.overdue && "ring-hard/30",
                    item.riskScore >= 50 && !item.overdue && "ring-medium/30",
                  )}
                >
                  <div className="flex flex-wrap items-start gap-3">
                    <OfferAvatar
                      title={item.offer.brandName ?? item.offer.title}
                      iconUrl={item.offer.iconUrl}
                    />

                    <div className="min-w-[13rem] flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14.5px] leading-snug font-semibold">
                          {item.offer.title}
                        </p>
                        {item.overdue ? (
                          <Badge tone="danger">
                            <AlertTriangle className="size-3" />
                            SLA нарушен
                          </Badge>
                        ) : null}
                        <RiskBadge score={item.riskScore} />
                        {item._count.fraudFlags > 0 ? (
                          <Badge tone="warn">
                            {`${item._count.fraudFlags} ${plural(item._count.fraudFlags, "флаг", "флага", "флагов")}`}
                          </Badge>
                        ) : null}
                        {item.status === "IN_REVIEW" && item.reviewer ? (
                          <Badge tone="info">
                            у {item.reviewer.firstName ?? item.reviewer.username}
                          </Badge>
                        ) : null}
                      </div>

                      <p className="mt-1 text-[12px] text-content-muted">
                        {item.publicCode} · {displayName(item.user)}
                        {total > 0
                          ? ` · одобрено ${total}, ${formatPercent(item.user.stats?.approvalRate ?? 0)}`
                          : " · первое задание"}
                      </p>

                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge tone="neutral">
                          <ImageIcon className="size-3" />
                          {photos} фото{videos > 0 ? `, ${videos} видео` : ""}
                        </Badge>
                        {item.comment ? (
                          <Badge tone="neutral">есть комментарий</Badge>
                        ) : null}
                        <Badge tone={item.overdue ? "danger" : "neutral"}>
                          <Clock className="size-3" />
                          {item.overdue
                            ? "просрочено"
                            : `осталось ${formatCountdown(item.reviewDeadlineAt)}`}
                        </Badge>
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="tabular text-[16px] leading-none font-bold text-money-400">
                        {formatMoney(item.rewardAmount)}
                      </p>
                      <p className="mt-1.5 text-[11px] text-content-muted">
                        {item.submittedAt ? formatRelative(item.submittedAt) : "—"}
                      </p>
                    </div>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

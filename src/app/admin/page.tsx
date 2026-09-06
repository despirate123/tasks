import Link from "next/link";
import { AlertTriangle, ArrowRight, Clock, TrendingUp } from "lucide-react";
import { db } from "@/server/db";
import { formatMoney, formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MetricRow, SectionTitle, StatTile } from "@/components/ui/misc";
import { OfferAvatar } from "@/components/domain";

export default async function AdminDashboard() {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 86_400_000);

  const [
    pendingReview,
    overdue,
    pendingPayout,
    payoutQueue,
    payoutSum,
    submittedToday,
    paidToday,
    creditedToday,
    activeOffers,
    recent,
    topOffers,
  ] = await Promise.all([
    db.taskSubmission.count({ where: { status: { in: ["PENDING_REVIEW", "IN_REVIEW"] } } }),
    db.taskSubmission.count({
      where: {
        status: { in: ["PENDING_REVIEW", "IN_REVIEW"] },
        reviewDeadlineAt: { lt: now },
      },
    }),
    db.taskSubmission.count({ where: { status: "PENDING_PAYOUT" } }),
    db.withdrawal.count({ where: { status: "PENDING_REVIEW" } }),
    db.withdrawal.aggregate({
      where: { status: { in: ["PENDING_REVIEW", "APPROVED", "PROCESSING", "SENT"] } },
      _sum: { amountGross: true },
    }),
    db.taskSubmission.count({ where: { submittedAt: { gte: dayAgo } } }),
    db.taskSubmission.count({ where: { paidAt: { gte: dayAgo } } }),
    db.ledgerEntry.aggregate({
      where: { direction: "CREDIT", createdAt: { gte: dayAgo } },
      _sum: { amount: true },
    }),
    db.offer.count({ where: { status: "ACTIVE" } }),
    db.taskSubmission.findMany({
      where: { status: { in: ["PENDING_REVIEW", "IN_REVIEW"] } },
      include: {
        offer: { select: { title: true, brandName: true, iconUrl: true } },
        user: { select: { firstName: true, username: true } },
      },
      orderBy: { submittedAt: "asc" },
      take: 6,
    }),
    db.offer.findMany({
      where: { status: "ACTIVE" },
      orderBy: { takenCount: "desc" },
      take: 5,
      select: {
        id: true,
        title: true,
        brandName: true,
        iconUrl: true,
        takenCount: true,
        approvedCount: true,
        rejectedCount: true,
        rewardAmount: true,
        approvalEtaMinutes: true,
        actualEtaMinutes: true,
      },
    }),
  ]);

  // Офферы, где заявленное время одобрения расходится с фактом больше чем
  // в два раза — прямой источник претензий пользователей.
  const etaMismatch = topOffers.filter(
    (o) => o.actualEtaMinutes && o.actualEtaMinutes > o.approvalEtaMinutes * 2,
  );

  const dailyCredited = formatMoney(creditedToday._sum.amount ?? 0);
  const payoutHint = `${formatMoney(payoutSum._sum.amountGross ?? 0)} в обработке`;
  const reviewHint = overdue > 0 ? `${overdue} просрочено` : "в пределах SLA";

  return (
    <div className="motion-page min-w-0 space-y-4 sm:space-y-5">
      <div>
        <h1 className="text-[20px] leading-tight font-bold sm:text-[24px]">Дашборд</h1>
        <p className="mt-1 text-[13px] text-content-secondary">
          Что требует внимания прямо сейчас.
        </p>
      </div>

      {overdue > 0 ? (
        <Link href="/admin/moderation?filter=overdue" className="block min-w-0">
          <div className="flex items-center gap-2.5 rounded-card bg-hard/10 p-3 ring-1 ring-inset ring-hard/25 sm:gap-3 sm:p-4">
            <AlertTriangle className="size-5 shrink-0 text-hard" />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-hard">
                Нарушен SLA у {overdue}{" "}
                {overdue === 1 ? "выполнения" : "выполнений"}
              </p>
              <p className="mt-0.5 hidden text-[12.5px] leading-relaxed text-content-secondary min-[380px]:block">
                Заявленное время одобрения истекло — пользователи ждут дольше
                обещанного.
              </p>
            </div>
            <ArrowRight className="size-4 shrink-0 text-hard" />
          </div>
        </Link>
      ) : null}

      <Card className="divide-y divide-border-subtle overflow-hidden sm:hidden">
        <MetricRow label="На модерации" value={pendingReview} hint={reviewHint} />
        <MetricRow label="Ожидают выплаты" value={pendingPayout} hint="в холде" />
        <MetricRow label="Заявок на вывод" value={payoutQueue} hint={payoutHint} />
        <MetricRow label="Активных офферов" value={activeOffers} />
        <MetricRow label="Отправлено за сутки" value={submittedToday} />
        <MetricRow label="Оплачено за сутки" value={paidToday} />
        <MetricRow label="Начислено за сутки" value={dailyCredited} />
      </Card>

      <div className="motion-list hidden grid-cols-2 gap-2.5 sm:grid lg:grid-cols-4">
        <StatTile
          label="На модерации"
          value={pendingReview}
          hint={reviewHint}
          tone={overdue > 0 ? "warn" : "default"}
        />
        <StatTile
          label="Ожидают выплаты"
          value={pendingPayout}
          hint="в холде"
        />
        <StatTile
          label="Заявок на вывод"
          value={payoutQueue}
          hint={payoutHint}
          tone={payoutQueue > 0 ? "brand" : "default"}
        />
        <StatTile label="Активных офферов" value={activeOffers} />
      </div>

      <div className="motion-list hidden grid-cols-3 gap-2.5 sm:grid">
        <StatTile label="Отправлено за сутки" value={submittedToday} />
        <StatTile label="Оплачено за сутки" value={paidToday} tone="money" />
        <StatTile label="Начислено за сутки" value={dailyCredited} tone="money" />
      </div>

      {etaMismatch.length > 0 ? (
        <div className="space-y-2.5">
          <SectionTitle>Заявленное время одобрения расходится с фактом</SectionTitle>
          <Card className="motion-list divide-y divide-border-subtle">
            {etaMismatch.map((offer) => (
              <Link
                key={offer.id}
                href={`/admin/offers/${offer.id}`}
                className="flex items-center gap-3 p-3.5 transition-colors duration-300 ease-soft hover:bg-surface-overlay/40"
              >
                <Clock className="size-4 shrink-0 text-medium" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{offer.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-content-muted">
                    заявлено {Math.round(offer.approvalEtaMinutes / 60)} ч, фактически{" "}
                    {Math.round((offer.actualEtaMinutes ?? 0) / 60)} ч
                  </p>
                </div>
                <Badge tone="warn">поправить</Badge>
              </Link>
            ))}
          </Card>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-2.5">
          <SectionTitle
            action={
              <Link
                href="/admin/moderation"
                className="text-[12px] font-medium text-brand-300"
              >
                Вся очередь
              </Link>
            }
          >
            Очередь модерации
          </SectionTitle>
          {recent.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="text-[13px] text-content-secondary">
                Очередь пуста — все выполнения обработаны.
              </p>
            </Card>
          ) : (
            <Card className="motion-list divide-y divide-border-subtle">
              {recent.map((submission) => (
                <Link
                  key={submission.id}
                  href={`/admin/moderation/${submission.id}`}
                  className="flex min-w-0 items-center gap-2.5 p-3 transition-colors duration-300 ease-soft hover:bg-surface-overlay/40 sm:gap-3 sm:p-3.5"
                >
                  <OfferAvatar
                    title={submission.offer.brandName ?? submission.offer.title}
                    iconUrl={submission.offer.iconUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">
                      {submission.offer.title}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-content-muted">
                      {submission.publicCode} ·{" "}
                      {submission.submittedAt
                        ? formatRelative(submission.submittedAt)
                        : "—"}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-[13px] font-semibold text-money-400">
                      {formatMoney(submission.rewardAmount)}
                    </p>
                    {submission.reviewDeadlineAt &&
                    submission.reviewDeadlineAt < now ? (
                      <Badge tone="danger" className="mt-0.5">
                        просрочено
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </div>

        <div className="space-y-2.5">
          <SectionTitle>Популярные офферы</SectionTitle>
          <Card className="motion-list divide-y divide-border-subtle">
            {topOffers.map((offer) => {
              const total = offer.approvedCount + offer.rejectedCount;
              const rate = total > 0 ? Math.round((offer.approvedCount / total) * 100) : null;
              return (
                <Link
                  key={offer.id}
                  href={`/admin/offers/${offer.id}`}
                  className="flex min-w-0 items-center gap-2.5 p-3 transition-colors duration-300 ease-soft hover:bg-surface-overlay/40 sm:gap-3 sm:p-3.5"
                >
                  <OfferAvatar
                    title={offer.brandName ?? offer.title}
                    iconUrl={offer.iconUrl}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium">{offer.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-content-muted">
                      взято {offer.takenCount}
                      {rate != null ? ` · одобрение ${rate} %` : ""}
                    </p>
                  </div>
                  <TrendingUp className="size-4 shrink-0 text-content-muted" />
                </Link>
              );
            })}
          </Card>
        </div>
      </div>
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { formatCrypto, formatDateTime, formatMoney } from "@/lib/format";
import { PAYOUT_METHOD, WITHDRAWAL_STATUS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailRow, SectionTitle, Separator } from "@/components/ui/misc";
import { WithdrawalStatusBadge } from "@/components/domain";
import { CopyValue } from "@/components/copy-value";
import { CancelWithdrawalButton } from "@/components/cancel-withdrawal-button";

export default async function WithdrawalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const withdrawal = await db.withdrawal.findFirst({
    where: { id, userId: user.id },
    include: { events: { orderBy: { createdAt: "desc" } } },
  });
  if (!withdrawal) notFound();

  const meta = WITHDRAWAL_STATUS[withdrawal.status];
  const method = PAYOUT_METHOD[withdrawal.methodKind];
  const snapshot = (withdrawal.methodSnapshot ?? {}) as {
    masked?: string;
    network?: string;
  };

  return (
    <div className="space-y-4">
      <Link href="/profile" className="back-nav">
        <ArrowLeft className="size-4" />
        Профиль
      </Link>

      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-content-secondary">
            <ArrowUpRight className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-content-muted">
              {withdrawal.publicCode}
            </p>
            <p className="tabular mt-0.5 text-[22px] font-bold leading-none text-money-400">
              {formatMoney(withdrawal.amountGross)}
            </p>
          </div>
          <WithdrawalStatusBadge status={withdrawal.status} />
        </div>

        <Separator className="my-3.5" />
        <p className="text-[13px] leading-relaxed text-content-secondary">{meta.hint}</p>

        {withdrawal.status === "PENDING_REVIEW" ? (
          <div className="mt-3">
            <CancelWithdrawalButton id={withdrawal.id} label="Отменить заявку" />
          </div>
        ) : null}
      </Card>

      <div className="space-y-2.5">
        <SectionTitle>Детали</SectionTitle>
        <Card className="divide-y divide-border-subtle px-4 py-1">
          <DetailRow label="Куда" value={`${method.short} · ${snapshot.masked ?? "—"}`} />
          <DetailRow label="Комиссия" value={formatMoney(withdrawal.fee)} />
          <DetailRow
            label="К получению"
            value={
              withdrawal.payoutCurrency === "USDT" && withdrawal.cryptoAmount
                ? formatCrypto(withdrawal.cryptoAmount)
                : formatMoney(withdrawal.amountNet)
            }
          />
          {withdrawal.fxRate ? (
            <DetailRow
              label="Курс"
              value={`1 USDT = ${Number(withdrawal.fxRate).toFixed(2)}\u00A0₽`}
            />
          ) : null}
          <DetailRow label="Создана" value={formatDateTime(withdrawal.requestedAt)} />
          {withdrawal.completedAt ? (
            <DetailRow label="Закрыта" value={formatDateTime(withdrawal.completedAt)} />
          ) : null}
        </Card>
      </div>

      {withdrawal.txHash ? (
        <CopyValue
          label="Хеш транзакции"
          value={withdrawal.txHash}
          hint="Можно проверить в обозревателе сети."
        />
      ) : null}

      {withdrawal.providerRef && !withdrawal.txHash ? (
        <CopyValue label="Номер перевода" value={withdrawal.providerRef} />
      ) : null}

      {withdrawal.failureReason || withdrawal.reviewComment ? (
        <div
          className={
            withdrawal.status === "REJECTED" || withdrawal.status === "FAILED"
              ? "rounded-card bg-hard/8 p-3.5 ring-1 ring-inset ring-hard/20"
              : "rounded-card bg-surface-raised p-3.5 ring-1 ring-inset ring-border-subtle"
          }
        >
          <p
            className={
              withdrawal.status === "REJECTED" || withdrawal.status === "FAILED"
                ? "text-[13px] font-semibold text-hard"
                : "text-[13px] font-semibold"
            }
          >
            {withdrawal.status === "REJECTED" ? "Почему отклонили" : "Комментарий"}
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-content-secondary">
            {withdrawal.failureReason ?? withdrawal.reviewComment}
          </p>
        </div>
      ) : null}

      {withdrawal.events.length > 0 ? (
        <div className="space-y-2.5">
          <SectionTitle>История заявки</SectionTitle>
          <Card className="p-4">
            <ol className="space-y-3.5">
              {withdrawal.events.map((event) => (
                <li key={event.id}>
                  <div className="flex flex-wrap items-center gap-2">
                    {event.toStatus ? (
                      <Badge tone="neutral">{WITHDRAWAL_STATUS[event.toStatus].label}</Badge>
                    ) : null}
                    <span className="text-[11px] text-content-muted">
                      {formatDateTime(event.createdAt)}
                    </span>
                  </div>
                  {event.comment ? (
                    <p className="mt-1 text-[12.5px] leading-relaxed text-content-secondary">
                      {event.comment}
                    </p>
                  ) : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      ) : null}

      <Link
        href="/profile/withdraw"
        className="block text-center text-[13px] font-medium text-brand-300"
      >
        К форме вывода
      </Link>
    </div>
  );
}

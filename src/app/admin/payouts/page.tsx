import Link from "next/link";
import { AlertTriangle, Banknote } from "lucide-react";
import { displayName, requireRole } from "@/server/auth";
import { getPayoutQueue } from "@/server/modules/withdrawals";
import {
  formatCrypto,
  formatDate,
  formatMoney,
  formatRelative,
  plural,
} from "@/lib/format";
import { PAYOUT_METHOD } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, SectionTitle, StatTile } from "@/components/ui/misc";
import { WithdrawalStatusBadge } from "@/components/domain";
import { PayoutActions } from "./payout-actions";

export default async function AdminPayoutsPage() {
  await requireRole("MODERATOR");
  const queue = await getPayoutQueue();

  const pendingReview = queue.filter((w) => w.status === "PENDING_REVIEW");
  const inFlight = queue.filter((w) =>
    ["APPROVED", "PROCESSING", "SENT"].includes(w.status),
  );
  const totalPending = pendingReview.reduce(
    (sum, w) => sum + Number(w.amountGross),
    0,
  );
  const totalInFlight = inFlight.reduce((sum, w) => sum + Number(w.amountGross), 0);

  return (
    <div className="motion-page space-y-5">
      <div>
        <h1 className="text-[24px] leading-tight font-bold">Выплаты</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-content-secondary">
          Средства уже заморожены на балансе участника. Отказ и техническая
          ошибка возвращают их автоматически.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile label="На проверке" value={pendingReview.length} />
        <StatTile
          label="Сумма к проверке"
          value={formatMoney(totalPending)}
          tone="brand"
        />
        <StatTile label="В отправке" value={inFlight.length} />
        <StatTile
          label="Сумма в отправке"
          value={formatMoney(totalInFlight)}
          tone="warn"
        />
      </div>

      {queue.length === 0 ? (
        <EmptyState
          icon={<Banknote />}
          title="Заявок на выплату нет"
          description="Новые заявки появятся здесь сразу после создания участником."
        />
      ) : (
        <div className="space-y-5">
          {pendingReview.length > 0 ? (
            <div className="space-y-2.5">
              <SectionTitle>Требуют решения</SectionTitle>
              <div className="space-y-2.5">
                {pendingReview.map((w) => (
                  <PayoutRow key={w.id} withdrawal={w} />
                ))}
              </div>
            </div>
          ) : null}

          {inFlight.length > 0 ? (
            <div className="space-y-2.5">
              <SectionTitle>В процессе отправки</SectionTitle>
              <div className="space-y-2.5">
                {inFlight.map((w) => (
                  <PayoutRow key={w.id} withdrawal={w} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

type QueueItem = Awaited<ReturnType<typeof getPayoutQueue>>[number];

function PayoutRow({ withdrawal: w }: { withdrawal: QueueItem }) {
  const antifraud = w.antifraud as {
    flags?: string[];
    accountAgeHours?: number;
    rejectRatePercent?: number;
    paidTasks?: number;
  } | null;
  const flags = antifraud?.flags ?? [];
  const meta = PAYOUT_METHOD[w.methodKind];
  const snapshot = w.methodSnapshot as { masked?: string; holderName?: string } | null;

  return (
    <Card className={flags.length > 0 ? "p-4 ring-medium/30" : "p-4"}>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[12px] text-content-muted">
              {w.publicCode}
            </span>
            <WithdrawalStatusBadge status={w.status} />
            <Badge tone="neutral">{meta.short}</Badge>
            {flags.length > 0 ? (
              <Badge tone="warn">
                <AlertTriangle className="size-3" />
                {`${flags.length} ${plural(flags.length, "флаг", "флага", "флагов")}`}
              </Badge>
            ) : null}
          </div>

          <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="tabular text-[20px] leading-none font-bold text-money-400">
              {formatMoney(w.amountGross)}
            </p>
            <p className="text-[12.5px] text-content-secondary">
              к получению{" "}
              <span className="tabular font-semibold text-content-primary">
                {w.payoutCurrency === "USDT" && w.cryptoAmount
                  ? formatCrypto(w.cryptoAmount)
                  : formatMoney(w.amountNet)}
              </span>
              {Number(w.fee) > 0 ? ` · комиссия ${formatMoney(w.fee)}` : ""}
              {w.fxRate ? ` · курс ${Number(w.fxRate).toFixed(2)} ₽` : ""}
            </p>
          </div>

          <p className="mt-2 font-mono text-[12.5px]">
            {snapshot?.masked ?? "реквизиты не сохранены"}
            {snapshot?.holderName ? (
              <span className="ml-2 font-sans text-content-muted">
                {snapshot.holderName}
              </span>
            ) : null}
            {w.network ? (
              <span className="ml-2 font-sans text-content-muted">{w.network}</span>
            ) : null}
          </p>

          <p className="mt-2 text-[12px] text-content-muted">
            <Link
              href={`/admin/users?q=${w.user.telegramId}`}
              className="hover:text-brand-300"
            >
              {displayName(w.user)}
            </Link>
            {" · "}с {formatDate(w.user.createdAt)} · риск {w.user.riskScore} ·
            выполнено {antifraud?.paidTasks ?? 0} · заявка{" "}
            {formatRelative(w.requestedAt)}
          </p>

          {flags.length > 0 ? (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {flags.map((flag) => (
                <Badge key={flag} tone="warn">
                  {FLAG_LABELS[flag] ?? flag}
                </Badge>
              ))}
            </div>
          ) : null}

          {w.txHash ? (
            <p className="mt-2.5 font-mono text-[11.5px] break-all text-content-muted">
              tx: {w.txHash}
            </p>
          ) : null}

          {w.failureReason ? (
            <p className="mt-2 text-[12px] text-hard">{w.failureReason}</p>
          ) : null}
        </div>

        <PayoutActions
          withdrawalId={w.id}
          status={w.status}
          isCrypto={w.payoutCurrency === "USDT"}
        />
      </div>
    </Card>
  );
}

const FLAG_LABELS: Record<string, string> = {
  account_younger_than_24h: "аккаунт младше суток",
  high_reject_rate: "много отказов",
  high_risk_score: "высокий риск-скор",
  no_paid_tasks: "нет оплаченных заданий",
};

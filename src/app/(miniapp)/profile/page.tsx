import Link from "next/link";
import {
  ArrowUpRight,
  BellRing,
  CheckCircle2,
  History,
  LifeBuoy,
  ShieldCheck,
  Wallet2,
} from "lucide-react";
import { displayName, getCurrentUser, hasRole } from "@/server/auth";
import { getTransactions, getWallet } from "@/server/modules/wallet";
import { getUserWithdrawals } from "@/server/modules/withdrawals";
import { db } from "@/server/db";
import { formatDate, formatMoney, formatPercent, formatRelative } from "@/lib/format";
import { LEDGER_TYPE, USER_STATUS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, SectionTitle, StatTile } from "@/components/ui/misc";
import {
  BalanceCard,
  LinkRow,
  MoneyDelta,
  OfferAvatar,
  WithdrawalStatusBadge,
} from "@/components/domain";
import { CancelWithdrawalButton } from "@/components/cancel-withdrawal-button";

export default async function ProfilePage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <EmptyState
        icon={<Wallet2 />}
        title="Откройте приложение через Telegram"
        description="Баланс и история привязаны к вашему Telegram-аккаунту."
      />
    );
  }

  const [wallet, transactions, withdrawals, stats] = await Promise.all([
    getWallet(user.id),
    getTransactions(user.id, { take: 8 }),
    getUserWithdrawals(user.id),
    db.userStats.findUnique({ where: { userId: user.id } }),
  ]);

  const activeWithdrawals = withdrawals.filter((w) =>
    ["PENDING_REVIEW", "APPROVED", "PROCESSING", "SENT"].includes(w.status),
  );
  const canWithdraw = Number(wallet.available) > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="[view-transition-name:profile-avatar]">
          <OfferAvatar
            title={displayName(user)}
            iconUrl={user.photoUrl}
            size="lg"
            shape="circle"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] leading-tight font-bold">
            {displayName(user)}
          </h1>
          <p className="mt-0.5 text-[12.5px] text-content-muted">
            {user.username ? `@${user.username} · ` : ""}с {formatDate(user.createdAt)}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {user.status !== "ACTIVE" ? (
              <span
                className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${USER_STATUS[user.status].className}`}
              >
                {USER_STATUS[user.status].label}
              </span>
            ) : null}
            {hasRole(user, "MODERATOR") ? (
              <Badge tone="brand">
                <ShieldCheck className="size-3" />
                Персонал
              </Badge>
            ) : null}
          </div>
        </div>
      </div>

      {user.status === "LIMITED" && user.statusReason ? (
        <div className="rounded-card bg-medium/8 p-3.5 ring-1 ring-inset ring-medium/20">
          <p className="text-[13px] font-semibold text-medium">Аккаунт ограничен</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-content-secondary">
            {user.statusReason} Вывод средств доступен, новые задания — нет.
          </p>
        </div>
      ) : null}

      <BalanceCard
        available={wallet.available}
        pending={wallet.pending}
        hold={wallet.hold}
      />

      <div className="grid grid-cols-2 gap-2">
        <Button variant="money" size="lg" asChild disabled={!canWithdraw}>
          <Link href="/profile/withdraw">
            <ArrowUpRight />
            Вывести
          </Link>
        </Button>
        <Button variant="secondary" size="lg" asChild>
          <Link href="/profile/history">
            <History />
            История
          </Link>
        </Button>
      </div>

      {!canWithdraw ? (
        <p className="px-1 text-center text-[12px] text-content-muted">
          Выполните задание, чтобы появились средства для вывода.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <StatTile
          label="Выполнено"
          value={stats?.tasksApproved ?? 0}
          hint={
            stats && stats.tasksSubmitted > 0
              ? `из ${stats.tasksSubmitted} отправленных`
              : undefined
          }
        />
        <StatTile
          label="Заработано"
          value={formatMoney(wallet.totalEarned)}
          tone="money"
        />
        <StatTile
          label="Выведено"
          value={formatMoney(wallet.totalWithdrawn)}
        />
        <StatTile
          label="Одобрение"
          value={
            stats && stats.tasksApproved + stats.tasksRejected > 0
              ? formatPercent(
                  (stats.tasksApproved / (stats.tasksApproved + stats.tasksRejected)) *
                    100,
                )
              : "—"
          }
          tone="brand"
        />
      </div>

      {activeWithdrawals.length > 0 ? (
        <div className="space-y-2.5">
          <SectionTitle>Заявки на вывод</SectionTitle>
          <Card className="divide-y divide-border-subtle">
            {activeWithdrawals.map((w) => (
              <div key={w.id} className="flex items-center gap-3 p-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-content-secondary">
                  <ArrowUpRight className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="tabular text-[13.5px] font-semibold">
                    {formatMoney(w.amountGross)}
                    {w.payoutCurrency === "USDT" && w.cryptoAmount
                      ? ` → ${Number(w.cryptoAmount).toFixed(2)} USDT`
                      : ""}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-content-muted">
                    {(w.methodSnapshot as { masked?: string })?.masked ?? w.methodKind} ·{" "}
                    {formatRelative(w.requestedAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <WithdrawalStatusBadge status={w.status} />
                  {w.status === "PENDING_REVIEW" ? (
                    <CancelWithdrawalButton id={w.id} />
                  ) : null}
                </div>
              </div>
            ))}
          </Card>
        </div>
      ) : null}

      <div className="space-y-2.5">
        <SectionTitle
          action={
            <Link
              href="/profile/history"
              className="text-[12px] font-medium text-brand-300"
            >
              Все операции
            </Link>
          }
        >
          Последние операции
        </SectionTitle>

        {transactions.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[13px] text-content-secondary">
              Операций пока нет. Первое начисление появится после одобрения задания.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-border-subtle">
            {transactions.slice(0, 8).map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 p-3.5">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
                    entry.direction === "CREDIT"
                      ? "bg-money-500/12 text-money-400"
                      : "bg-surface-overlay text-content-secondary"
                  }`}
                >
                  <CheckCircle2 className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">
                    {/* Название оффера показываем только для собственного
                        вознаграждения. У реферального бонуса тот же
                        submissionId, но задание выполнял другой участник —
                        подпись «за задание X» выглядела бы как двойное
                        начисление. */}
                    {entry.type === "TASK_REWARD" && entry.submission
                      ? entry.submission.offer.title
                      : LEDGER_TYPE[entry.type]}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-content-muted">
                    {formatRelative(entry.createdAt)}
                  </p>
                </div>
                <MoneyDelta amount={entry.amount} direction={entry.direction} />
              </div>
            ))}
          </Card>
        )}
      </div>

      <Card className="divide-y divide-border-subtle overflow-hidden">
        <LinkRow
          href="/profile/withdraw"
          icon={<Wallet2 />}
          title="Реквизиты для выплат"
          subtitle="Карта, СБП, USDT"
        />
        <LinkRow
          href="/notifications"
          icon={<BellRing />}
          title="Уведомления"
          subtitle="История и настройки"
        />
        <LinkRow
          href="/referrals"
          icon={<LifeBuoy />}
          title="Пригласить друзей"
          subtitle={
            stats?.referralsTotal
              ? `${stats.referralsTotal} приглашено`
              : "10 % с заработка друга"
          }
        />
      </Card>

      <p className="px-1 pb-2 text-center text-[11px] text-content-muted">
        ID для поддержки: {user.telegramId.toString()}
      </p>
    </div>
  );
}

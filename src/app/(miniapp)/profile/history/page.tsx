import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { getTransactions } from "@/server/modules/wallet";
import { formatDateTime, formatMoney } from "@/lib/format";
import { LEDGER_TYPE } from "@/lib/labels";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { MoneyDelta } from "@/components/domain";

export default async function HistoryPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <EmptyState title="Откройте приложение через Telegram" />;
  }

  const transactions = await getTransactions(user.id, { take: 100 });

  return (
    <div className="space-y-4">
      <Link
        href="/profile"
        className="inline-flex items-center gap-1.5 text-[13px] text-content-secondary transition hover:text-content-primary"
      >
        <ArrowLeft className="size-4" />
        Профиль
      </Link>

      <div>
        <h1 className="text-[22px] leading-tight font-bold">История операций</h1>
        <p className="mt-1 text-[13px] text-content-secondary">
          Каждое движение средств с балансом после операции.
        </p>
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="Операций пока нет"
          description="Здесь появятся начисления за задания, реферальные бонусы и выводы."
        />
      ) : (
        <Card className="divide-y divide-border-subtle">
          {transactions.map((entry) => (
            <div key={entry.id} className="p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium">
                    {LEDGER_TYPE[entry.type]}
                  </p>
                  {entry.submission?.offer.title ? (
                    <p className="mt-0.5 truncate text-[12px] text-content-secondary">
                      {entry.submission.offer.title}
                    </p>
                  ) : entry.description ? (
                    <p className="mt-0.5 truncate text-[12px] text-content-secondary">
                      {entry.description}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-content-muted">
                    {formatDateTime(entry.createdAt)}
                    {entry.submission?.publicCode
                      ? ` · ${entry.submission.publicCode}`
                      : entry.withdrawal?.publicCode
                        ? ` · ${entry.withdrawal.publicCode}`
                        : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <MoneyDelta amount={entry.amount} direction={entry.direction} />
                  <p className="tabular mt-0.5 text-[11px] text-content-muted">
                    баланс {formatMoney(entry.balanceAfter)}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}

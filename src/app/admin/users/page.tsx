import Link from "next/link";
import { Search } from "lucide-react";
import { displayName, requireRole } from "@/server/auth";
import { db } from "@/server/db";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { USER_ROLE, USER_STATUS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { OfferAvatar, RiskBadge } from "@/components/domain";
import { UserActions } from "./user-actions";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const actor = await requireRole("MODERATOR");
  const params = await searchParams;
  const query = params.q?.trim();

  const numericQuery = query && /^\d+$/.test(query) ? BigInt(query) : null;

  const users = await db.user.findMany({
    where: query
      ? {
          OR: [
            ...(numericQuery ? [{ telegramId: numericQuery }] : []),
            { username: { contains: query, mode: "insensitive" } },
            { firstName: { contains: query, mode: "insensitive" } },
            { lastName: { contains: query, mode: "insensitive" } },
            { referralCode: query.toUpperCase() },
          ],
        }
      : undefined,
    include: {
      stats: true,
      wallets: { where: { currency: "RUB" } },
      _count: { select: { submissions: true, withdrawals: true, referrals: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  const canManage = ["FINANCE", "ADMIN", "OWNER"].includes(actor.role);

  return (
    <div className="motion-page space-y-5">
      <div>
        <h1 className="text-[24px] leading-tight font-bold">Пользователи</h1>
        <p className="mt-1 text-[13px] text-content-secondary">
          Поиск по Telegram ID, username, имени или реферальному коду.
        </p>
      </div>

      <form action="/admin/users" className="flex max-w-md gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-content-muted" />
          <Input
            name="q"
            defaultValue={query ?? ""}
            placeholder="777000001 или @username"
            className="pl-10"
          />
        </div>
        <Button type="submit" variant="secondary">
          Найти
        </Button>
      </form>

      {users.length === 0 ? (
        <EmptyState
          title="Никого не найдено"
          description="Проверьте запрос — поиск идёт по точному Telegram ID или части имени."
        />
      ) : (
        <div className="space-y-2.5">
          {users.map((user) => {
            const wallet = user.wallets[0];
            const stats = user.stats;
            const decided = (stats?.tasksApproved ?? 0) + (stats?.tasksRejected ?? 0);

            return (
              <Card key={user.id} className="p-4">
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
                  <div className="flex gap-3">
                    <OfferAvatar
                      title={displayName(user)}
                      iconUrl={user.photoUrl}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14.5px] font-semibold">
                          {displayName(user)}
                        </p>
                        <span
                          className={`inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${USER_STATUS[user.status].className}`}
                        >
                          {USER_STATUS[user.status].label}
                        </span>
                        {user.role !== "USER" ? (
                          <Badge tone="brand">{USER_ROLE[user.role]}</Badge>
                        ) : null}
                        <RiskBadge score={user.riskScore} />
                      </div>

                      <p className="mt-1 text-[12px] text-content-muted">
                        ID {user.telegramId.toString()}
                        {user.username ? ` · @${user.username}` : ""} · с{" "}
                        {formatDate(user.createdAt)} · код {user.referralCode}
                      </p>

                      {user.statusReason ? (
                        <p className="mt-1 text-[12px] text-medium">
                          {user.statusReason}
                        </p>
                      ) : null}

                      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-content-secondary">
                        <span>
                          баланс{" "}
                          <span className="tabular font-semibold text-money-400">
                            {formatMoney(wallet?.available ?? 0)}
                          </span>
                        </span>
                        {Number(wallet?.pending ?? 0) > 0 ? (
                          <span>
                            в холде{" "}
                            <span className="tabular font-medium">
                              {formatMoney(wallet?.pending ?? 0)}
                            </span>
                          </span>
                        ) : null}
                        <span>
                          заработано{" "}
                          <span className="tabular font-medium">
                            {formatMoney(wallet?.totalEarned ?? 0)}
                          </span>
                        </span>
                        <span>выполнений {user._count.submissions}</span>
                        <span>выплат {user._count.withdrawals}</span>
                        <span>рефералов {user._count.referrals}</span>
                        {decided > 0 ? (
                          <span>
                            одобрение{" "}
                            {formatPercent(
                              ((stats?.tasksApproved ?? 0) / decided) * 100,
                            )}
                          </span>
                        ) : null}
                      </div>

                      <Link
                        href={`/admin/moderation?user=${user.id}`}
                        className="mt-2 inline-block text-[12px] font-medium text-brand-300"
                      >
                        Выполнения участника
                      </Link>
                    </div>
                  </div>

                  {canManage ? (
                    <UserActions userId={user.id} status={user.status} />
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

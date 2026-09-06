import { Gift, Users } from "lucide-react";
import { getCurrentUser, displayName } from "@/server/auth";
import { getReferralOverview } from "@/server/modules/referrals";
import { formatDate, formatMoney, formatRelative } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState, SectionTitle, StatTile } from "@/components/ui/misc";
import { OfferAvatar } from "@/components/domain";
import { ReferralShare } from "./referral-client";
import { EarningsChart } from "./referral-chart";

export default async function ReferralsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        icon={<Users />}
        title="Откройте приложение через Telegram"
        description="Реферальная ссылка привязана к вашему аккаунту."
      />
    );
  }

  const overview = await getReferralOverview(user.id);
  const activeCount = overview.referrals.filter((r) => r.status === "ACTIVE").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[22px] leading-tight font-bold">Приглашайте друзей</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-content-secondary">
          Вы получаете процент с каждого выполненного задания друга. У друга
          ничего не вычитается — бонус платим мы.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {overview.programs.map((program) => (
          <Badge key={program.id} tone={program.level === 1 ? "money" : "brand"} size="md">
            <Gift className="size-3" />
            {program.level === 1 ? "Друзья" : "Друзья друзей"} —{" "}
            {Number(program.percent)} %
          </Badge>
        ))}
      </div>

      <ReferralShare link={overview.link} code={overview.code} />

      <div className="motion-list grid grid-cols-3 gap-2">
        <StatTile label="Приглашено" value={overview.referrals.length} />
        <StatTile label="Активных" value={activeCount} tone="brand" />
        <StatTile
          label="Заработано"
          value={formatMoney(overview.stats?.referralEarnings ?? 0)}
          tone="money"
        />
      </div>

      {overview.chartData.some((d) => d.amount > 0) ? (
        <div className="space-y-2.5">
          <SectionTitle>Заработок за 14 дней</SectionTitle>
          <Card className="p-4 pr-2">
            <EarningsChart data={overview.chartData} />
          </Card>
        </div>
      ) : null}

      <div className="space-y-2.5">
        <SectionTitle>Ваши приглашённые</SectionTitle>
        {overview.referrals.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-[13px] leading-relaxed text-content-secondary">
              Пока никого нет. Поделитесь ссылкой — процент начисляется
              автоматически с каждого оплаченного задания друга.
            </p>
          </Card>
        ) : (
          <Card className="motion-list divide-y divide-border-subtle">
            {overview.referrals.map((referral) => (
              <div key={referral.id} className="flex items-center gap-3 p-3.5">
                <OfferAvatar
                  title={displayName(referral.referee)}
                  iconUrl={referral.referee.photoUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">
                    {displayName(referral.referee)}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-content-muted">
                    с {formatDate(referral.createdAt)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-[13.5px] font-semibold text-money-400">
                    {formatMoney(referral.earned)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-content-muted">
                    {referral.status === "ACTIVE"
                      ? "активен"
                      : referral.status === "PENDING"
                        ? "ждём задание"
                        : "заблокирован"}
                  </p>
                </div>
              </div>
            ))}
          </Card>
        )}
      </div>

      {overview.earnings.length > 0 ? (
        <div className="space-y-2.5">
          <SectionTitle>История начислений</SectionTitle>
          <Card className="motion-list divide-y divide-border-subtle">
            {overview.earnings.map((earning) => (
              <div key={earning.id} className="flex items-center gap-3 p-3.5">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/12 text-brand-300">
                  <Gift className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">
                    {earning.submission?.offer.title ?? "Реферальный бонус"}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-content-muted">
                    {displayName({
                      firstName: earning.referee.firstName,
                      lastName: null,
                      username: earning.referee.username,
                    })}{" "}
                    · уровень {earning.level} · {Number(earning.percent)} % ·{" "}
                    {formatRelative(earning.createdAt)}
                  </p>
                </div>
                <p className="tabular shrink-0 text-[13.5px] font-semibold text-money-400">
                  +{formatMoney(earning.amount)}
                </p>
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

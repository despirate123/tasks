import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { getWallet } from "@/server/modules/wallet";
import { getRubUsdtRate } from "@/server/modules/withdrawals";
import { getSetting } from "@/server/modules/settings";
import { db } from "@/server/db";
import { EmptyState } from "@/components/ui/misc";
import { WithdrawForm } from "./withdraw-form";

export default async function WithdrawPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <EmptyState
        title="Откройте приложение через Telegram"
        description="Вывод средств доступен только авторизованным пользователям."
      />
    );
  }

  const [wallet, methods, rate, config] = await Promise.all([
    getWallet(user.id),
    db.payoutMethod.findMany({
      where: { userId: user.id, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    }),
    getRubUsdtRate(),
    Promise.all([
      getSetting("withdrawal.min.RUB_CARD", 500),
      getSetting("withdrawal.min.USDT", 1000),
      getSetting("withdrawal.fee.RUB_CARD", 0),
      getSetting("withdrawal.fee.USDT", 2),
      getSetting("fx.spread.percent", 2),
      getSetting("withdrawal.dailyLimit.user", 50000),
    ]).then(([minRub, minUsdt, feeRub, feeUsdt, spread, dailyLimit]) => ({
      minRub: Number(minRub),
      minUsdt: Number(minUsdt),
      feeRub: Number(feeRub),
      feeUsdt: Number(feeUsdt),
      spread: Number(spread),
      dailyLimit: Number(dailyLimit),
    })),
  ]);

  const activeWithdrawal = await db.withdrawal.findFirst({
    where: {
      userId: user.id,
      status: { in: ["PENDING_REVIEW", "APPROVED", "PROCESSING", "SENT"] },
    },
    orderBy: { requestedAt: "desc" },
  });

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
        <h1 className="text-[22px] leading-tight font-bold">Вывод средств</h1>
        <p className="mt-1 text-[13px] text-content-secondary">
          На карту или СБП в рублях, либо в USDT на крипто-кошелёк.
        </p>
      </div>

      <WithdrawForm
        available={Number(wallet.available)}
        methods={methods.map((m) => ({
          id: m.id,
          kind: m.kind,
          maskedValue: m.maskedValue,
          holderName: m.holderName,
          isDefault: m.isDefault,
        }))}
        rate={Number(rate.rate)}
        config={config}
        hasActiveRequest={Boolean(activeWithdrawal)}
        activeRequestCode={activeWithdrawal?.publicCode ?? null}
      />
    </div>
  );
}

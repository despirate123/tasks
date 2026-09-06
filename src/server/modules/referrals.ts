import { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import { formatMoney } from "@/lib/format";
import { notify } from "@/server/modules/notifications";
import { postLedgerEntry } from "@/server/modules/wallet";

type Tx = Prisma.TransactionClient;

const D = Prisma.Decimal;

/**
 * Начисление реферальных бонусов при переходе выполнения в PAID.
 *
 * Важные решения:
 *  - Бонус платит платформа, у приглашённого ничего не вычитается.
 *  - Начисляем только когда деньги реально дошли до исполнителя (PAID),
 *    а не при одобрении: иначе отмена конверсии оставит нас с выплаченными
 *    бонусами за конверсию, которой не было.
 *  - idempotencyKey = referral:{submissionId}:l{level} — повторный вызов
 *    воркера не удвоит начисление.
 */
export async function accrueReferralBonuses(tx: Tx, submissionId: string) {
  const submission = await tx.taskSubmission.findUnique({
    where: { id: submissionId },
    include: {
      offer: { select: { title: true } },
      user: { select: { id: true, firstName: true, username: true, referrerId: true } },
    },
  });
  if (!submission) return;

  const programs = await tx.referralProgram.findMany({
    where: { isActive: true },
    orderBy: { level: "asc" },
  });
  if (programs.length === 0) return;

  // Активируем реферала при первом оплаченном задании.
  await tx.referral.updateMany({
    where: { refereeId: submission.userId, status: "PENDING" },
    data: { status: "ACTIVE", activatedAt: new Date() },
  });

  const chain = await buildReferrerChain(tx, submission.userId, programs.length);

  for (const link of chain) {
    const program = programs.find((p) => p.level === link.level);
    if (!program) continue;

    const amount = new D(submission.rewardAmount)
      .mul(program.percent)
      .div(100)
      .toDecimalPlaces(2, D.ROUND_DOWN);
    if (amount.lte(0)) continue;

    const referral = await tx.referral.findUnique({
      where: { refereeId: link.refereeId },
    });
    // Реферал под подозрением — бонус удерживаем до ручной проверки.
    if (referral?.status === "BLOCKED") continue;

    const existing = await tx.referralEarning.findUnique({
      where: {
        referrerId_submissionId_level: {
          referrerId: link.referrerId,
          submissionId,
          level: link.level,
        },
      },
    });
    if (existing) continue;

    await tx.referralEarning.create({
      data: {
        referrerId: link.referrerId,
        refereeId: submission.userId,
        submissionId,
        level: link.level,
        percent: program.percent,
        amount,
      },
    });

    await postLedgerEntry(tx, {
      userId: link.referrerId,
      direction: "CREDIT",
      type: "REFERRAL_BONUS",
      amount,
      idempotencyKey: `referral:${submissionId}:l${link.level}`,
      description: `Бонус ${program.percent}% с реферала (уровень ${link.level})`,
      submissionId,
    });

    await tx.userStats.update({
      where: { userId: link.referrerId },
      data: { referralEarnings: { increment: amount } },
    });

    await notify(tx, {
      userId: link.referrerId,
      type: "REFERRAL_EARNING",
      title: "Реферальное начисление",
      body: `${formatMoney(amount)} — ваш реферал выполнил «${submission.offer.title}».`,
      deepLink: "/referrals",
      // Сворачиваем поток начислений в одно уведомление за день.
      groupKey: `referral-earning:${new Date().toDateString()}`,
      entityType: "referral",
      entityId: submission.userId,
    });
  }
}

async function buildReferrerChain(tx: Tx, userId: string, maxLevels: number) {
  const chain: { referrerId: string; refereeId: string; level: number }[] = [];
  let currentId = userId;

  for (let level = 1; level <= maxLevels; level += 1) {
    const current = await tx.user.findUnique({
      where: { id: currentId },
      select: { referrerId: true },
    });
    if (!current?.referrerId) break;
    // Самореферал невозможен, но цикл в данных теоретически возможен — обрываем.
    if (current.referrerId === userId) break;
    chain.push({ referrerId: current.referrerId, refereeId: currentId, level });
    currentId = current.referrerId;
  }

  return chain;
}

export async function getReferralOverview(userId: string) {
  const [user, programs, referrals, earnings, stats] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    }),
    db.referralProgram.findMany({ where: { isActive: true }, orderBy: { level: "asc" } }),
    db.referral.findMany({
      where: { referrerId: userId },
      include: {
        referee: {
          select: {
            firstName: true,
            lastName: true,
            username: true,
            photoUrl: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    db.referralEarning.findMany({
      where: { referrerId: userId },
      include: {
        referee: { select: { firstName: true, username: true } },
        submission: { select: { offer: { select: { title: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.userStats.findUnique({ where: { userId } }),
  ]);

  const perReferee = new Map<string, Prisma.Decimal>();
  const allEarnings = await db.referralEarning.groupBy({
    by: ["refereeId"],
    where: { referrerId: userId },
    _sum: { amount: true },
  });
  for (const row of allEarnings) {
    perReferee.set(row.refereeId, new D(row._sum.amount ?? 0));
  }

  const botUsername = process.env.TELEGRAM_BOT_USERNAME ?? "profibux_bot";

  return {
    code: user?.referralCode ?? "",
    link: `https://t.me/${botUsername}?start=ref_${user?.referralCode ?? ""}`,
    programs,
    referrals: referrals.map((r) => ({
      ...r,
      earned: perReferee.get(r.refereeId) ?? new D(0),
    })),
    earnings,
    stats,
    chartData: buildEarningsChart(earnings),
  };
}

function buildEarningsChart(
  earnings: { createdAt: Date; amount: Prisma.Decimal }[],
) {
  const days = 14;
  const buckets = new Map<string, number>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86_400_000);
    buckets.set(
      d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      0,
    );
  }

  for (const earning of earnings) {
    const key = earning.createdAt.toLocaleDateString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
    });
    if (buckets.has(key)) {
      buckets.set(key, (buckets.get(key) ?? 0) + Number(earning.amount));
    }
  }

  return [...buckets.entries()].map(([date, amount]) => ({ date, amount }));
}

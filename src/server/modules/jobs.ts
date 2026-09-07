import { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import { sendTelegramMessage } from "@/server/telegram";
import { accrueReferralBonuses } from "@/server/modules/referrals";
import { approveSubmission, settleSubmission } from "@/server/modules/submissions";

/**
 * Фоновые задачи. И приложение, и воркеры ходят сюда —
 * второй «кассир» с прямой записью в wallets запрещён.
 */

export async function releaseDueHolds() {
  const due = await db.taskSubmission.findMany({
    where: { status: "PENDING_PAYOUT", payoutAvailableAt: { lte: new Date() } },
    select: { id: true },
    take: 50,
  });

  let settled = 0;
  for (const row of due) {
    const result = await settleSubmission(row.id);
    if (result) settled += 1;
  }
  return settled;
}

export async function expireStaleSubmissions() {
  const stale = await db.taskSubmission.findMany({
    where: {
      status: { in: ["DRAFT", "NEEDS_REVISION"] },
      expiresAt: { lt: new Date() },
    },
    take: 100,
  });

  let expired = 0;
  for (const submission of stale) {
    const changed = await db.$transaction(async (tx) => {
      const moved = await tx.taskSubmission.updateMany({
        where: {
          id: submission.id,
          status: { in: ["DRAFT", "NEEDS_REVISION"] },
        },
        data: { status: "EXPIRED" },
      });
      if (moved.count !== 1) return false;

      await tx.offer.updateMany({
        where: { id: submission.offerId, takenCount: { gt: 0 } },
        data: { takenCount: { decrement: 1 } },
      });
      await tx.submissionEvent.create({
        data: {
          submissionId: submission.id,
          actorType: "SYSTEM",
          fromStatus: submission.status,
          toStatus: "EXPIRED",
          comment: "Истёк срок выполнения",
        },
      });
      return true;
    });
    if (changed) expired += 1;
  }
  return expired;
}

export async function releaseReviewLocks() {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const result = await db.taskSubmission.updateMany({
    where: { status: "IN_REVIEW", reviewLockedAt: { lt: staleBefore } },
    data: { status: "PENDING_REVIEW", reviewerId: null, reviewLockedAt: null },
  });
  return result.count;
}

async function systemActorId() {
  const actor = await db.user.findFirst({
    where: { role: { in: ["OWNER", "ADMIN"] }, status: "ACTIVE" },
    orderBy: { role: "desc" },
    select: { id: true },
  });
  return actor?.id ?? null;
}

/** Автоодобрение только через approveSubmission — тот же леджер, что у человека. */
export async function autoApproveTrusted() {
  const actorId = await systemActorId();
  if (!actorId) return 0;

  const candidates = await db.taskSubmission.findMany({
    where: {
      status: "PENDING_REVIEW",
      offer: { autoApprove: true },
      riskScore: { lt: 20 },
    },
    include: {
      offer: { select: { autoApproveDelayMins: true } },
      user: { include: { stats: true } },
    },
    take: 25,
  });

  let approved = 0;
  for (const submission of candidates) {
    const stats = submission.user.stats;
    const trusted =
      (stats?.tasksApproved ?? 0) >= 10 && Number(stats?.approvalRate ?? 0) > 90;
    if (!trusted) continue;

    const delayPassed =
      !submission.submittedAt ||
      Date.now() - submission.submittedAt.getTime() >=
        submission.offer.autoApproveDelayMins * 60_000;
    if (!delayPassed) continue;
    if (Math.random() < 0.05) continue;

    try {
      await approveSubmission(
        actorId,
        submission.id,
        "Автоодобрение: доверенный участник, низкий риск",
        { auto: true },
      );
      approved += 1;
    } catch {
      /* статус уже сменился — пропускаем */
    }
  }
  return approved;
}

export async function dispatchOutbox() {
  const events = await db.outboxEvent.findMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 40,
  });

  let done = 0;
  for (const event of events) {
    try {
      if (event.topic === "notification.bot") {
        await deliverBotNotification(event.payload as { notificationId?: string });
      } else if (event.topic === "referral.accrue") {
        const payload = event.payload as { submissionId?: string };
        if (payload.submissionId) {
          await db.$transaction((tx) => accrueReferralBonuses(tx, payload.submissionId!));
        }
      } else if (event.topic === "payout.send") {
        // Старт — выплаты руками. Событие фиксируем, чтобы очередь не росла.
      } else if (event.topic === "antifraud.scan") {
        /* заготовка: флаги уже можно выставлять вручную */
      }

      await db.outboxEvent.update({
        where: { id: event.id },
        data: { status: "DONE", processedAt: new Date() },
      });
      done += 1;
    } catch (error) {
      const attempts = event.attempts + 1;
      const retryAfter =
        error instanceof OutboxRetry && error.retryAfterSec
          ? error.retryAfterSec
          : Math.min(2 ** attempts, 300);
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= 8 ? "FAILED" : "PENDING",
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          availableAt: new Date(Date.now() + retryAfter * 1000),
        },
      });
    }
  }
  return done;
}

class OutboxRetry extends Error {
  constructor(
    message: string,
    public retryAfterSec: number,
  ) {
    super(message);
    this.name = "OutboxRetry";
  }
}

async function deliverBotNotification(payload: { notificationId?: string }) {
  if (!payload.notificationId) return;

  const notification = await db.notification.findUnique({
    where: { id: payload.notificationId },
    include: {
      user: { select: { id: true, telegramId: true, botBlockedAt: true } },
    },
  });
  if (!notification) return;
  if (notification.user.botBlockedAt) {
    await db.notificationDelivery.updateMany({
      where: { notificationId: notification.id, channel: "BOT" },
      data: { status: "SKIPPED", lastError: "bot blocked" },
    });
    return;
  }

  const result = await sendTelegramMessage(
    notification.user.telegramId,
    `${notification.title}\n\n${notification.body}`,
    notification.deepLink ?? undefined,
  );

  if (result.ok) {
    await db.notificationDelivery.updateMany({
      where: { notificationId: notification.id, channel: "BOT" },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
    });
    return;
  }

  if (result.blocked) {
    await db.user.update({
      where: { id: notification.user.id },
      data: { botBlockedAt: new Date() },
    });
    await db.notificationDelivery.updateMany({
      where: { notificationId: notification.id, channel: "BOT" },
      data: { status: "SKIPPED", lastError: result.error, attempts: { increment: 1 } },
    });
    return;
  }

  if (result.retryAfterSec) {
    throw new OutboxRetry(result.error, result.retryAfterSec);
  }
  throw new Error(result.error);
}

export async function reconcileLedger() {
  const wallets = await db.wallet.findMany();
  const problems: string[] = [];
  const D = Prisma.Decimal;

  for (const wallet of wallets) {
    const [credits, debits] = await Promise.all([
      db.ledgerEntry.aggregate({
        where: {
          walletId: wallet.id,
          direction: "CREDIT",
          type: { not: "WITHDRAWAL_REFUND" },
        },
        _sum: { amount: true },
      }),
      db.ledgerEntry.aggregate({
        where: {
          walletId: wallet.id,
          direction: "DEBIT",
          type: { not: "WITHDRAWAL_HOLD" },
        },
        _sum: { amount: true },
      }),
    ]);

    const expected = new D(credits._sum.amount ?? 0).minus(
      new D(debits._sum.amount ?? 0),
    );
    const actual = new D(wallet.available).plus(wallet.pending).plus(wallet.hold);
    if (expected.minus(actual).abs().gt(new D("0.01"))) {
      problems.push(
        `wallet ${wallet.id}: ожидалось ${expected.toFixed(2)}, фактически ${actual.toFixed(2)}`,
      );
    }
  }
  return problems;
}

export async function monitorSla() {
  return db.taskSubmission.count({
    where: {
      status: { in: ["PENDING_REVIEW", "IN_REVIEW"] },
      reviewDeadlineAt: { lt: new Date() },
    },
  });
}

export async function rollupStats() {
  const D = Prisma.Decimal;
  const offers = await db.offer.findMany({
    select: { id: true, approvalEtaSource: true },
  });

  for (const offer of offers) {
    const rows = await db.taskSubmission.findMany({
      where: {
        offerId: offer.id,
        submittedAt: { not: null },
        reviewedAt: { not: null },
        status: { in: ["PENDING_PAYOUT", "PAID"] },
      },
      select: { submittedAt: true, reviewedAt: true },
      orderBy: { reviewedAt: "desc" },
      take: 50,
    });

    const [approved, rejected] = await Promise.all([
      db.taskSubmission.count({
        where: { offerId: offer.id, status: { in: ["PENDING_PAYOUT", "PAID"] } },
      }),
      db.taskSubmission.count({ where: { offerId: offer.id, status: "REJECTED" } }),
    ]);

    const decided = approved + rejected;
    const data: Prisma.OfferUpdateInput = {
      approvedCount: approved,
      rejectedCount: rejected,
      approvalRate:
        decided > 0 ? new D((approved / decided) * 100).toDecimalPlaces(2) : new D(0),
    };

    if (rows.length >= 3) {
      const durations = rows
        .map((r) => (r.reviewedAt!.getTime() - r.submittedAt!.getTime()) / 60_000)
        .sort((a, b) => a - b);
      const median = Math.round(durations[Math.floor(durations.length / 2)]);
      data.actualEtaMinutes = median;
      if (offer.approvalEtaSource === "AUTO") data.approvalEtaMinutes = median;
    }

    await db.offer.update({ where: { id: offer.id }, data });
  }

  const users = await db.user.findMany({ select: { id: true } });
  for (const user of users) {
    const [approved, rejected, submitted, referralsTotal, referralsActive] =
      await Promise.all([
        db.taskSubmission.count({
          where: { userId: user.id, status: { in: ["PENDING_PAYOUT", "PAID"] } },
        }),
        db.taskSubmission.count({ where: { userId: user.id, status: "REJECTED" } }),
        db.taskSubmission.count({
          where: { userId: user.id, submittedAt: { not: null } },
        }),
        db.referral.count({ where: { referrerId: user.id } }),
        db.referral.count({ where: { referrerId: user.id, status: "ACTIVE" } }),
      ]);
    const decided = approved + rejected;
    await db.userStats.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {
        tasksApproved: approved,
        tasksRejected: rejected,
        tasksSubmitted: submitted,
        approvalRate:
          decided > 0 ? new D((approved / decided) * 100).toDecimalPlaces(2) : new D(0),
        referralsTotal,
        referralsActive,
      },
    });
  }

  return offers.length + users.length;
}

export async function cleanupNotifications() {
  const cutoff = new Date(Date.now() - 90 * 86_400_000);
  const result = await db.notification.deleteMany({
    where: {
      OR: [
        { readAt: { not: null, lt: cutoff } },
        { expiresAt: { not: null, lt: new Date() } },
      ],
    },
  });
  return result.count;
}

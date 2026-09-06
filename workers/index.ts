/**
 * Фоновые воркеры ProfiBux.
 *
 * В продакшене каждая функция — отдельная очередь BullMQ на Redis с ретраями,
 * backoff и метриками. Здесь они собраны в один процесс с простым интервалом:
 * так локальная разработка не требует Redis, а логика переходов и деньги —
 * ровно те же, что пойдут в прод.
 *
 * Запуск: npm run workers
 */

import { PrismaClient, Prisma } from "../src/generated/prisma";

const db = new PrismaClient();
const D = Prisma.Decimal;

const money = (v: unknown) => `${Number(v).toLocaleString("ru-RU")} ₽`;

/**
 * hold-release: PENDING_PAYOUT → PAID.
 *
 * Холд защищает от отмены конверсии рекламодателем: одобрили — деньги
 * в pending, прошёл холд — переехали в available. Здесь же начисляются
 * реферальные бонусы, потому что платить за конверсию, которую могут
 * отменить, — прямой убыток.
 */
async function releaseHolds() {
  const due = await db.taskSubmission.findMany({
    where: { status: "PENDING_PAYOUT", payoutAvailableAt: { lte: new Date() } },
    include: { offer: { select: { title: true, holdHours: true } } },
    take: 50,
  });

  for (const submission of due) {
    await db.$transaction(async (tx) => {
      await tx.taskSubmission.update({
        where: { id: submission.id },
        data: { status: "PAID", paidAt: new Date() },
      });

      if (submission.offer.holdHours > 0) {
        const wallet = await tx.wallet.findUnique({
          where: {
            userId_currency: { userId: submission.userId, currency: "RUB" },
          },
        });
        if (wallet) {
          const amount = new D(submission.rewardAmount);
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              pending: D.max(new D(wallet.pending).minus(amount), new D(0)),
              available: new D(wallet.available).plus(amount),
              version: { increment: 1 },
            },
          });
        }
      }

      await tx.submissionEvent.create({
        data: {
          submissionId: submission.id,
          actorType: "SYSTEM",
          fromStatus: "PENDING_PAYOUT",
          toStatus: "PAID",
          comment: "Вознаграждение зачислено на баланс",
        },
      });

      await tx.notification.create({
        data: {
          userId: submission.userId,
          type: "SUBMISSION_PAID",
          priority: "HIGH",
          title: "Деньги на балансе",
          body: `${money(submission.rewardAmount)} за «${submission.offer.title}» доступны к выводу.`,
          deepLink: "/profile",
          entityType: "submission",
          entityId: submission.id,
          deliveries: {
            create: [
              { channel: "IN_APP", status: "SENT", sentAt: new Date() },
              { channel: "BOT", status: "QUEUED" },
            ],
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          topic: "referral.accrue",
          payload: { submissionId: submission.id },
        },
      });
    });

    console.log(`[hold-release] ${submission.id} → PAID`);
  }

  return due.length;
}

/** expire-submissions: снимает зависшие черновики и просроченные доработки. */
async function expireSubmissions() {
  const now = new Date();
  const stale = await db.taskSubmission.findMany({
    where: {
      status: { in: ["DRAFT", "NEEDS_REVISION"] },
      expiresAt: { lt: now },
    },
    take: 100,
  });

  for (const submission of stale) {
    await db.$transaction(async (tx) => {
      await tx.taskSubmission.update({
        where: { id: submission.id },
        data: { status: "EXPIRED" },
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
    });
    console.log(`[expire] ${submission.id} → EXPIRED`);
  }

  return stale.length;
}

/**
 * release-review-locks: снимает локи модерации старше 10 минут.
 * Без этого выполнение, брошенное закрытой вкладкой, зависает навсегда.
 */
async function releaseReviewLocks() {
  const staleBefore = new Date(Date.now() - 10 * 60_000);
  const result = await db.taskSubmission.updateMany({
    where: { status: "IN_REVIEW", reviewLockedAt: { lt: staleBefore } },
    data: { status: "PENDING_REVIEW", reviewerId: null, reviewLockedAt: null },
  });
  if (result.count > 0) console.log(`[locks] освобождено: ${result.count}`);
  return result.count;
}

/**
 * auto-approve: автоодобрение только по совокупности признаков.
 * Всегда оставляем часть автоодобренных на ручную проверку — иначе мы
 * не узнаем, что правило начало пропускать фрод.
 */
async function autoApprove() {
  const candidates = await db.taskSubmission.findMany({
    where: {
      status: "PENDING_REVIEW",
      offer: { autoApprove: true },
      riskScore: { lt: 20 },
    },
    include: {
      offer: true,
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

    // Выборочный ручной контроль 5 % автоодобрений.
    if (Math.random() < 0.05) continue;

    await db.$transaction(async (tx) => {
      const payoutAt = new Date(Date.now() + submission.offer.holdHours * 3_600_000);

      await tx.taskSubmission.update({
        where: { id: submission.id },
        data: {
          status: "PENDING_PAYOUT",
          reviewedAt: new Date(),
          autoApproved: true,
          payoutAvailableAt: payoutAt,
        },
      });

      const wallet = await tx.wallet.findUnique({
        where: { userId_currency: { userId: submission.userId, currency: "RUB" } },
      });
      if (wallet) {
        const amount = new D(submission.rewardAmount);
        const toPending = submission.offer.holdHours > 0;
        const available = toPending
          ? new D(wallet.available)
          : new D(wallet.available).plus(amount);

        await tx.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            userId: submission.userId,
            direction: "CREDIT",
            type: "TASK_REWARD",
            amount,
            balanceAfter: available,
            submissionId: submission.id,
            idempotencyKey: `submission:${submission.id}:reward`,
            description: submission.offer.title,
          },
        });

        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            available,
            pending: toPending
              ? new D(wallet.pending).plus(amount)
              : new D(wallet.pending),
            totalEarned: new D(wallet.totalEarned).plus(amount),
            version: { increment: 1 },
          },
        });
      }

      await tx.submissionEvent.create({
        data: {
          submissionId: submission.id,
          actorType: "SYSTEM",
          fromStatus: "PENDING_REVIEW",
          toStatus: "PENDING_PAYOUT",
          comment: "Автоодобрение: доверенный участник, низкий риск",
        },
      });
    });

    approved += 1;
    console.log(`[auto-approve] ${submission.id}`);
  }

  return approved;
}

/**
 * stats-rollup: пересчёт денормализованной статистики.
 *
 * Считаем воркером, а не триггерами: триггеры на горячих таблицах
 * превращаются в невидимые локи, которые потом невозможно диагностировать.
 * Здесь же обновляется actualEtaMinutes — медиана фактического времени
 * модерации, которая показывает админу, врём ли мы пользователю про ETA.
 */
async function rollupStats() {
  const offers = await db.offer.findMany({ select: { id: true, approvalEtaSource: true } });

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
        decided > 0
          ? new D((approved / decided) * 100).toDecimalPlaces(2)
          : new D(0),
    };

    if (rows.length >= 3) {
      const durations = rows
        .map((r) => (r.reviewedAt!.getTime() - r.submittedAt!.getTime()) / 60_000)
        .sort((a, b) => a - b);
      const median = Math.round(durations[Math.floor(durations.length / 2)]);
      data.actualEtaMinutes = median;
      // AUTO подтягивается к факту; MANUAL остаётся как задал админ.
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
          decided > 0
            ? new D((approved / decided) * 100).toDecimalPlaces(2)
            : new D(0),
        referralsTotal,
        referralsActive,
      },
    });
  }

  return offers.length + users.length;
}

/**
 * ledger-reconcile: сверка кэша в wallets с суммой по леджеру.
 * Расхождение — инцидент первого приоритета: значит либо баг в транзакциях,
 * либо кто-то правил данные напрямую.
 */
async function reconcileLedger() {
  const wallets = await db.wallet.findMany();
  const problems: string[] = [];

  for (const wallet of wallets) {
    // WITHDRAWAL_HOLD и WITHDRAWAL_REFUND не меняют сумму в кошельке —
    // они переносят её между available и hold. Реально уменьшает баланс
    // только WITHDRAWAL_SETTLED, поэтому эти два типа исключены из сверки.
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
    const actual = new D(wallet.available)
      .plus(wallet.pending)
      .plus(wallet.hold);

    if (expected.minus(actual).abs().gt(new D("0.01"))) {
      problems.push(
        `wallet ${wallet.id}: ожидалось ${expected.toFixed(2)}, фактически ${actual.toFixed(2)}`,
      );
    }
  }

  if (problems.length > 0) {
    console.error("[reconcile] РАСХОЖДЕНИЕ БАЛАНСА:");
    for (const problem of problems) console.error(`  ${problem}`);
  } else {
    console.log(`[reconcile] ${wallets.length} кошельков — расхождений нет`);
  }

  return problems.length;
}

/**
 * outbox-dispatch: разгребает transactional outbox.
 * В продакшене здесь отправка в Telegram Bot API с лимитером 30 msg/s,
 * ретраями 1s → 5s → 30s → 5m и обработкой 429 (retry_after) и 403
 * (бот заблокирован → users.botBlockedAt, попытки прекращаются).
 */
async function dispatchOutbox() {
  const events = await db.outboxEvent.findMany({
    where: { status: "PENDING", availableAt: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  for (const event of events) {
    try {
      if (event.topic === "notification.bot") {
        const payload = event.payload as { notificationId: string };
        await db.notificationDelivery.updateMany({
          where: { notificationId: payload.notificationId, channel: "BOT" },
          data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } },
        });
      }

      await db.outboxEvent.update({
        where: { id: event.id },
        data: { status: "DONE", processedAt: new Date() },
      });
    } catch (error) {
      const attempts = event.attempts + 1;
      await db.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= 5 ? "FAILED" : "PENDING",
          attempts,
          lastError: error instanceof Error ? error.message : String(error),
          // Экспоненциальный backoff.
          availableAt: new Date(Date.now() + Math.min(2 ** attempts, 300) * 1000),
        },
      });
    }
  }

  return events.length;
}

/** notifications-cleanup: прочитанные старше 90 дней и просроченные. */
async function cleanupNotifications() {
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

/** sla-monitor: алерт, когда очередь модерации нарушает заявленный ETA. */
async function monitorSla() {
  const overdue = await db.taskSubmission.count({
    where: {
      status: { in: ["PENDING_REVIEW", "IN_REVIEW"] },
      reviewDeadlineAt: { lt: new Date() },
    },
  });

  if (overdue > 0) {
    console.warn(
      `[sla] ${overdue} выполнений превысили заявленное время одобрения — очередь модерации не справляется`,
    );
  }

  return overdue;
}

const TASKS: { name: string; intervalMs: number; run: () => Promise<number> }[] = [
  { name: "hold-release", intervalMs: 60_000, run: releaseHolds },
  { name: "expire-submissions", intervalMs: 300_000, run: expireSubmissions },
  { name: "release-review-locks", intervalMs: 300_000, run: releaseReviewLocks },
  { name: "auto-approve", intervalMs: 60_000, run: autoApprove },
  { name: "outbox-dispatch", intervalMs: 10_000, run: dispatchOutbox },
  { name: "stats-rollup", intervalMs: 900_000, run: rollupStats },
  { name: "sla-monitor", intervalMs: 600_000, run: monitorSla },
  { name: "ledger-reconcile", intervalMs: 3_600_000, run: reconcileLedger },
  { name: "notifications-cleanup", intervalMs: 86_400_000, run: cleanupNotifications },
];

async function main() {
  const once = process.argv.includes("--once");

  console.log(
    once
      ? "Воркеры ProfiBux: одиночный прогон"
      : "Воркеры ProfiBux запущены. Ctrl+C для остановки.",
  );

  const runTask = async (task: (typeof TASKS)[number]) => {
    try {
      await task.run();
    } catch (error) {
      console.error(`[${task.name}] ошибка:`, error);
    }
  };

  // Первый прогон сразу — чтобы не ждать интервала после старта.
  for (const task of TASKS) await runTask(task);

  if (once) {
    await db.$disconnect();
    return;
  }

  for (const task of TASKS) {
    setInterval(() => void runTask(task), task.intervalMs);
  }
}

void main();

process.once("SIGINT", async () => {
  await db.$disconnect();
  process.exit(0);
});

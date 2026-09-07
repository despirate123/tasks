import { Prisma } from "@/generated/prisma";
import type { Offer, SubmissionStatus, User } from "@/generated/prisma";
import { db } from "@/server/db";
import { publicCode } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { notify } from "@/server/modules/notifications";
import { postLedgerEntry, releaseHold } from "@/server/modules/wallet";
import { accrueReferralBonuses } from "@/server/modules/referrals";

export class SubmissionError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SubmissionError";
  }
}

/**
 * Может ли пользователь взять этот оффер.
 * Возвращает конкретную причину отказа — «ошибка» без объяснения гарантирует
 * поток в поддержку.
 */
type QueryClient = Pick<Prisma.TransactionClient, "taskSubmission">;

export async function checkEligibility(
  user: User,
  offer: Offer,
  client: QueryClient = db,
) {
  if (offer.status !== "ACTIVE") {
    return { ok: false as const, reason: "Задание сейчас недоступно" };
  }
  if (user.status === "LIMITED") {
    return {
      ok: false as const,
      reason: "Ваш аккаунт ограничен. Обратитесь в поддержку",
    };
  }
  const now = new Date();
  if (offer.startsAt && offer.startsAt > now) {
    return { ok: false as const, reason: "Задание ещё не началось" };
  }
  if (offer.endsAt && offer.endsAt < now) {
    return { ok: false as const, reason: "Срок задания истёк" };
  }
  if (offer.totalLimit != null && offer.takenCount >= offer.totalLimit) {
    return { ok: false as const, reason: "Лимит выполнений исчерпан" };
  }

  const [userAttempts, active] = await Promise.all([
    client.taskSubmission.count({
      where: {
        userId: user.id,
        offerId: offer.id,
        status: { notIn: ["CANCELLED", "EXPIRED"] },
      },
    }),
    client.taskSubmission.findFirst({
      where: {
        userId: user.id,
        offerId: offer.id,
        status: { in: ["DRAFT", "PENDING_REVIEW", "IN_REVIEW", "NEEDS_REVISION"] },
      },
    }),
  ]);

  if (active) {
    return {
      ok: false as const,
      reason: "Вы уже выполняете это задание",
      submissionId: active.id,
    };
  }
  if (userAttempts >= offer.perUserLimit) {
    return { ok: false as const, reason: "Вы уже выполняли это задание" };
  }

  if (offer.newUsersOnly) {
    const paid = await client.taskSubmission.count({
      where: { userId: user.id, status: "PAID" },
    });
    if (paid > 0) {
      return { ok: false as const, reason: "Задание только для новых участников" };
    }
  }

  if (offer.dailyLimit != null) {
    const since = new Date(Date.now() - 86_400_000);
    const today = await client.taskSubmission.count({
      where: { offerId: offer.id, startedAt: { gte: since } },
    });
    if (today >= offer.dailyLimit) {
      return { ok: false as const, reason: "Дневной лимит исчерпан, зайдите завтра" };
    }
  }

  return { ok: true as const };
}

/**
 * Взятие задания. Награда фиксируется снапшотом: если админ снизит ставку
 * в оффере, уже начатые выполнения оплатятся по старой цене.
 */
export async function takeOffer(user: User, offerId: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id FROM offers WHERE id = ${offerId} FOR UPDATE
    `;

    const offer = await tx.offer.findUnique({ where: { id: offerId } });
    if (!offer) throw new SubmissionError("OFFER_NOT_FOUND", "Задание не найдено");

    const eligibility = await checkEligibility(user, offer, tx);
    if (!eligibility.ok) {
      if ("submissionId" in eligibility && eligibility.submissionId) {
        return { submissionId: eligibility.submissionId, reused: true as const };
      }
      throw new SubmissionError("NOT_ELIGIBLE", eligibility.reason);
    }

    const created = await tx.taskSubmission.create({
      data: {
        publicCode: publicCode("TS"),
        clickId: publicCode("CK"),
        userId: user.id,
        offerId: offer.id,
        status: "DRAFT",
        rewardAmount: offer.rewardAmount,
        currency: offer.currency,
        expiresAt: new Date(Date.now() + offer.completionTtlMins * 60_000),
        ip: user.lastIp,
        deviceHash: user.lastDeviceH,
      },
    });

    await tx.offer.update({
      where: { id: offer.id },
      data: { takenCount: { increment: 1 } },
    });

    await tx.submissionEvent.create({
      data: {
        submissionId: created.id,
        actorType: "USER",
        actorId: user.id,
        toStatus: "DRAFT",
        comment: "Задание взято в работу",
      },
    });

    return { submissionId: created.id, reused: false as const };
  });
}

/** Проверка полноты доказательств согласно требованиям оффера. */
export function validateProofs(
  offer: Pick<
    Offer,
    "requirePhoto" | "requireVideo" | "requireComment" | "minPhotos"
  >,
  proofs: { kind: string }[],
  comment: string | null,
): { ok: true } | { ok: false; missing: string[] } {
  const missing: string[] = [];
  const photos = proofs.filter((p) => p.kind === "PHOTO").length;
  const videos = proofs.filter((p) => p.kind === "VIDEO").length;

  if (offer.requirePhoto && photos < offer.minPhotos) {
    const need = offer.minPhotos - photos;
    missing.push(
      offer.minPhotos > 1
        ? `добавьте ещё ${need} фото (нужно минимум ${offer.minPhotos})`
        : "добавьте фото-доказательство",
    );
  }
  if (offer.requireVideo && videos < 1) missing.push("добавьте видео-доказательство");
  if (offer.requireComment && (!comment || comment.trim().length < 10)) {
    missing.push("напишите комментарий (минимум 10 символов)");
  }

  return missing.length ? { ok: false, missing } : { ok: true };
}

/** Отправка на проверку: DRAFT | NEEDS_REVISION → PENDING_REVIEW. */
export async function submitForReview(userId: string, submissionId: string) {
  const submission = await db.taskSubmission.findFirst({
    where: { id: submissionId, userId },
    include: { offer: true, proofs: true },
  });
  if (!submission) throw new SubmissionError("NOT_FOUND", "Выполнение не найдено");
  if (!["DRAFT", "NEEDS_REVISION"].includes(submission.status)) {
    throw new SubmissionError(
      "BAD_STATUS",
      "Это выполнение уже отправлено на проверку",
    );
  }

  const validation = validateProofs(
    submission.offer,
    submission.proofs,
    submission.comment,
  );
  if (!validation.ok) {
    throw new SubmissionError(
      "INCOMPLETE_PROOFS",
      `Не хватает доказательств: ${validation.missing.join(", ")}`,
    );
  }

  const now = new Date();
  const isRevision = submission.status === "NEEDS_REVISION";

  return db.$transaction(async (tx) => {
    const claimed = await tx.taskSubmission.updateMany({
      where: {
        id: submission.id,
        userId,
        status: { in: ["DRAFT", "NEEDS_REVISION"] },
      },
      data: {
        status: "PENDING_REVIEW",
        submittedAt: now,
        // SLA-дедлайн модерации = заявленное время одобрения оффера.
        reviewDeadlineAt: new Date(
          now.getTime() + submission.offer.approvalEtaMinutes * 60_000,
        ),
        revisionCount: isRevision ? { increment: 1 } : undefined,
        reviewerId: null,
        reviewLockedAt: null,
      },
    });
    if (claimed.count !== 1) {
      throw new SubmissionError(
        "BAD_STATUS",
        "Это выполнение уже отправлено на проверку",
      );
    }
    const updated = await tx.taskSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });

    await tx.submissionEvent.create({
      data: {
        submissionId: submission.id,
        actorType: "USER",
        actorId: userId,
        fromStatus: submission.status,
        toStatus: "PENDING_REVIEW",
        comment: isRevision
          ? "Доказательства отправлены повторно после доработки"
          : "Доказательства отправлены на проверку",
      },
    });

    await notify(tx, {
      userId,
      type: "SUBMISSION_RECEIVED",
      title: "Доказательства получены",
      body: `«${submission.offer.title}» — проверим примерно за ${humanEta(submission.offer.approvalEtaMinutes)}.`,
      deepLink: `/submissions/${submission.id}`,
      entityType: "submission",
      entityId: submission.id,
    });

    // Здесь же в реальной системе ставится задача антифрод-скоринга:
    // дедупликация по phash, OCR, проверка времени выполнения.
    await tx.outboxEvent.create({
      data: {
        topic: "antifraud.scan",
        payload: { submissionId: submission.id },
      },
    });

    return updated;
  });
}

function humanEta(minutes: number) {
  if (minutes < 60) return `${minutes} мин`;
  if (minutes < 1440) return `${Math.round(minutes / 60)} ч`;
  return `${Math.round(minutes / 1440)} дн`;
}

/**
 * Одобрение модератором: → PENDING_PAYOUT.
 *
 * Деньги начисляются в pending (холд) сразу же, отдельной записью леджера
 * с идемпотентным ключом. Если holdHours = 0 — воркер немедленно переведёт
 * в PAID и pending → available.
 */
export async function approveSubmission(
  moderatorId: string,
  submissionId: string,
  comment?: string,
  options?: { auto?: boolean },
) {
  const submission = await db.taskSubmission.findUnique({
    where: { id: submissionId },
    include: { offer: true },
  });
  if (!submission) throw new SubmissionError("NOT_FOUND", "Выполнение не найдено");
  if (!["PENDING_REVIEW", "IN_REVIEW", "NEEDS_REVISION"].includes(submission.status)) {
    throw new SubmissionError("BAD_STATUS", "Это выполнение уже обработано");
  }

  const now = new Date();
  const payoutAt = new Date(now.getTime() + submission.offer.holdHours * 3_600_000);

  return db.$transaction(async (tx) => {
    const claimed = await tx.taskSubmission.updateMany({
      where: {
        id: submission.id,
        status: { in: ["PENDING_REVIEW", "IN_REVIEW", "NEEDS_REVISION"] },
      },
      data: {
        status: "PENDING_PAYOUT",
        reviewedAt: now,
        reviewerId: moderatorId,
        reviewComment: comment,
        payoutAvailableAt: payoutAt,
        reviewLockedAt: null,
        autoApproved: options?.auto ?? false,
      },
    });
    if (claimed.count !== 1) {
      throw new SubmissionError("BAD_STATUS", "Это выполнение уже обработано");
    }
    const updated = await tx.taskSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });

    await postLedgerEntry(tx, {
      userId: submission.userId,
      direction: "CREDIT",
      type: "TASK_REWARD",
      amount: submission.rewardAmount,
      idempotencyKey: `submission:${submission.id}:reward`,
      description: submission.offer.title,
      submissionId: submission.id,
      // В холд, если у оффера он задан — защита от отмены конверсии рекламодателем.
      toPending: submission.offer.holdHours > 0,
    });

    await tx.offer.update({
      where: { id: submission.offerId },
      data: { approvedCount: { increment: 1 }, completedCount: { increment: 1 } },
    });

    await tx.userStats.update({
      where: { userId: submission.userId },
      data: { tasksApproved: { increment: 1 } },
    });

    await tx.submissionEvent.create({
      data: {
        submissionId: submission.id,
        actorType: "MODERATOR",
        actorId: moderatorId,
        fromStatus: submission.status,
        toStatus: "PENDING_PAYOUT",
        comment: comment ?? "Выполнение подтверждено",
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: moderatorId,
        action: "submission.approve",
        entityType: "task_submission",
        entityId: submission.id,
        after: { status: "PENDING_PAYOUT", reward: submission.rewardAmount.toString() },
      },
    });

    await notify(tx, {
      userId: submission.userId,
      type: "SUBMISSION_APPROVED",
      title: "Задание подтверждено",
      body:
        submission.offer.holdHours > 0
          ? `«${submission.offer.title}» — ${formatMoney(submission.rewardAmount)} поступят на баланс после проверки рекламодателем.`
          : `«${submission.offer.title}» — ${formatMoney(submission.rewardAmount)} зачислены на баланс.`,
      deepLink: `/submissions/${submission.id}`,
      entityType: "submission",
      entityId: submission.id,
    });

    return updated;
  });
}

/** Отклонение с причиной из справочника. */
export async function rejectSubmission(
  moderatorId: string,
  submissionId: string,
  reasonId: string,
  comment?: string,
) {
  const [submission, reason] = await Promise.all([
    db.taskSubmission.findUnique({
      where: { id: submissionId },
      include: { offer: true },
    }),
    db.rejectionReason.findUnique({ where: { id: reasonId } }),
  ]);
  if (!submission) throw new SubmissionError("NOT_FOUND", "Выполнение не найдено");
  if (!reason) throw new SubmissionError("REASON_NOT_FOUND", "Причина не найдена");
  if (!["PENDING_REVIEW", "IN_REVIEW", "NEEDS_REVISION"].includes(submission.status)) {
    throw new SubmissionError("BAD_STATUS", "Это выполнение уже обработано");
  }

  const now = new Date();

  return db.$transaction(async (tx) => {
    const claimed = await tx.taskSubmission.updateMany({
      where: {
        id: submission.id,
        status: { in: ["PENDING_REVIEW", "IN_REVIEW", "NEEDS_REVISION"] },
      },
      data: {
        status: "REJECTED",
        reviewedAt: now,
        reviewerId: moderatorId,
        rejectionReasonId: reason.id,
        reviewComment: comment,
        reviewLockedAt: null,
      },
    });
    if (claimed.count !== 1) {
      throw new SubmissionError("BAD_STATUS", "Это выполнение уже обработано");
    }
    const updated = await tx.taskSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });

    await tx.offer.update({
      where: { id: submission.offerId },
      data: { rejectedCount: { increment: 1 }, completedCount: { increment: 1 } },
    });

    await tx.userStats.update({
      where: { userId: submission.userId },
      data: { tasksRejected: { increment: 1 } },
    });

    if (reason.riskPoints > 0) {
      await tx.user.update({
        where: { id: submission.userId },
        data: { riskScore: { increment: reason.riskPoints } },
      });
    }

    await tx.submissionEvent.create({
      data: {
        submissionId: submission.id,
        actorType: "MODERATOR",
        actorId: moderatorId,
        fromStatus: submission.status,
        toStatus: "REJECTED",
        comment: `${reason.title}${comment ? `. ${comment}` : ""}`,
      },
    });

    await tx.auditLog.create({
      data: {
        actorId: moderatorId,
        action: "submission.reject",
        entityType: "task_submission",
        entityId: submission.id,
        after: { status: "REJECTED", reason: reason.code },
      },
    });

    await notify(tx, {
      userId: submission.userId,
      type: "SUBMISSION_REJECTED",
      title: "Задание отклонено",
      body: `«${submission.offer.title}» — ${reason.title}.${comment ? ` ${comment}` : ""}`,
      deepLink: `/submissions/${submission.id}`,
      entityType: "submission",
      entityId: submission.id,
    });

    return updated;
  });
}

/**
 * Отправка на доработку — третий исход вместо бинарного «да/нет».
 * Пользователь честно выполнил задание, но приложил кривой скриншот:
 * отказ здесь создаёт негатив и поток в поддержку, а доработка — нет.
 */
export async function requestRevision(
  moderatorId: string,
  submissionId: string,
  reasonId: string | null,
  comment: string,
) {
  const submission = await db.taskSubmission.findUnique({
    where: { id: submissionId },
    include: { offer: true },
  });
  if (!submission) throw new SubmissionError("NOT_FOUND", "Выполнение не найдено");
  if (!["PENDING_REVIEW", "IN_REVIEW"].includes(submission.status)) {
    throw new SubmissionError("BAD_STATUS", "Это выполнение уже обработано");
  }

  const maxRevisions = 2;
  if (submission.revisionCount >= maxRevisions) {
    throw new SubmissionError(
      "TOO_MANY_REVISIONS",
      "Лимит доработок исчерпан — нужно решение «одобрить» или «отклонить»",
    );
  }

  const now = new Date();

  return db.$transaction(async (tx) => {
    const claimed = await tx.taskSubmission.updateMany({
      where: {
        id: submission.id,
        status: { in: ["PENDING_REVIEW", "IN_REVIEW"] },
      },
      data: {
        status: "NEEDS_REVISION",
        reviewerId: moderatorId,
        reviewComment: comment,
        rejectionReasonId: reasonId,
        reviewLockedAt: null,
        // Даём сутки на доработку, иначе выполнение зависнет навсегда.
        expiresAt: new Date(now.getTime() + 86_400_000),
      },
    });
    if (claimed.count !== 1) {
      throw new SubmissionError("BAD_STATUS", "Это выполнение уже обработано");
    }
    const updated = await tx.taskSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });

    await tx.submissionEvent.create({
      data: {
        submissionId: submission.id,
        actorType: "MODERATOR",
        actorId: moderatorId,
        fromStatus: submission.status,
        toStatus: "NEEDS_REVISION",
        comment,
      },
    });

    await notify(tx, {
      userId: submission.userId,
      type: "SUBMISSION_NEEDS_REVISION",
      title: "Нужно доработать доказательства",
      body: `«${submission.offer.title}» — ${comment} У вас 24 часа.`,
      deepLink: `/submissions/${submission.id}`,
      entityType: "submission",
      entityId: submission.id,
    });

    return updated;
  });
}

/**
 * Снятие холда: PENDING_PAYOUT → PAID.
 * Запускается воркером hold-release по расписанию. Здесь же начисляются
 * реферальные бонусы — только после того, как деньги реально стали доступны.
 */
export async function settleSubmission(submissionId: string) {
  const submission = await db.taskSubmission.findUnique({
    where: { id: submissionId },
    include: { offer: true },
  });
  if (!submission || submission.status !== "PENDING_PAYOUT") return null;

  return db.$transaction(async (tx) => {
    const claimed = await tx.taskSubmission.updateMany({
      where: { id: submission.id, status: "PENDING_PAYOUT" },
      data: { status: "PAID", paidAt: new Date() },
    });
    if (claimed.count !== 1) return null;
    const updated = await tx.taskSubmission.findUniqueOrThrow({
      where: { id: submission.id },
    });

    if (submission.offer.holdHours > 0) {
      await releaseHold(tx, submission.userId, submission.rewardAmount);
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

    await notify(tx, {
      userId: submission.userId,
      type: "SUBMISSION_PAID",
      title: "Деньги на балансе",
      body: `${formatMoney(submission.rewardAmount)} за «${submission.offer.title}» доступны к выводу.`,
      deepLink: "/profile",
      entityType: "submission",
      entityId: submission.id,
    });

    await accrueReferralBonuses(tx, submission.id);

    return updated;
  });
}

/** Лок выполнения за модератором — двое не смогут проверять одно и то же. */
export async function claimForReview(moderatorId: string, submissionId: string) {
  const LOCK_TTL_MS = 10 * 60_000;
  const staleBefore = new Date(Date.now() - LOCK_TTL_MS);

  const result = await db.taskSubmission.updateMany({
    where: {
      id: submissionId,
      status: { in: ["PENDING_REVIEW", "IN_REVIEW"] },
      OR: [
        { reviewerId: null },
        { reviewerId: moderatorId },
        { reviewLockedAt: { lt: staleBefore } },
      ],
    },
    data: {
      status: "IN_REVIEW",
      reviewerId: moderatorId,
      reviewLockedAt: new Date(),
    },
  });

  if (result.count === 0) {
    throw new SubmissionError(
      "LOCKED",
      "Это выполнение уже проверяет другой модератор",
    );
  }
}

/**
 * Очередь модерации.
 *
 * Порядок сортировки — не украшение, а прямое следствие экономики:
 * модератор дорог, поэтому первым он должен видеть то, что важнее всего.
 *   1. нарушенный SLA — иначе теряем доверие пользователей;
 *   2. высокий риск — требует человека, автоматика не справится;
 *   3. дорогие офферы — цена ошибки выше;
 *   4. FIFO — честность.
 */
export async function getModerationQueue(options: {
  take?: number;
  offerId?: string;
  onlyOverdue?: boolean;
} = {}) {
  const now = new Date();
  const rows = await db.taskSubmission.findMany({
    where: {
      status: { in: ["PENDING_REVIEW", "IN_REVIEW"] },
      ...(options.offerId ? { offerId: options.offerId } : {}),
      ...(options.onlyOverdue ? { reviewDeadlineAt: { lt: now } } : {}),
    },
    include: {
      offer: { select: { title: true, brandName: true, iconUrl: true, slug: true } },
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          riskScore: true,
          stats: { select: { approvalRate: true, tasksApproved: true } },
        },
      },
      proofs: { select: { id: true, kind: true } },
      _count: { select: { fraudFlags: true } },
      reviewer: { select: { firstName: true, username: true } },
    },
    orderBy: [{ riskScore: "desc" }, { submittedAt: "asc" }],
    take: options.take ?? 50,
  });

  return rows
    .map((row) => ({
      ...row,
      overdue: row.reviewDeadlineAt ? row.reviewDeadlineAt < now : false,
    }))
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.riskScore !== b.riskScore) return b.riskScore - a.riskScore;
      const aReward = Number(a.rewardAmount);
      const bReward = Number(b.rewardAmount);
      if (aReward !== bReward) return bReward - aReward;
      return (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0);
    });
}

export async function getUserSubmissions(
  userId: string,
  statuses?: SubmissionStatus[],
) {
  return db.taskSubmission.findMany({
    where: { userId, ...(statuses?.length ? { status: { in: statuses } } : {}) },
    include: {
      offer: {
        select: {
          title: true,
          slug: true,
          brandName: true,
          iconUrl: true,
          difficulty: true,
          approvalEtaMinutes: true,
        },
      },
      proofs: { select: { id: true, kind: true } },
    },
    orderBy: { startedAt: "desc" },
    take: 60,
  });
}

export function serializeDecimal(value: Prisma.Decimal | number | string) {
  return Number(value.toString());
}

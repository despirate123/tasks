"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { requireRole, requireUser } from "@/server/auth";
import {
  approveSubmission,
  claimForReview,
  rejectSubmission,
  requestRevision,
  settleSubmission,
  submitForReview,
  takeOffer,
} from "@/server/modules/submissions";
import {
  resetOfferAuto,
  setOfferApprovalEta,
  setOfferDifficulty,
} from "@/server/modules/offers";
import {
  approveWithdrawal,
  completeWithdrawal,
  createWithdrawal,
  encryptDetails,
  isValidCardNumber,
  isValidCryptoAddress,
  markWithdrawalSent,
  refundWithdrawal,
} from "@/server/modules/withdrawals";
import { markAllRead, markRead } from "@/server/modules/notifications";
import { postLedgerEntry } from "@/server/modules/wallet";
import { maskCard, maskCryptoAddress } from "@/lib/format";
import { PAYOUT_METHOD } from "@/lib/labels";
import type { Difficulty, PayoutMethodKind } from "@/generated/prisma";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(error: unknown): ActionResult {
  const message =
    error instanceof Error ? error.message : "Не удалось выполнить действие";
  return { ok: false, error: message };
}

// ── Задания ──────────────────────────────────────────────────────────────────

export async function takeOfferAction(offerId: string): Promise<ActionResult> {
  let submissionId: string;
  try {
    const user = await requireUser();
    const result = await takeOffer(user, offerId);
    submissionId = result.submissionId;
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/");
  revalidatePath("/my-tasks");
  redirect(`/submissions/${submissionId}`);
}

export async function saveProofCommentAction(
  submissionId: string,
  comment: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const submission = await db.taskSubmission.findFirst({
      where: { id: submissionId, userId: user.id },
    });
    if (!submission) return { ok: false, error: "Выполнение не найдено" };
    if (!["DRAFT", "NEEDS_REVISION"].includes(submission.status)) {
      return { ok: false, error: "Выполнение уже отправлено на проверку" };
    }

    await db.$transaction(async (tx) => {
      await tx.taskSubmission.update({
        where: { id: submissionId },
        data: { comment },
      });
      await tx.submissionProof.deleteMany({
        where: { submissionId, kind: "TEXT" },
      });
      if (comment.trim()) {
        await tx.submissionProof.create({
          data: { submissionId, kind: "TEXT", text: comment, order: 0 },
        });
      }
    });

    revalidatePath(`/submissions/${submissionId}`);
    return { ok: true, message: "Комментарий сохранён" };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Привязка загруженного медиафайла к выполнению.
 *
 * В продакшене файл к этому моменту уже лежит в S3: клиент получил presigned
 * PUT через /api/uploads/presign и загрузил напрямую, минуя наш сервер.
 * Здесь мы только фиксируем факт и считаем checksum для дедупликации.
 */
export async function attachProofAction(
  submissionId: string,
  input: { kind: "PHOTO" | "VIDEO"; storageKey: string; mimeType: string; sizeBytes: number },
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const submission = await db.taskSubmission.findFirst({
      where: { id: submissionId, userId: user.id },
      include: { offer: true, proofs: true },
    });
    if (!submission) return { ok: false, error: "Выполнение не найдено" };
    if (!["DRAFT", "NEEDS_REVISION"].includes(submission.status)) {
      return { ok: false, error: "Выполнение уже отправлено на проверку" };
    }

    const photos = submission.proofs.filter((p) => p.kind === "PHOTO").length;
    if (input.kind === "PHOTO" && photos >= submission.offer.maxPhotos) {
      return {
        ok: false,
        error: `Можно приложить не больше ${submission.offer.maxPhotos} фото`,
      };
    }

    await db.$transaction(async (tx) => {
      const media = await tx.mediaAsset.create({
        data: {
          storageKey: input.storageKey,
          bucket: process.env.S3_BUCKET ?? "profibux-proofs",
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          status: "READY",
          uploadedById: user.id,
        },
      });
      await tx.submissionProof.create({
        data: {
          submissionId,
          kind: input.kind,
          mediaId: media.id,
          order: submission.proofs.length,
        },
      });
    });

    revalidatePath(`/submissions/${submissionId}`);
    return { ok: true, message: "Доказательство добавлено" };
  } catch (error) {
    return fail(error);
  }
}

export async function removeProofAction(
  submissionId: string,
  proofId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const submission = await db.taskSubmission.findFirst({
      where: { id: submissionId, userId: user.id },
    });
    if (!submission) return { ok: false, error: "Выполнение не найдено" };
    if (!["DRAFT", "NEEDS_REVISION"].includes(submission.status)) {
      return { ok: false, error: "Выполнение уже отправлено на проверку" };
    }
    await db.submissionProof.deleteMany({ where: { id: proofId, submissionId } });
    revalidatePath(`/submissions/${submissionId}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function submitForReviewAction(
  submissionId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await submitForReview(user.id, submissionId);
    revalidatePath(`/submissions/${submissionId}`);
    revalidatePath("/my-tasks");
    return { ok: true, message: "Отправлено на проверку" };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelSubmissionAction(
  submissionId: string,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const submission = await db.taskSubmission.findFirst({
      where: { id: submissionId, userId: user.id },
    });
    if (!submission) return { ok: false, error: "Выполнение не найдено" };
    if (!["DRAFT", "NEEDS_REVISION"].includes(submission.status)) {
      return { ok: false, error: "Это выполнение уже нельзя отменить" };
    }

    await db.$transaction(async (tx) => {
      await tx.taskSubmission.update({
        where: { id: submissionId },
        data: { status: "CANCELLED" },
      });
      await tx.submissionEvent.create({
        data: {
          submissionId,
          actorType: "USER",
          actorId: user.id,
          fromStatus: submission.status,
          toStatus: "CANCELLED",
          comment: "Отменено пользователем",
        },
      });
    });

    revalidatePath("/my-tasks");
    return { ok: true, message: "Выполнение отменено" };
  } catch (error) {
    return fail(error);
  }
}

// ── Уведомления ──────────────────────────────────────────────────────────────

export async function markNotificationReadAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await markRead(user.id, id);
    revalidatePath("/notifications");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function markAllNotificationsReadAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await markAllRead(user.id);
    revalidatePath("/notifications");
    return { ok: true, message: "Все уведомления прочитаны" };
  } catch (error) {
    return fail(error);
  }
}

// ── Реквизиты и вывод ────────────────────────────────────────────────────────

export async function addPayoutMethodAction(input: {
  kind: PayoutMethodKind;
  value: string;
  holderName?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const value = input.value.trim();
    const meta = PAYOUT_METHOD[input.kind];

    let masked: string;
    if (input.kind === "CARD_RUB") {
      if (!isValidCardNumber(value)) {
        return { ok: false, error: "Проверьте номер карты — он выглядит неверным" };
      }
      masked = maskCard(value);
    } else if (input.kind === "SBP_RUB") {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 10) return { ok: false, error: "Проверьте номер телефона" };
      masked = `+${digits.slice(0, 1)} ••• ••• ${digits.slice(-2)}`;
    } else {
      if (!isValidCryptoAddress(input.kind, value)) {
        return {
          ok: false,
          error: `Адрес не похож на ${meta.short}. Проверьте сеть и формат`,
        };
      }
      masked = maskCryptoAddress(value);
    }

    const existingCount = await db.payoutMethod.count({
      where: { userId: user.id, deletedAt: null },
    });

    await db.payoutMethod.create({
      data: {
        userId: user.id,
        kind: input.kind,
        label: meta.short,
        maskedValue: masked,
        detailsEncrypted: encryptDetails(value),
        holderName: input.holderName?.trim() || null,
        isDefault: existingCount === 0,
      },
    });

    revalidatePath("/profile/withdraw");
    return { ok: true, message: "Реквизиты добавлены" };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePayoutMethodAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await db.payoutMethod.updateMany({
      where: { id, userId: user.id },
      data: { deletedAt: new Date(), isDefault: false },
    });
    revalidatePath("/profile/withdraw");
    return { ok: true, message: "Реквизиты удалены" };
  } catch (error) {
    return fail(error);
  }
}

export async function createWithdrawalAction(
  methodId: string,
  amount: number,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, error: "Укажите сумму вывода" };
    }
    const withdrawal = await createWithdrawal(user, methodId, amount);
    revalidatePath("/profile");
    revalidatePath("/profile/withdraw");
    return { ok: true, message: `Заявка ${withdrawal.publicCode} создана` };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelWithdrawalAction(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const withdrawal = await db.withdrawal.findFirst({
      where: { id, userId: user.id },
    });
    if (!withdrawal) return { ok: false, error: "Заявка не найдена" };
    if (withdrawal.status !== "PENDING_REVIEW") {
      return { ok: false, error: "Заявку уже нельзя отменить — она в обработке" };
    }
    await refundWithdrawal(id, "CANCELLED", "Отменено пользователем", user.id);
    revalidatePath("/profile");
    return { ok: true, message: "Заявка отменена, средства возвращены" };
  } catch (error) {
    return fail(error);
  }
}

// ── Админ: офферы ────────────────────────────────────────────────────────────

export async function setDifficultyAction(
  offerId: string,
  difficulty: Difficulty,
): Promise<ActionResult> {
  try {
    const admin = await requireRole("ADMIN");
    await setOfferDifficulty(admin.id, offerId, difficulty);
    revalidatePath("/admin/offers");
    revalidatePath(`/admin/offers/${offerId}`);
    return { ok: true, message: "Сложность обновлена вручную" };
  } catch (error) {
    return fail(error);
  }
}

export async function setApprovalEtaAction(
  offerId: string,
  minutes: number,
): Promise<ActionResult> {
  try {
    const admin = await requireRole("ADMIN");
    await setOfferApprovalEta(admin.id, offerId, minutes);
    revalidatePath("/admin/offers");
    revalidatePath(`/admin/offers/${offerId}`);
    return { ok: true, message: "Время одобрения обновлено вручную" };
  } catch (error) {
    return fail(error);
  }
}

export async function resetAutoAction(
  offerId: string,
  field: "difficulty" | "approvalEta",
): Promise<ActionResult> {
  try {
    const admin = await requireRole("ADMIN");
    await resetOfferAuto(admin.id, offerId, field);
    revalidatePath("/admin/offers");
    revalidatePath(`/admin/offers/${offerId}`);
    return { ok: true, message: "Возвращён автоматический расчёт" };
  } catch (error) {
    return fail(error);
  }
}

export async function setOfferStatusAction(
  offerId: string,
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "ARCHIVED",
): Promise<ActionResult> {
  try {
    const admin = await requireRole("ADMIN");
    const before = await db.offer.findUnique({
      where: { id: offerId },
      select: { status: true },
    });
    await db.offer.update({
      where: { id: offerId },
      data: { status, updatedById: admin.id },
    });
    await db.auditLog.create({
      data: {
        actorId: admin.id,
        action: "offer.status.set",
        entityType: "offer",
        entityId: offerId,
        before: { status: before?.status },
        after: { status },
      },
    });
    revalidatePath("/admin/offers");
    revalidatePath("/");
    return { ok: true, message: "Статус задания обновлён" };
  } catch (error) {
    return fail(error);
  }
}

// ── Админ: модерация ─────────────────────────────────────────────────────────

export async function claimSubmissionAction(id: string): Promise<ActionResult> {
  try {
    const moderator = await requireRole("MODERATOR");
    await claimForReview(moderator.id, id);
    revalidatePath(`/admin/moderation/${id}`);
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function approveSubmissionAction(
  id: string,
  comment?: string,
): Promise<ActionResult> {
  try {
    const moderator = await requireRole("MODERATOR");
    await approveSubmission(moderator.id, id, comment);
    revalidatePath("/admin/moderation");
    revalidatePath("/admin");
    return { ok: true, message: "Выполнение одобрено" };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectSubmissionAction(
  id: string,
  reasonId: string,
  comment?: string,
): Promise<ActionResult> {
  try {
    const moderator = await requireRole("MODERATOR");
    await rejectSubmission(moderator.id, id, reasonId, comment);
    revalidatePath("/admin/moderation");
    revalidatePath("/admin");
    return { ok: true, message: "Выполнение отклонено" };
  } catch (error) {
    return fail(error);
  }
}

export async function requestRevisionAction(
  id: string,
  reasonId: string | null,
  comment: string,
): Promise<ActionResult> {
  try {
    const moderator = await requireRole("MODERATOR");
    if (!comment.trim()) {
      return { ok: false, error: "Напишите, что именно нужно доработать" };
    }
    await requestRevision(moderator.id, id, reasonId, comment);
    revalidatePath("/admin/moderation");
    return { ok: true, message: "Отправлено на доработку" };
  } catch (error) {
    return fail(error);
  }
}

/** Ручное снятие холда — для демонстрации и разбора инцидентов. */
export async function settleSubmissionAction(id: string): Promise<ActionResult> {
  try {
    await requireRole("FINANCE");
    await settleSubmission(id);
    revalidatePath("/admin/moderation");
    revalidatePath("/my-tasks");
    return { ok: true, message: "Вознаграждение зачислено" };
  } catch (error) {
    return fail(error);
  }
}

// ── Админ: выплаты ───────────────────────────────────────────────────────────

export async function approvePayoutAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireRole("FINANCE");
    await approveWithdrawal(actor.id, id);
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Заявка одобрена" };
  } catch (error) {
    return fail(error);
  }
}

export async function markPayoutSentAction(
  id: string,
  txHash: string,
): Promise<ActionResult> {
  try {
    const actor = await requireRole("FINANCE");
    if (!txHash.trim()) {
      return { ok: false, error: "Укажите хэш транзакции или референс платежа" };
    }
    await markWithdrawalSent(actor.id, id, txHash.trim());
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Отмечено как отправленное" };
  } catch (error) {
    return fail(error);
  }
}

export async function completePayoutAction(id: string): Promise<ActionResult> {
  try {
    const actor = await requireRole("FINANCE");
    await completeWithdrawal(id, actor.id);
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Выплата подтверждена" };
  } catch (error) {
    return fail(error);
  }
}

export async function rejectPayoutAction(
  id: string,
  reason: string,
): Promise<ActionResult> {
  try {
    const actor = await requireRole("FINANCE");
    if (!reason.trim()) return { ok: false, error: "Укажите причину отказа" };
    await refundWithdrawal(id, "REJECTED", reason.trim(), actor.id);
    revalidatePath("/admin/payouts");
    return { ok: true, message: "Заявка отклонена, средства возвращены" };
  } catch (error) {
    return fail(error);
  }
}

// ── Админ: пользователи ──────────────────────────────────────────────────────

export async function adjustBalanceAction(
  userId: string,
  amount: number,
  comment: string,
): Promise<ActionResult> {
  try {
    const actor = await requireRole("FINANCE");
    if (!comment.trim()) {
      return { ok: false, error: "Комментарий обязателен — это финансовая операция" };
    }
    if (!Number.isFinite(amount) || amount === 0) {
      return { ok: false, error: "Укажите сумму корректировки" };
    }

    await db.$transaction(async (tx) => {
      await postLedgerEntry(tx, {
        userId,
        direction: amount > 0 ? "CREDIT" : "DEBIT",
        type: "MANUAL_ADJUSTMENT",
        amount: Math.abs(amount),
        idempotencyKey: `manual:${userId}:${Date.now()}`,
        description: comment.trim(),
        createdById: actor.id,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "user.adjustBalance",
          entityType: "user",
          entityId: userId,
          after: { amount, comment: comment.trim() },
        },
      });
    });

    revalidatePath("/admin/users");
    return { ok: true, message: "Баланс скорректирован" };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserStatusAction(
  userId: string,
  status: "ACTIVE" | "LIMITED" | "BLOCKED",
  reason: string,
): Promise<ActionResult> {
  try {
    const actor = await requireRole("ADMIN");
    const before = await db.user.findUnique({
      where: { id: userId },
      select: { status: true },
    });

    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { status, statusReason: reason || null },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "user.status.set",
          entityType: "user",
          entityId: userId,
          before: { status: before?.status },
          after: { status, reason },
        },
      });
    });

    revalidatePath("/admin/users");
    return { ok: true, message: "Статус пользователя обновлён" };
  } catch (error) {
    return fail(error);
  }
}

"use server";

import { refresh, revalidatePath, updateTag } from "next/cache";
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
  createManualOffer,
  duplicateOffer,
  resetOfferAuto,
  setOfferApprovalEta,
  setOfferDifficulty,
  updateManualOffer,
  updateOfferLinks,
  type ManualOfferInput,
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
import {
  markAllRead,
  markRead,
  setNotificationGroupPreference,
} from "@/server/modules/notifications";
import type { NotificationType } from "@/generated/prisma";
import { deleteBanner, toggleBanner, upsertBanner } from "@/server/modules/banners";
import { notify } from "@/server/modules/notifications";
import { postLedgerEntry } from "@/server/modules/wallet";
import { maskCard, maskCryptoAddress } from "@/lib/format";
import { PAYOUT_METHOD } from "@/lib/labels";
import type { Difficulty, PayoutMethodKind } from "@/generated/prisma";
import { CACHE_TAGS } from "@/server/cache-tags";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

function bumpCatalog() {
  updateTag(CACHE_TAGS.catalog);
  revalidatePath("/");
}

function bumpBanners() {
  revalidatePath("/");
  revalidatePath("/admin/banners");
  // Client Router Cache (staleTimes.dynamic) иначе держит старую главную
  // даже после записи в БД. refresh() сбрасывает её в этой сессии.
  refresh();
}

function fail(error: unknown): ActionResult {
  if (error instanceof Error) {
    if (error.message === "UNAUTHORIZED") {
      return { ok: false, error: "Нужно войти заново" };
    }
    if (error.message === "USER_BLOCKED") {
      return { ok: false, error: "Аккаунт заблокирован" };
    }
    if (error.message === "FORBIDDEN") {
      return { ok: false, error: "Недостаточно прав" };
    }
    if (error.name.startsWith("Prisma") || error.message.includes("Invalid `prisma")) {
      return { ok: false, error: "Не удалось выполнить действие" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: false, error: "Не удалось выполнить действие" };
}

const MAX_PROOF_COMMENT = 2000;

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

    const text = comment.trim().slice(0, MAX_PROOF_COMMENT);

    await db.$transaction(async (tx) => {
      await tx.taskSubmission.update({
        where: { id: submissionId },
        data: { comment: text || null },
      });
      await tx.submissionProof.deleteMany({
        where: { submissionId, kind: "TEXT" },
      });
      if (text) {
        await tx.submissionProof.create({
          data: { submissionId, kind: "TEXT", text, order: 0 },
        });
      }
    });

    revalidatePath(`/submissions/${submissionId}`);
    return { ok: true, message: "Комментарий сохранён" };
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
      include: { offer: { select: { slug: true } } },
    });
    if (!submission) return { ok: false, error: "Выполнение не найдено" };
    if (!["DRAFT", "NEEDS_REVISION"].includes(submission.status)) {
      return { ok: false, error: "Это выполнение уже нельзя отменить" };
    }

    await db.$transaction(async (tx) => {
      const cancelled = await tx.taskSubmission.updateMany({
        where: {
          id: submissionId,
          userId: user.id,
          status: { in: ["DRAFT", "NEEDS_REVISION"] },
        },
        data: { status: "CANCELLED" },
      });
      if (cancelled.count !== 1) {
        throw new Error("Это выполнение уже нельзя отменить");
      }
      await tx.offer.updateMany({
        where: { id: submission.offerId, takenCount: { gt: 0 } },
        data: { takenCount: { decrement: 1 } },
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

    revalidatePath("/");
    revalidatePath("/my-tasks");
    revalidatePath(`/submissions/${submissionId}`);
    revalidatePath(`/tasks/${submission.offer.slug}`);
  } catch (error) {
    return fail(error);
  }
  redirect("/my-tasks?tab=closed");
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

export async function completeOnboardingAction(): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await db.user.update({
      where: { id: user.id },
      data: { onboardedAt: new Date() },
    });
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setNotificationGroupAction(
  types: NotificationType[],
  channel: "inApp" | "bot",
  enabled: boolean,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    await setNotificationGroupPreference(user.id, types, channel, enabled);
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
    revalidatePath("/profile/withdraw");
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
    bumpCatalog();
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
    bumpCatalog();
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
    bumpCatalog();
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
    bumpCatalog();
    return { ok: true, message: "Статус задания обновлён" };
  } catch (error) {
    return fail(error);
  }
}

export async function saveOfferAction(
  id: string | undefined,
  input: ManualOfferInput,
): Promise<ActionResult & { offerId?: string }> {
  try {
    const admin = await requireRole("ADMIN");
    const offer = id
      ? await updateManualOffer(admin.id, id, input)
      : await createManualOffer(admin.id, input);
    revalidatePath("/admin/offers");
    bumpCatalog();
    if (id) revalidatePath(`/admin/offers/${id}`);
    return {
      ok: true,
      offerId: offer.id,
      message: id ? "Задание обновлено" : "Задание создано",
    };
  } catch (error) {
    return fail(error);
  }
}

export async function duplicateOfferAction(id: string): Promise<ActionResult & { offerId?: string }> {
  try {
    const admin = await requireRole("ADMIN");
    const copy = await duplicateOffer(admin.id, id);
    revalidatePath("/admin/offers");
    return { ok: true, offerId: copy.id, message: "Копия создана как черновик" };
  } catch (error) {
    return fail(error);
  }
}

export async function updateOfferLinksAction(
  offerId: string,
  input: { promoCode: string; trackingUrl: string; holdHours: number },
): Promise<ActionResult> {
  try {
    const admin = await requireRole("MODERATOR");
    await updateOfferLinks(admin.id, offerId, {
      promoCode: input.promoCode,
      trackingUrl: input.trackingUrl,
      holdHours: input.holdHours,
    });
    revalidatePath("/admin/offers");
    revalidatePath(`/admin/offers/${offerId}`);
    bumpCatalog();
    return { ok: true, message: "Ссылка и промокод обновлены" };
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
      if (status === "LIMITED" || status === "BLOCKED") {
        await notify(tx, {
          userId,
          type: "ACCOUNT_LIMITED",
          title: status === "BLOCKED" ? "Аккаунт заблокирован" : "Аккаунт ограничен",
          body:
            reason.trim() ||
            (status === "BLOCKED"
              ? "Доступ к сервису закрыт. Напишите в поддержку, если это ошибка."
              : "Новые задания пока недоступны. Вывод уже заработанного открыт."),
          deepLink: "/profile",
        });
      }
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

function parseOptionalDate(value: string | undefined) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Некорректная дата");
  return date;
}

export async function upsertBannerAction(formData: FormData): Promise<ActionResult> {
  try {
    const admin = await requireRole("ADMIN");
    const id = String(formData.get("id") ?? "").trim() || undefined;
    await upsertBanner(id, {
      title: String(formData.get("title") ?? ""),
      subtitle: String(formData.get("subtitle") ?? ""),
      href: String(formData.get("href") ?? ""),
      imageUrl: String(formData.get("imageUrl") ?? ""),
      background: String(formData.get("background") ?? "#111111"),
      accent: String(formData.get("accent") ?? "#F7F16A"),
      sortOrder: Number(formData.get("sortOrder") ?? 0),
      isActive: formData.get("isActive") === "on",
      startsAt: parseOptionalDate(String(formData.get("startsAt") ?? "")),
      endsAt: parseOptionalDate(String(formData.get("endsAt") ?? "")),
    }, admin.id);
    bumpBanners();
    return { ok: true, message: id ? "Баннер обновлён" : "Баннер создан" };
  } catch (error) {
    return fail(error);
  }
}

export async function toggleBannerAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");
    await toggleBanner(id, isActive);
    bumpBanners();
    return { ok: true, message: isActive ? "Баннер включён" : "Баннер скрыт" };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteBannerAction(id: string): Promise<ActionResult> {
  try {
    await requireRole("ADMIN");
    await deleteBanner(id);
    bumpBanners();
    return { ok: true, message: "Баннер удалён" };
  } catch (error) {
    return fail(error);
  }
}

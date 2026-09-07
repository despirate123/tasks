import { Prisma } from "@/generated/prisma";
import type { Difficulty, Offer, OfferStatus, User } from "@/generated/prisma";
import { db } from "@/server/db";

export type OfferFilters = {
  difficulty?: Difficulty[];
  categorySlug?: string;
  minReward?: number;
  maxReward?: number;
  search?: string;
  sort?: "reward" | "eta" | "new" | "popular";
  take?: number;
  skip?: number;
};

export async function listOffers(filters: OfferFilters = {}) {
  const now = new Date();

  const where: Prisma.OfferWhereInput = {
    status: "ACTIVE",
    AND: [
      { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
      { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
    ],
    ...(filters.difficulty?.length ? { difficulty: { in: filters.difficulty } } : {}),
    ...(filters.categorySlug ? { category: { slug: filters.categorySlug } } : {}),
    ...(filters.minReward != null || filters.maxReward != null
      ? {
          rewardAmount: {
            ...(filters.minReward != null ? { gte: filters.minReward } : {}),
            ...(filters.maxReward != null ? { lte: filters.maxReward } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            { brandName: { contains: filters.search, mode: "insensitive" } },
            { subtitle: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const orderBy: Prisma.OfferOrderByWithRelationInput[] =
    filters.sort === "reward"
      ? [{ rewardAmount: "desc" }]
      : filters.sort === "eta"
        ? [{ approvalEtaMinutes: "asc" }]
        : filters.sort === "new"
          ? [{ createdAt: "desc" }]
          : filters.sort === "popular"
            ? [{ takenCount: "desc" }]
            : [{ isFeatured: "desc" }, { priority: "desc" }, { createdAt: "desc" }];

  const take = filters.take ?? 20;
  const skip = filters.skip ?? 0;

  const rows = await db.offer.findMany({
    where,
    orderBy,
    take: take + 1,
    skip,
    include: {
      category: { select: { name: true, slug: true, icon: true } },
      source: { select: { code: true, name: true } },
      _count: { select: { steps: true } },
    },
  });

  const hasMore = rows.length > take;
  return {
    items: hasMore ? rows.slice(0, take) : rows,
    hasMore,
  };
}

export async function getOfferBySlug(slug: string) {
  return db.offer.findUnique({
    where: { slug },
    include: {
      category: true,
      source: { select: { code: true, name: true } },
      steps: { orderBy: { order: "asc" } },
    },
  });
}

export async function listSimilarOffers(
  offerId: string,
  categoryId: string | null,
  take = 4,
) {
  const now = new Date();
  return db.offer.findMany({
    where: {
      id: { not: offerId },
      status: "ACTIVE",
      ...(categoryId ? { categoryId } : {}),
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ isFeatured: "desc" }, { priority: "desc" }],
    take,
    include: {
      category: { select: { name: true, slug: true, icon: true } },
      source: { select: { code: true, name: true } },
      _count: { select: { steps: true } },
    },
  });
}

export async function updateOfferLinks(
  actorId: string,
  offerId: string,
  input: { promoCode: string | null; trackingUrl: string | null; holdHours: number },
) {
  const before = await db.offer.findUnique({
    where: { id: offerId },
    select: { promoCode: true, trackingUrl: true, holdHours: true },
  });
  if (!before) throw new Error("OFFER_NOT_FOUND");

  const holdHours = Math.max(0, Math.min(Math.round(input.holdHours), 24 * 90));
  const promoCode = input.promoCode?.trim() || null;
  const trackingUrl = input.trackingUrl?.trim() || null;

  const updated = await db.offer.update({
    where: { id: offerId },
    data: { promoCode, trackingUrl, holdHours, updatedById: actorId },
  });

  await db.auditLog.create({
    data: {
      actorId,
      action: "offer.links.set",
      entityType: "offer",
      entityId: offerId,
      before,
      after: { promoCode, trackingUrl, holdHours },
    },
  });

  return updated;
}

export async function getCategoriesWithCounts() {
  const categories = await db.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { offers: { where: { status: "ACTIVE" } } } },
    },
  });
  return categories.filter((c) => c._count.offers > 0);
}

// ── Ручное переопределение сложности и времени одобрения ─────────────────────

/**
 * Требование ТЗ: «админ может вручную менять сложность и время одобрения
 * у любого задания».
 *
 * Конфликт: автоматический синк из GetBlogger / Leadgid / Rafinad затрёт
 * ручную правку при следующем прогоне. Решение — хранить происхождение
 * значения рядом с ним (difficultySource / approvalEtaSource) и запретить
 * синку трогать поля со значением MANUAL.
 */
export async function setOfferDifficulty(
  actorId: string,
  offerId: string,
  difficulty: Difficulty,
) {
  const before = await db.offer.findUnique({
    where: { id: offerId },
    select: { difficulty: true, difficultySource: true },
  });
  if (!before) throw new Error("OFFER_NOT_FOUND");

  const updated = await db.offer.update({
    where: { id: offerId },
    data: { difficulty, difficultySource: "MANUAL", updatedById: actorId },
  });

  await db.auditLog.create({
    data: {
      actorId,
      action: "offer.difficulty.set",
      entityType: "offer",
      entityId: offerId,
      before: { difficulty: before.difficulty, source: before.difficultySource },
      after: { difficulty, source: "MANUAL" },
    },
  });

  return updated;
}

export async function setOfferApprovalEta(
  actorId: string,
  offerId: string,
  minutes: number,
) {
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 60 * 24 * 60) {
    throw new Error("INVALID_ETA");
  }

  const before = await db.offer.findUnique({
    where: { id: offerId },
    select: { approvalEtaMinutes: true, approvalEtaSource: true },
  });
  if (!before) throw new Error("OFFER_NOT_FOUND");

  const updated = await db.offer.update({
    where: { id: offerId },
    data: {
      approvalEtaMinutes: Math.round(minutes),
      approvalEtaSource: "MANUAL",
      updatedById: actorId,
    },
  });

  await db.auditLog.create({
    data: {
      actorId,
      action: "offer.approvalEta.set",
      entityType: "offer",
      entityId: offerId,
      before: {
        minutes: before.approvalEtaMinutes,
        source: before.approvalEtaSource,
      },
      after: { minutes: Math.round(minutes), source: "MANUAL" },
    },
  });

  return updated;
}

/** Сброс к автоматическому расчёту — возвращает поле под управление синка. */
export async function resetOfferAuto(
  actorId: string,
  offerId: string,
  field: "difficulty" | "approvalEta",
) {
  const offer = await db.offer.findUnique({ where: { id: offerId } });
  if (!offer) throw new Error("OFFER_NOT_FOUND");

  const data: Prisma.OfferUpdateInput = {
    updatedBy: { connect: { id: actorId } },
  };

  if (field === "difficulty") {
    data.difficultySource = "AUTO";
    data.difficulty = classifyDifficulty(offer);
  } else {
    data.approvalEtaSource = "AUTO";
    data.approvalEtaMinutes = offer.actualEtaMinutes ?? offer.approvalEtaMinutes;
  }

  const updated = await db.offer.update({ where: { id: offerId }, data });

  await db.auditLog.create({
    data: {
      actorId,
      action: `offer.${field}.resetAuto`,
      entityType: "offer",
      entityId: offerId,
      after: { source: "AUTO" },
    },
  });

  return updated;
}

/**
 * Эвристика автоклассификации сложности.
 * Работает по числу шагов, требованиям к пруфам, награде и сроку выполнения —
 * то есть по прокси-признакам того, сколько усилий требует задание.
 */
export function classifyDifficulty(
  offer: Pick<
    Offer,
    | "requireVideo"
    | "requirePhoto"
    | "minPhotos"
    | "rewardAmount"
    | "completionTtlMins"
  > & { stepCount?: number },
): Difficulty {
  let score = 0;

  const steps = offer.stepCount ?? 0;
  if (steps >= 6) score += 2;
  else if (steps >= 4) score += 1;

  if (offer.requireVideo) score += 2;
  if (offer.requirePhoto && offer.minPhotos >= 3) score += 1;

  const reward = Number(offer.rewardAmount);
  if (reward >= 2000) score += 2;
  else if (reward >= 700) score += 1;

  if (offer.completionTtlMins > 2880) score += 1;

  if (score >= 4) return "HARD";
  if (score >= 2) return "MEDIUM";
  return "EASY";
}

/**
 * Синхронизация из партнёрской сети.
 *
 * Главное правило: поля, помеченные MANUAL, не перезаписываются никогда.
 * Награда пользователю тоже не меняется автоматически — цена не должна
 * меняться под пользователем без решения человека.
 */
export async function upsertOfferFromNetwork(
  sourceId: string,
  normalized: {
    externalId: string;
    slug: string;
    title: string;
    description: string;
    brandName?: string;
    networkPayout: number;
    rewardAmount: number;
    suggestedDifficulty?: Difficulty;
    suggestedEtaMinutes?: number;
    trackingUrl?: string;
    raw?: unknown;
  },
) {
  const existing = await db.offer.findUnique({
    where: { sourceId_externalId: { sourceId, externalId: normalized.externalId } },
  });

  if (!existing) {
    return db.offer.create({
      data: {
        sourceId,
        externalId: normalized.externalId,
        slug: normalized.slug,
        title: normalized.title,
        description: normalized.description,
        brandName: normalized.brandName,
        rewardAmount: normalized.rewardAmount,
        networkPayout: normalized.networkPayout,
        difficulty: normalized.suggestedDifficulty ?? "MEDIUM",
        difficultySource: normalized.suggestedDifficulty ? "NETWORK" : "AUTO",
        approvalEtaMinutes: normalized.suggestedEtaMinutes ?? 1440,
        approvalEtaSource: normalized.suggestedEtaMinutes ? "NETWORK" : "AUTO",
        trackingUrl: normalized.trackingUrl,
        // Новые офферы приходят черновиками и публикуются вручную.
        status: "DRAFT",
      },
    });
  }

  const data: Prisma.OfferUpdateInput = {
    title: normalized.title,
    description: normalized.description,
    brandName: normalized.brandName,
    networkPayout: normalized.networkPayout,
    trackingUrl: normalized.trackingUrl,
  };

  if (existing.difficultySource !== "MANUAL" && normalized.suggestedDifficulty) {
    data.difficulty = normalized.suggestedDifficulty;
    data.difficultySource = "NETWORK";
  }
  if (existing.approvalEtaSource !== "MANUAL" && normalized.suggestedEtaMinutes) {
    data.approvalEtaMinutes = normalized.suggestedEtaMinutes;
    data.approvalEtaSource = "NETWORK";
  }

  return db.offer.update({ where: { id: existing.id }, data });
}

export async function listAdminOffers(filters: {
  status?: OfferStatus;
  search?: string;
} = {}) {
  return db.offer.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search
        ? { title: { contains: filters.search, mode: "insensitive" } }
        : {}),
    },
    include: {
      category: { select: { name: true } },
      source: { select: { code: true, name: true } },
      _count: { select: { submissions: true, steps: true } },
    },
    orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
    take: 100,
  });
}

/**
 * Пересчёт фактического времени модерации — медиана по последним одобренным
 * выполнениям. Даёт админу честный ответ на вопрос «мы врём пользователю
 * про время одобрения или нет».
 */
export async function recalcActualEta(offerId: string) {
  const rows = await db.taskSubmission.findMany({
    where: {
      offerId,
      submittedAt: { not: null },
      reviewedAt: { not: null },
      status: { in: ["PENDING_PAYOUT", "PAID"] },
    },
    select: { submittedAt: true, reviewedAt: true },
    orderBy: { reviewedAt: "desc" },
    take: 50,
  });
  if (rows.length < 3) return null;

  const durations = rows
    .map((r) => (r.reviewedAt!.getTime() - r.submittedAt!.getTime()) / 60_000)
    .sort((a, b) => a - b);
  const median = Math.round(durations[Math.floor(durations.length / 2)]);

  const offer = await db.offer.findUnique({
    where: { id: offerId },
    select: { approvalEtaSource: true },
  });

  return db.offer.update({
    where: { id: offerId },
    data: {
      actualEtaMinutes: median,
      // AUTO-значение подтягивается к факту; MANUAL остаётся как задал админ.
      ...(offer?.approvalEtaSource === "AUTO" ? { approvalEtaMinutes: median } : {}),
    },
  });
}

/** Доступность оффера для конкретного пользователя — для бейджей в каталоге. */
export async function annotateAvailability(offers: Offer[], user: User | null) {
  if (!user) return offers.map((offer) => ({ offer, taken: false }));

  const submissions = await db.taskSubmission.findMany({
    where: {
      userId: user.id,
      offerId: { in: offers.map((o) => o.id) },
      status: { notIn: ["CANCELLED", "EXPIRED"] },
    },
    select: { offerId: true, status: true, id: true },
  });

  const byOffer = new Map(submissions.map((s) => [s.offerId, s]));
  return offers.map((offer) => ({
    offer,
    taken: byOffer.has(offer.id),
    submission: byOffer.get(offer.id),
  }));
}

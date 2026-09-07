import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma";
import type { PayoutMethodKind, User } from "@/generated/prisma";
import { db } from "@/server/db";
import { publicCode } from "@/lib/utils";
import { formatCrypto, formatMoney } from "@/lib/format";
import { PAYOUT_METHOD } from "@/lib/labels";
import { notify } from "@/server/modules/notifications";
import { lockWallet, postLedgerEntry } from "@/server/modules/wallet";
import { getSetting } from "@/server/modules/settings";

const D = Prisma.Decimal;

export class WithdrawalError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "WithdrawalError";
  }
}

// ── Шифрование реквизитов ────────────────────────────────────────────────────
// AES-256-GCM. Ключ — из KMS/ENV, в БД в открытом виде лежит только маска.
// Формат: iv(hex):authTag(hex):ciphertext(hex)

function encryptionKey(): Buffer {
  const raw = process.env.PAYOUT_ENCRYPTION_KEY;
  if (raw && raw.length >= 64) return Buffer.from(raw.slice(0, 64), "hex");
  if (process.env.NODE_ENV === "production") {
    throw new WithdrawalError(
      "ENCRYPTION_KEY_MISSING",
      "Ключ шифрования реквизитов не задан",
    );
  }
  // Локальная разработка: детерминированный ключ-заглушка.
  return Buffer.alloc(32, 7);
}

export function encryptDetails(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [
    iv.toString("hex"),
    cipher.getAuthTag().toString("hex"),
    encrypted.toString("hex"),
  ].join(":");
}

export function decryptDetails(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivHex, "hex"),
  );
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataHex, "hex")),
    decipher.final(),
  ]).toString("utf8");
}

// ── Валидация реквизитов ─────────────────────────────────────────────────────

/** Алгоритм Луна — отсекает опечатки в номере карты до создания заявки. */
export function isValidCardNumber(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 16 || digits.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let d = Number(digits[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Проверка крипто-адреса по формату.
 * Полная проверка контрольной суммы base58check делается на бэкенде выплат;
 * здесь — быстрый отсев очевидного мусора до создания заявки.
 */
export function isValidCryptoAddress(kind: PayoutMethodKind, address: string): boolean {
  const value = address.trim();
  switch (kind) {
    case "USDT_TRC20":
      return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(value);
    case "USDT_ERC20":
      return /^0x[a-fA-F0-9]{40}$/.test(value);
    case "USDT_TON":
      return /^(UQ|EQ|0:)[A-Za-z0-9_-]{46,}$/.test(value);
    default:
      return false;
  }
}

// ── Курс RUB → USDT ──────────────────────────────────────────────────────────

/**
 * Курс фиксируется в момент создания заявки, иначе движение рынка между
 * заявкой и выплатой превращается в спор с пользователем.
 * В продакшене — агрегат из 2–3 источников с проверкой на аномалию.
 */
export async function getRubUsdtRate(): Promise<{
  rate: Prisma.Decimal;
  source: string;
}> {
  const latest = await db.exchangeRate.findFirst({
    where: { pair: "RUB/USDT" },
    orderBy: { fetchedAt: "desc" },
  });
  if (latest) return { rate: new D(latest.rate), source: latest.source };
  return { rate: new D("95.00"), source: "fallback" };
}

// ── Расчёт заявки ────────────────────────────────────────────────────────────

export type WithdrawalQuote = {
  amountGross: string;
  feePercent: string;
  fee: string;
  amountNet: string;
  payoutCurrency: string;
  cryptoAmount: string | null;
  fxRate: string | null;
  minAmount: string;
  displayNet: string;
};

export async function quoteWithdrawal(
  kind: PayoutMethodKind,
  amountGross: Prisma.Decimal | number | string,
): Promise<WithdrawalQuote> {
  const gross = new D(amountGross);
  const isCrypto = PAYOUT_METHOD[kind].currency === "USDT";

  const feePercent = new D(
    await getSetting(isCrypto ? "withdrawal.fee.USDT" : "withdrawal.fee.RUB_CARD", isCrypto ? 2 : 0),
  );
  const minAmount = new D(
    await getSetting(
      isCrypto ? "withdrawal.min.USDT" : "withdrawal.min.RUB_CARD",
      isCrypto ? 1000 : 500,
    ),
  );

  const fee = gross.mul(feePercent).div(100).toDecimalPlaces(2, D.ROUND_UP);
  const net = gross.minus(fee);

  if (!isCrypto) {
    return {
      amountGross: gross.toFixed(2),
      feePercent: feePercent.toFixed(2),
      fee: fee.toFixed(2),
      amountNet: net.toFixed(2),
      payoutCurrency: "RUB",
      cryptoAmount: null,
      fxRate: null,
      minAmount: minAmount.toFixed(2),
      displayNet: formatMoney(net),
    };
  }

  const { rate } = await getRubUsdtRate();
  const spread = new D(await getSetting("fx.spread.percent", 2));
  const effectiveRate = rate.mul(new D(100).plus(spread)).div(100);
  const cryptoAmount = net.div(effectiveRate).toDecimalPlaces(2, D.ROUND_DOWN);

  return {
    amountGross: gross.toFixed(2),
    feePercent: feePercent.toFixed(2),
    fee: fee.toFixed(2),
    amountNet: net.toFixed(2),
    payoutCurrency: "USDT",
    cryptoAmount: cryptoAmount.toFixed(2),
    fxRate: effectiveRate.toFixed(2),
    minAmount: minAmount.toFixed(2),
    displayNet: formatCrypto(cryptoAmount),
  };
}

// ── Создание заявки ──────────────────────────────────────────────────────────

/**
 * Средства замораживаются в той же транзакции, что и создание заявки.
 * Без этого пользователь создаёт десять заявок на один и тот же баланс,
 * и мы платим десять раз.
 */
export async function createWithdrawal(
  user: User,
  methodId: string,
  amountGross: Prisma.Decimal | number | string,
) {
  const method = await db.payoutMethod.findFirst({
    where: { id: methodId, userId: user.id, deletedAt: null },
  });
  if (!method) throw new WithdrawalError("METHOD_NOT_FOUND", "Реквизиты не найдены");

  const gross = new D(amountGross);
  const quote = await quoteWithdrawal(method.kind, gross);

  if (gross.lt(new D(quote.minAmount))) {
    throw new WithdrawalError(
      "BELOW_MINIMUM",
      `Минимальная сумма вывода — ${formatMoney(quote.minAmount)}`,
    );
  }

  const dailyLimit = new D(await getSetting("withdrawal.dailyLimit.user", 50000));
  const since = new Date(Date.now() - 86_400_000);
  const id = crypto.randomUUID();
  const isCrypto = PAYOUT_METHOD[method.kind].currency === "USDT";

  return db.$transaction(async (tx) => {
    const liveMethod = await tx.payoutMethod.findFirst({
      where: { id: method.id, userId: user.id, deletedAt: null },
    });
    if (!liveMethod) {
      throw new WithdrawalError("METHOD_NOT_FOUND", "Реквизиты не найдены");
    }

    await lockWallet(tx, user.id);
    const wallet = await tx.wallet.findUnique({
      where: { userId_currency: { userId: user.id, currency: "RUB" } },
    });
    if (!wallet || new D(wallet.available).lt(gross)) {
      throw new WithdrawalError(
        "INSUFFICIENT_FUNDS",
        `Доступно только ${formatMoney(wallet?.available ?? 0)}`,
      );
    }

    const activeCount = await tx.withdrawal.count({
      where: {
        userId: user.id,
        status: { in: ["PENDING_REVIEW", "APPROVED", "PROCESSING", "SENT"] },
      },
    });
    if (activeCount > 0) {
      throw new WithdrawalError(
        "ACTIVE_REQUEST_EXISTS",
        "У вас уже есть заявка в обработке. Дождитесь её завершения",
      );
    }

    const todayTotal = await tx.withdrawal.aggregate({
      where: {
        userId: user.id,
        requestedAt: { gte: since },
        status: { notIn: ["REJECTED", "CANCELLED", "FAILED"] },
      },
      _sum: { amountGross: true },
    });
    if (new D(todayTotal._sum.amountGross ?? 0).plus(gross).gt(dailyLimit)) {
      throw new WithdrawalError(
        "DAILY_LIMIT",
        `Суточный лимит вывода — ${formatMoney(dailyLimit)}`,
      );
    }

    const withdrawal = await tx.withdrawal.create({
      data: {
        id,
        publicCode: publicCode("WD"),
        userId: user.id,
        walletId: wallet.id,
        methodId: method.id,
        status: "PENDING_REVIEW",
        amountGross: gross,
        fee: new D(quote.fee),
        amountNet: new D(quote.amountNet),
        payoutCurrency: quote.payoutCurrency,
        fxRate: quote.fxRate ? new D(quote.fxRate) : null,
        fxSource: isCrypto ? "aggregate" : null,
        fxLockedAt: isCrypto ? new Date() : null,
        cryptoAmount: quote.cryptoAmount ? new D(quote.cryptoAmount) : null,
        methodKind: method.kind,
        methodSnapshot: {
          kind: method.kind,
          masked: method.maskedValue,
          holderName: method.holderName,
          network: PAYOUT_METHOD[method.kind].network ?? null,
        },
        provider: isCrypto ? "CRYPTO_HOT_WALLET" : "MANUAL",
        network: PAYOUT_METHOD[method.kind].network ?? null,
        idempotencyKey: `withdrawal:${id}:create`,
        antifraud: await runAntifraudChecks(user.id, gross),
      },
    });

    await postLedgerEntry(tx, {
      userId: user.id,
      direction: "DEBIT",
      type: "WITHDRAWAL_HOLD",
      amount: gross,
      idempotencyKey: `withdrawal:${withdrawal.id}:hold`,
      description: `Заявка на вывод ${withdrawal.publicCode}`,
      withdrawalId: withdrawal.id,
    });

    await tx.withdrawalEvent.create({
      data: {
        withdrawalId: withdrawal.id,
        actorType: "USER",
        actorId: user.id,
        toStatus: "PENDING_REVIEW",
        comment: "Заявка создана, средства заморожены",
      },
    });

    await tx.payoutMethod.update({
      where: { id: method.id },
      data: { lastUsedAt: new Date() },
    });

    await notify(tx, {
      userId: user.id,
      type: "WITHDRAWAL_CREATED",
      title: "Заявка на вывод создана",
      body: `${formatMoney(gross)} → ${quote.displayNet} на ${method.maskedValue}. Обрабатываем.`,
      deepLink: "/profile",
      entityType: "withdrawal",
      entityId: withdrawal.id,
    });

    return withdrawal;
  });
}

async function runAntifraudChecks(
  userId: string,
  amount: Prisma.Decimal,
): Promise<Prisma.InputJsonValue> {
  const [user, rejected, approved] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { createdAt: true, riskScore: true },
    }),
    db.taskSubmission.count({ where: { userId, status: "REJECTED" } }),
    db.taskSubmission.count({ where: { userId, status: "PAID" } }),
  ]);

  const accountAgeHours = user
    ? Math.floor((Date.now() - user.createdAt.getTime()) / 3_600_000)
    : 0;
  const total = rejected + approved;
  const rejectRate = total > 0 ? Math.round((rejected / total) * 100) : 0;

  const flags: string[] = [];
  if (accountAgeHours < 24) flags.push("account_younger_than_24h");
  if (rejectRate > 40) flags.push("high_reject_rate");
  if ((user?.riskScore ?? 0) >= 50) flags.push("high_risk_score");
  if (approved === 0) flags.push("no_paid_tasks");

  return {
    accountAgeHours,
    rejectRatePercent: rejectRate,
    riskScore: user?.riskScore ?? 0,
    paidTasks: approved,
    amount: amount.toFixed(2),
    flags,
    checkedAt: new Date().toISOString(),
  };
}

// ── Переходы статусов ────────────────────────────────────────────────────────

export async function approveWithdrawal(actorId: string, withdrawalId: string) {
  return db.$transaction(async (tx) => {
    const claimed = await tx.withdrawal.updateMany({
      where: { id: withdrawalId, status: "PENDING_REVIEW" },
      data: { status: "APPROVED", reviewerId: actorId, reviewedAt: new Date() },
    });
    if (claimed.count !== 1) {
      const existing = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
      if (!existing) throw new WithdrawalError("NOT_FOUND", "Заявка не найдена");
      throw new WithdrawalError("BAD_STATUS", "Заявка уже обработана");
    }
    const updated = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });
    const w = updated;
    await tx.withdrawalEvent.create({
      data: {
        withdrawalId: w.id,
        actorType: "ADMIN",
        actorId,
        fromStatus: "PENDING_REVIEW",
        toStatus: "APPROVED",
        comment: "Заявка одобрена к выплате",
      },
    });
    await tx.auditLog.create({
      data: {
        actorId,
        action: "withdrawal.approve",
        entityType: "withdrawal",
        entityId: w.id,
        after: { status: "APPROVED" },
      },
    });
    // Отправку забирает payout-worker: процесс с ключами не принимает
    // входящих запросов из интернета.
    await tx.outboxEvent.create({
      data: { topic: "payout.send", payload: { withdrawalId: w.id } },
    });
    return updated;
  });
}

/** Отметка «отправлено»: для крипты — с хэшем транзакции. */
export async function markWithdrawalSent(
  actorId: string,
  withdrawalId: string,
  txHash: string,
) {
  return db.$transaction(async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w) throw new WithdrawalError("NOT_FOUND", "Заявка не найдена");
    const claimed = await tx.withdrawal.updateMany({
      where: { id: withdrawalId, status: { in: ["APPROVED", "PROCESSING"] } },
      data: {
        status: "SENT",
        txHash,
        providerRef: txHash,
        processedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new WithdrawalError("BAD_STATUS", "Заявка не одобрена к выплате");
    }
    const updated = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });

    if (w.payoutCurrency === "USDT" && w.network) {
      await tx.cryptoTransaction.upsert({
        where: { network_txHash: { network: w.network, txHash } },
        create: {
          withdrawalId: w.id,
          network: w.network,
          toAddress:
            (w.methodSnapshot as { masked?: string } | null)?.masked ?? "unknown",
          amount: w.cryptoAmount ?? new D(0),
          txHash,
          broadcastAt: new Date(),
        },
        update: {},
      });
    }

    await tx.withdrawalEvent.create({
      data: {
        withdrawalId: w.id,
        actorType: "ADMIN",
        actorId,
        fromStatus: w.status,
        toStatus: "SENT",
        comment: `Отправлено. Референс: ${txHash}`,
      },
    });

    return updated;
  });
}

/** Финализация после подтверждений в сети: закрываем hold. */
export async function completeWithdrawal(withdrawalId: string, actorId?: string) {
  return db.$transaction(async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w) throw new WithdrawalError("NOT_FOUND", "Заявка не найдена");
    const claimed = await tx.withdrawal.updateMany({
      where: {
        id: withdrawalId,
        status: { in: ["SENT", "PROCESSING", "APPROVED"] },
      },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new WithdrawalError("BAD_STATUS", "Заявка не в состоянии отправки");
    }
    const updated = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });

    await postLedgerEntry(tx, {
      userId: w.userId,
      direction: "DEBIT",
      type: "WITHDRAWAL_SETTLED",
      amount: w.amountGross,
      idempotencyKey: `withdrawal:${w.id}:settled`,
      description: `Вывод ${w.publicCode} завершён`,
      withdrawalId: w.id,
    });

    await tx.userStats.update({
      where: { userId: w.userId },
      data: { totalWithdrawn: { increment: w.amountGross } },
    });

    await tx.withdrawalEvent.create({
      data: {
        withdrawalId: w.id,
        actorType: actorId ? "ADMIN" : "SYSTEM",
        actorId,
        fromStatus: w.status,
        toStatus: "COMPLETED",
        comment: "Выплата подтверждена",
      },
    });

    const received =
      w.payoutCurrency === "USDT"
        ? formatCrypto(w.cryptoAmount ?? 0)
        : formatMoney(w.amountNet);

    await notify(tx, {
      userId: w.userId,
      type: "WITHDRAWAL_COMPLETED",
      title: "Выплата отправлена",
      body: `${received} отправлены на ${(w.methodSnapshot as { masked?: string })?.masked ?? "ваши реквизиты"}.`,
      deepLink: "/profile",
      entityType: "withdrawal",
      entityId: w.id,
    });

    return updated;
  });
}

/**
 * Отказ или техническая ошибка — средства возвращаются на баланс.
 * Идемпотентный ключ гарантирует, что повторный отказ не удвоит возврат.
 */
export async function refundWithdrawal(
  withdrawalId: string,
  outcome: "REJECTED" | "FAILED" | "CANCELLED",
  reason: string,
  actorId?: string,
) {
  return db.$transaction(async (tx) => {
    const w = await tx.withdrawal.findUnique({ where: { id: withdrawalId } });
    if (!w) throw new WithdrawalError("NOT_FOUND", "Заявка не найдена");
    const claimed = await tx.withdrawal.updateMany({
      where: {
        id: withdrawalId,
        status: { in: ["PENDING_REVIEW", "APPROVED", "PROCESSING", "SENT"] },
      },
      data: {
        status: outcome,
        failureReason: reason,
        reviewerId: actorId ?? w.reviewerId,
        reviewedAt: new Date(),
      },
    });
    if (claimed.count !== 1) {
      throw new WithdrawalError("BAD_STATUS", "Заявка уже в терминальном статусе");
    }
    const updated = await tx.withdrawal.findUniqueOrThrow({ where: { id: withdrawalId } });

    await postLedgerEntry(tx, {
      userId: w.userId,
      direction: "CREDIT",
      type: "WITHDRAWAL_REFUND",
      amount: w.amountGross,
      idempotencyKey: `withdrawal:${w.id}:refund`,
      description: `Возврат по заявке ${w.publicCode}: ${reason}`,
      withdrawalId: w.id,
    });

    await tx.withdrawalEvent.create({
      data: {
        withdrawalId: w.id,
        actorType: actorId ? "ADMIN" : "SYSTEM",
        actorId,
        fromStatus: w.status,
        toStatus: outcome,
        comment: reason,
      },
    });

    if (outcome !== "CANCELLED") {
      await notify(tx, {
        userId: w.userId,
        type: "WITHDRAWAL_FAILED",
        title: outcome === "REJECTED" ? "Заявка отклонена" : "Выплата не прошла",
        body: `${reason} ${formatMoney(w.amountGross)} возвращены на баланс.`,
        deepLink: "/profile",
        entityType: "withdrawal",
        entityId: w.id,
      });
    }

    return updated;
  });
}

export async function getUserWithdrawals(userId: string) {
  return db.withdrawal.findMany({
    where: { userId },
    orderBy: { requestedAt: "desc" },
    take: 30,
  });
}

export async function getPayoutQueue() {
  return db.withdrawal.findMany({
    where: {
      status: { in: ["PENDING_REVIEW", "APPROVED", "PROCESSING", "SENT"] },
    },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          telegramId: true,
          riskScore: true,
          createdAt: true,
        },
      },
    },
    orderBy: [{ status: "asc" }, { requestedAt: "asc" }],
    take: 100,
  });
}

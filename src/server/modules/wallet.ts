import { Prisma } from "@/generated/prisma";
import type { LedgerDirection, LedgerEntryType } from "@/generated/prisma";
import { db } from "@/server/db";

type Tx = Prisma.TransactionClient;

const D = Prisma.Decimal;

export type LedgerInput = {
  userId: string;
  direction: LedgerDirection;
  type: LedgerEntryType;
  amount: Prisma.Decimal | number | string;
  /**
   * Ключ идемпотентности. Формат: "<сущность>:<id>:<операция>".
   * Уникальный индекс в БД физически исключает двойное начисление —
   * это последняя линия защиты, которая работает даже если логика выше сломана.
   */
  idempotencyKey: string;
  description?: string;
  submissionId?: string;
  withdrawalId?: string;
  createdById?: string;
  /** Зачислить в pending (холд) вместо available. */
  toPending?: boolean;
  meta?: Prisma.InputJsonValue;
};

export class LedgerError extends Error {
  constructor(
    public code:
      | "WALLET_NOT_FOUND"
      | "INSUFFICIENT_FUNDS"
      | "ALREADY_APPLIED"
      | "INVALID_AMOUNT",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "LedgerError";
  }
}

/**
 * Единственный способ изменить баланс.
 *
 * Инварианты:
 *  1. Запись в леджер и обновление кэша в wallets — в одной транзакции.
 *  2. Повторный вызов с тем же idempotencyKey не меняет баланс (возвращает
 *     существующую запись). Это норма при ретраях воркеров и постбеках.
 *  3. DEBIT не может увести available в минус.
 *
 * Функция принимает транзакционный клиент, потому что почти всегда вызывается
 * внутри более широкой бизнес-транзакции (одобрение выполнения, создание вывода).
 */
export async function postLedgerEntry(tx: Tx, input: LedgerInput) {
  const amount = new D(input.amount);

  if (amount.lte(0)) {
    throw new LedgerError("INVALID_AMOUNT", "Сумма операции должна быть больше нуля");
  }

  const existing = await tx.ledgerEntry.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) return { entry: existing, applied: false as const };

  const wallet = await tx.wallet.findUnique({
    where: { userId_currency: { userId: input.userId, currency: "RUB" } },
  });
  if (!wallet) throw new LedgerError("WALLET_NOT_FOUND");

  let available = new D(wallet.available);
  let pending = new D(wallet.pending);
  let hold = new D(wallet.hold);
  let totalEarned = new D(wallet.totalEarned);
  let totalWithdrawn = new D(wallet.totalWithdrawn);

  if (input.direction === "CREDIT") {
    if (input.toPending) {
      pending = pending.plus(amount);
    } else {
      available = available.plus(amount);
    }
    if (input.type === "TASK_REWARD" || input.type === "REFERRAL_BONUS") {
      totalEarned = totalEarned.plus(amount);
    }
    if (input.type === "WITHDRAWAL_REFUND") {
      hold = D.max(hold.minus(amount), new D(0));
    }
  } else {
    if (input.type === "WITHDRAWAL_HOLD") {
      if (available.lt(amount)) {
        throw new LedgerError(
          "INSUFFICIENT_FUNDS",
          "Недостаточно средств на балансе",
        );
      }
      available = available.minus(amount);
      hold = hold.plus(amount);
    } else if (input.type === "WITHDRAWAL_SETTLED") {
      // Средства уже сняты с available на этапе холда — закрываем hold.
      hold = D.max(hold.minus(amount), new D(0));
      totalWithdrawn = totalWithdrawn.plus(amount);
    } else {
      if (available.lt(amount)) {
        throw new LedgerError(
          "INSUFFICIENT_FUNDS",
          "Недостаточно средств на балансе",
        );
      }
      available = available.minus(amount);
    }
  }

  const entry = await tx.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: input.userId,
      direction: input.direction,
      type: input.type,
      amount,
      currency: "RUB",
      balanceAfter: available,
      submissionId: input.submissionId,
      withdrawalId: input.withdrawalId,
      idempotencyKey: input.idempotencyKey,
      description: input.description,
      createdById: input.createdById,
      meta: input.meta ?? {},
    },
  });

  await tx.wallet.update({
    where: { id: wallet.id },
    data: {
      available,
      pending,
      hold,
      totalEarned,
      totalWithdrawn,
      version: { increment: 1 },
    },
  });

  return { entry, applied: true as const };
}

/**
 * Перевод из pending в available — снятие холда после одобрения выполнения.
 * Отдельная операция, потому что это не приход денег, а изменение их состояния:
 * в леджере уже есть запись TASK_REWARD, дублировать её нельзя.
 */
export async function releaseHold(
  tx: Tx,
  userId: string,
  amount: Prisma.Decimal | number | string,
) {
  const wallet = await tx.wallet.findUnique({
    where: { userId_currency: { userId, currency: "RUB" } },
  });
  if (!wallet) throw new LedgerError("WALLET_NOT_FOUND");

  const value = new D(amount);
  const pending = D.max(new D(wallet.pending).minus(value), new D(0));
  const available = new D(wallet.available).plus(value);

  await tx.wallet.update({
    where: { id: wallet.id },
    data: { pending, available, version: { increment: 1 } },
  });

  return { available, pending };
}

export async function getWallet(userId: string) {
  const wallet = await db.wallet.findUnique({
    where: { userId_currency: { userId, currency: "RUB" } },
  });
  if (wallet) return wallet;
  return db.wallet.create({ data: { userId, currency: "RUB" } });
}

/**
 * Сверка: кэш в wallets против суммы по леджеру.
 * Запускается ночным воркером; расхождение — инцидент первого приоритета,
 * потому что означает либо баг в транзакциях, либо прямую правку данных.
 */
/**
 * Инвариант сверки:
 *
 *   available + pending + hold
 *     = SUM(CREDIT, кроме WITHDRAWAL_REFUND)
 *     − SUM(DEBIT,  кроме WITHDRAWAL_HOLD)
 *
 * Исключения не произвольные: WITHDRAWAL_HOLD и WITHDRAWAL_REFUND не меняют
 * общую сумму в кошельке, а только переносят её между available и hold.
 * Реально уменьшает баланс лишь WITHDRAWAL_SETTLED.
 */
export async function reconcileWallet(userId: string) {
  const [wallet, credits, debits] = await Promise.all([
    getWallet(userId),
    db.ledgerEntry.aggregate({
      where: { userId, direction: "CREDIT", type: { not: "WITHDRAWAL_REFUND" } },
      _sum: { amount: true },
    }),
    db.ledgerEntry.aggregate({
      where: { userId, direction: "DEBIT", type: { not: "WITHDRAWAL_HOLD" } },
      _sum: { amount: true },
    }),
  ]);

  const expected = new D(credits._sum.amount ?? 0).minus(
    new D(debits._sum.amount ?? 0),
  );
  const actual = new D(wallet.available).plus(wallet.pending).plus(wallet.hold);

  return {
    userId,
    expected: expected.toFixed(2),
    actual: actual.toFixed(2),
    balanced: expected.minus(actual).abs().lte(new D("0.01")),
    wallet,
  };
}

export async function getTransactions(
  userId: string,
  options: { take?: number; cursor?: string; type?: LedgerEntryType } = {},
) {
  const take = options.take ?? 30;
  return db.ledgerEntry.findMany({
    where: { userId, ...(options.type ? { type: options.type } : {}) },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    include: {
      submission: { select: { publicCode: true, offer: { select: { title: true } } } },
      withdrawal: { select: { publicCode: true, methodKind: true } },
    },
  });
}

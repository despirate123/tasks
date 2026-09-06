import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma";
import { db } from "@/server/db";
import { completeWithdrawal, refundWithdrawal } from "@/server/modules/withdrawals";

/** Число подтверждений, после которого транзакцию считаем финальной. */
const CONFIRMATIONS_REQUIRED: Record<string, number> = {
  TRON: 19,
  TON: 1,
  Ethereum: 12,
};

/**
 * Подтверждения крипто-транзакций от провайдера выплат.
 *
 * Идемпотентность здесь критична: двойная крипто-выплата необратима.
 * Барьеры:
 *  1. crypto_transactions(network, txHash) UNIQUE — повторный вебхук
 *     не создаст вторую транзакцию;
 *  2. completeWithdrawal пишет леджер с idempotencyKey — двойного
 *     списания hold не произойдёт даже при гонке вебхуков;
 *  3. проверка текущего статуса заявки перед любым переходом.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const signature = request.headers.get("x-signature") ?? "";
  const secret = process.env.CRYPTO_WEBHOOK_SECRET;

  if (secret) {
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Без секрета в продакшене вебхук принимать нельзя: это открытая
    // ручка для подтверждения чужих выплат.
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }

  const body = JSON.parse(raw) as {
    withdrawalId?: string;
    txHash?: string;
    network?: string;
    confirmations?: number;
    status?: string;
    amount?: string;
    feePaid?: string;
    reason?: string;
  };

  if (!body.withdrawalId || !body.network) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const withdrawal = await db.withdrawal.findUnique({
    where: { id: body.withdrawalId },
  });
  if (!withdrawal) {
    return NextResponse.json({ error: "withdrawal not found" }, { status: 404 });
  }

  if (body.status === "failed") {
    if (["COMPLETED", "FAILED", "REJECTED", "CANCELLED"].includes(withdrawal.status)) {
      return NextResponse.json({ ok: true, note: "уже в терминальном статусе" });
    }
    await refundWithdrawal(
      withdrawal.id,
      "FAILED",
      body.reason ?? "Транзакция не прошла в сети",
    );
    return NextResponse.json({ ok: true });
  }

  if (!body.txHash) {
    return NextResponse.json({ error: "missing txHash" }, { status: 400 });
  }

  const confirmations = body.confirmations ?? 0;

  await db.cryptoTransaction.upsert({
    where: { network_txHash: { network: body.network, txHash: body.txHash } },
    create: {
      withdrawalId: withdrawal.id,
      network: body.network,
      toAddress:
        (withdrawal.methodSnapshot as { masked?: string } | null)?.masked ?? "unknown",
      amount: withdrawal.cryptoAmount ?? new Prisma.Decimal(0),
      txHash: body.txHash,
      confirmations,
      feePaid: body.feePaid ? new Prisma.Decimal(body.feePaid) : null,
      rawPayload: body as never,
      broadcastAt: new Date(),
    },
    update: {
      confirmations,
      feePaid: body.feePaid ? new Prisma.Decimal(body.feePaid) : undefined,
      rawPayload: body as never,
      confirmedAt:
        confirmations >= (CONFIRMATIONS_REQUIRED[body.network] ?? 12)
          ? new Date()
          : null,
    },
  });

  const required = CONFIRMATIONS_REQUIRED[body.network] ?? 12;

  if (confirmations < required) {
    // Транзакция в сети, но не финальна — фиксируем факт отправки и ждём.
    if (["APPROVED", "PROCESSING"].includes(withdrawal.status)) {
      await db.withdrawal.update({
        where: { id: withdrawal.id },
        data: {
          status: "SENT",
          txHash: body.txHash,
          providerRef: body.txHash,
          confirmations,
          processedAt: new Date(),
        },
      });
    } else {
      await db.withdrawal.update({
        where: { id: withdrawal.id },
        data: { confirmations },
      });
    }
    return NextResponse.json({ ok: true, status: "pending_confirmations" });
  }

  if (withdrawal.status === "COMPLETED") {
    return NextResponse.json({ ok: true, note: "уже подтверждена" });
  }

  await db.withdrawal.update({
    where: { id: withdrawal.id },
    data: { txHash: body.txHash, providerRef: body.txHash, confirmations },
  });

  await completeWithdrawal(withdrawal.id);

  return NextResponse.json({ ok: true, status: "completed" });
}

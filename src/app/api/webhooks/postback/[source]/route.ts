import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/server/db";

/**
 * Постбеки партнёрских сетей.
 *
 * Сеть сообщает, что конверсия подтверждена или отменена. Это позволяет
 * автоподтверждать выполнения, не дожидаясь ручной модерации, и — что
 * важнее — узнавать об отмене конверсии до того, как мы выплатим деньги.
 *
 * Требования безопасности:
 *  - подпись HMAC от сырого тела (сравнение timing-safe);
 *  - allowlist IP на уровне reverse proxy;
 *  - сырой запрос всегда пишется в postback_logs, даже если обработка упала:
 *    без этого спорные конверсии невозможно разобрать.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ source: string }> },
) {
  const { source } = await params;
  const raw = await request.text();
  const signature = request.headers.get("x-signature");
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    // Заголовки с секретами в лог не попадают.
    if (!/authorization|cookie|x-api-key/i.test(key)) headers[key] = value;
  });

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    payload = Object.fromEntries(new URLSearchParams(raw));
  }

  const clickId =
    (payload.click_id as string) ??
    (payload.sub_id as string) ??
    (payload.subid as string) ??
    null;
  const status = (payload.status as string) ?? (payload.state as string) ?? null;

  const log = await db.postbackLog.create({
    data: {
      sourceCode: source.toUpperCase(),
      clickId,
      status,
      payload: payload as never,
      headers: headers as never,
      ip,
    },
  });

  const secret = process.env[`${source.toUpperCase()}_POSTBACK_SECRET`];
  if (secret) {
    const expected = createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(signature ?? "", "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      await db.postbackLog.update({
        where: { id: log.id },
        data: { error: "BAD_SIGNATURE" },
      });
      return NextResponse.json({ error: "bad signature" }, { status: 401 });
    }
  }

  if (!clickId) {
    await db.postbackLog.update({
      where: { id: log.id },
      data: { error: "MISSING_CLICK_ID" },
    });
    // 200, чтобы сеть не ретраила бесконечно то, что мы всё равно не обработаем.
    return NextResponse.json({ ok: true, note: "click_id отсутствует" });
  }

  const submission = await db.taskSubmission.findUnique({
    where: { clickId },
    include: { offer: { select: { title: true } } },
  });

  if (!submission) {
    await db.postbackLog.update({
      where: { id: log.id },
      data: { error: "SUBMISSION_NOT_FOUND" },
    });
    return NextResponse.json({ ok: true, note: "выполнение не найдено" });
  }

  const normalized = (status ?? "").toLowerCase();
  const isApproved = ["approved", "confirmed", "sale", "lead"].includes(normalized);
  const isRejected = ["rejected", "declined", "cancelled", "trash"].includes(
    normalized,
  );

  await db.submissionEvent.create({
    data: {
      submissionId: submission.id,
      actorType: "NETWORK",
      comment: `Постбек ${source}: ${status ?? "без статуса"}`,
      payload: payload as never,
    },
  });

  // Постбек не одобряет выполнение сам: он снимает риск и повышает
  // приоритет в очереди либо, наоборот, помечает выполнение для внимания
  // модератора. Решение о деньгах остаётся за человеком или за правилом
  // автоодобрения, которое учитывает совокупность признаков.
  if (isApproved && submission.status === "PENDING_REVIEW") {
    await db.taskSubmission.update({
      where: { id: submission.id },
      data: { riskScore: { decrement: Math.min(submission.riskScore, 10) } },
    });
  }

  if (isRejected && ["PENDING_REVIEW", "IN_REVIEW"].includes(submission.status)) {
    await db.taskSubmission.update({
      where: { id: submission.id },
      data: { riskScore: { increment: 30 } },
    });
  }

  await db.postbackLog.update({
    where: { id: log.id },
    data: { processed: true },
  });

  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import {
  createSession,
  upsertUserFromTelegram,
  verifyInitData,
} from "@/server/auth";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Единственная точка входа в приложение.
 *
 * Клиент присылает сырую строку initData из Telegram WebApp; сервер проверяет
 * HMAC-подпись секретом бота и свежесть auth_date. Никакого «своего» логина
 * с паролями нет и не будет: пароли к деньгам — это лишний вектор атаки,
 * а Telegram уже аутентифицировал пользователя за нас.
 */
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`auth:${ip}`, 40, 60_000)) {
    return NextResponse.json(
      { error: { code: "RATE_LIMITED", message: "Слишком много попыток входа" } },
      { status: 429 },
    );
  }

  const body = (await request.json().catch(() => null)) as
    | { initData?: string }
    | null;

  if (!body?.initData) {
    return NextResponse.json(
      { error: { code: "MISSING_INIT_DATA", message: "initData не передан" } },
      { status: 400 },
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const verified = verifyInitData(body.initData, botToken);

  if (!verified.ok) {
    // BOT_TOKEN_NOT_CONFIGURED в dev — ожидаемое состояние: приложение
    // работает через DEV_AUTH_BYPASS с демо-пользователем.
    const status = verified.reason === "BOT_TOKEN_NOT_CONFIGURED" ? 503 : 401;
    return NextResponse.json(
      { error: { code: verified.reason, message: "Не удалось подтвердить вход" } },
      { status },
    );
  }

  const user = await upsertUserFromTelegram(verified.user, verified.startParam);

  if (user.status === "BLOCKED") {
    return NextResponse.json(
      {
        error: {
          code: "USER_BLOCKED",
          message: user.statusReason ?? "Доступ к сервису ограничен",
        },
      },
      { status: 403 },
    );
  }

  await createSession(user.id);

  return NextResponse.json({
    user: {
      id: user.id,
      firstName: user.firstName,
      username: user.username,
      role: user.role,
      referralCode: user.referralCode,
    },
  });
}

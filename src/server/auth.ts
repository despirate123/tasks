import { createHmac, timingSafeEqual } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { db } from "@/server/db";
import { referralCode } from "@/lib/utils";
import type { User, UserRole } from "@/generated/prisma";

const SESSION_COOKIE = "pb_session";
const INIT_DATA_MAX_AGE_S = 86_400;

console.info(
  `[profibux] DEV_AUTH_BYPASS=${process.env.DEV_AUTH_BYPASS === "true" ? `ON (демо ${process.env.DEV_USER_TELEGRAM_ID ?? "777000001"})` : "OFF"}`,
);

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
};

/**
 * Проверка подписи Telegram initData.
 *
 * Алгоритм из документации Bot API: секретный ключ = HMAC-SHA256(botToken)
 * с ключом "WebAppData", затем сверяется HMAC от отсортированной строки полей.
 * Сравнение — timing-safe: иначе подпись можно подобрать побайтово.
 */
export function verifyInitData(
  initData: string,
  botToken: string,
): { ok: true; user: TelegramUser; startParam?: string } | { ok: false; reason: string } {
  if (!botToken) return { ok: false, reason: "BOT_TOKEN_NOT_CONFIGURED" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, reason: "MISSING_HASH" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computed = createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "BAD_SIGNATURE" };
  }

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > INIT_DATA_MAX_AGE_S) {
    return { ok: false, reason: "EXPIRED" };
  }

  const rawUser = params.get("user");
  if (!rawUser) return { ok: false, reason: "MISSING_USER" };

  try {
    const user = JSON.parse(rawUser) as TelegramUser;
    return { ok: true, user, startParam: params.get("start_param") ?? undefined };
  } catch {
    return { ok: false, reason: "BAD_USER_JSON" };
  }
}

/**
 * Создание или обновление пользователя после успешной проверки подписи.
 * Кошелёк, реферальный код и привязка пригласившего создаются здесь же —
 * один вход, одна транзакция, никаких «пользователь без кошелька».
 */
export async function upsertUserFromTelegram(
  tg: TelegramUser,
  startParam?: string,
): Promise<User> {
  const existing = await db.user.findUnique({
    where: { telegramId: BigInt(tg.id) },
  });

  if (existing) {
    return db.user.update({
      where: { id: existing.id },
      data: {
        username: tg.username ?? existing.username,
        firstName: tg.first_name ?? existing.firstName,
        lastName: tg.last_name ?? existing.lastName,
        photoUrl: tg.photo_url ?? existing.photoUrl,
        isPremium: tg.is_premium ?? existing.isPremium,
        lastSeenAt: new Date(),
        botBlockedAt: null,
      },
    });
  }

  const referrer = await resolveReferrer(startParam);

  return db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        telegramId: BigInt(tg.id),
        username: tg.username,
        firstName: tg.first_name,
        lastName: tg.last_name,
        languageCode: tg.language_code ?? "ru",
        photoUrl: tg.photo_url,
        isPremium: tg.is_premium ?? false,
        referralCode: referralCode(),
        referrerId: referrer?.id,
        lastSeenAt: new Date(),
        wallets: { create: { currency: "RUB" } },
        stats: { create: {} },
      },
    });

    if (referrer) {
      await tx.referral.create({
        data: {
          referrerId: referrer.id,
          refereeId: created.id,
          level: 1,
          source: startParam ? "bot_deeplink" : "link",
        },
      });
      await tx.userStats.update({
        where: { userId: referrer.id },
        data: { referralsTotal: { increment: 1 } },
      });
    }

    return created;
  });
}

async function resolveReferrer(startParam?: string) {
  if (!startParam) return null;
  const code = startParam.startsWith("ref_") ? startParam.slice(4) : startParam;
  if (!code) return null;
  return db.user.findUnique({ where: { referralCode: code } });
}

const SEED_TELEGRAM_FROM = 777_000_001n;
const SEED_TELEGRAM_TO = 777_000_099n;

function isSeedDemoUser(telegramId: bigint) {
  return telegramId >= SEED_TELEGRAM_FROM && telegramId <= SEED_TELEGRAM_TO;
}

export async function createSession(userId: string) {
  const jar = await cookies();
  const httpsMiniApp = (process.env.MINIAPP_URL ?? "").startsWith("https");
  jar.set(SESSION_COOKIE, userId, {
    httpOnly: true,
    // same-site: страница и API на одном хосте. SameSite=None без Secure
    // браузер и WebView Telegram просто выбрасывают — сессия не сохраняется.
    sameSite: "lax",
    secure: httpsMiniApp || process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/**
 * Текущий пользователь.
 *
 * В разработке (DEV_AUTH_BYPASS=true) подставляется демо-пользователь из сидов,
 * чтобы приложение можно было открыть в обычном браузере без Telegram.
 * В продакшене этот путь отключён — иначе это дыра размером с проект.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const sessionUserId = jar.get(SESSION_COOKIE)?.value;

  const bypass = process.env.DEV_AUTH_BYPASS === "true";

  const bypassTelegramId = bypass
    ? BigInt(process.env.DEV_USER_TELEGRAM_ID ?? "777000001")
    : null;

  if (sessionUserId) {
    const user = await db.user.findUnique({ where: { id: sessionUserId } });
    // После выключения bypass старая cookie Алексея не должна оставлять
    // админку открытой в настоящем Mini App.
    // В bypass не держим сессию другого демо-аккаунта, если в .env
    // выбран обычный участник.
    if (user) {
      const seedSession = isSeedDemoUser(user.telegramId);
      if (bypass) {
        if (!seedSession || user.telegramId === bypassTelegramId) return user;
      } else if (!seedSession) {
        return user;
      }
    }
  }

  if (bypass && bypassTelegramId != null) {
    return db.user.findUnique({ where: { telegramId: bypassTelegramId } });
  }

  return null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHORIZED");
  if (user.status === "BLOCKED") throw new Error("USER_BLOCKED");
  return user;
}

const ROLE_RANK: Record<UserRole, number> = {
  USER: 0,
  SUPPORT: 1,
  MODERATOR: 2,
  FINANCE: 3,
  ADMIN: 4,
  OWNER: 5,
};

export function hasRole(user: User, minimum: UserRole): boolean {
  return ROLE_RANK[user.role] >= ROLE_RANK[minimum];
}

/** Роль перепроверяется в БД на каждом админском запросе, а не берётся из токена. */
export async function requireRole(minimum: UserRole): Promise<User> {
  const user = await requireUser();
  if (!hasRole(user, minimum)) throw new Error("FORBIDDEN");
  return user;
}

export function displayName(user: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}) {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (user.username) return `@${user.username}`;
  return "Пользователь";
}

/**
 * Telegram-бот ProfiBux.
 *
 * Задачи бота:
 *  1. Точка входа в Mini App (кнопка запуска).
 *  2. Приём реферальных deep-link'ов (/start ref_XXXXXXXX).
 *  3. Доставка важных уведомлений — Telegram уже решил задачу пробуждения
 *     устройства, своих push нам не нужно.
 *
 * Отдельный процесс, а не часть Next.js: webhook-нагрузка не должна
 * конкурировать за event loop с рендером Mini App.
 */

import { Bot, InlineKeyboard } from "grammy";
import { PrismaClient } from "../src/generated/prisma";

const db = new PrismaClient();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error(
    "TELEGRAM_BOT_TOKEN не задан. Получите токен у @BotFather и добавьте в .env",
  );
  process.exit(1);
}

function miniAppUrl(raw: string) {
  const url = raw.trim().replace(/\/$/, "");
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

const MINIAPP_URL = miniAppUrl(process.env.MINIAPP_URL ?? "http://localhost:43117");
const bot = new Bot(token);

const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
function referralCode() {
  let out = "";
  for (let i = 0; i < 8; i += 1) {
    out += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return out;
}

function launchKeyboard() {
  return new InlineKeyboard().webApp("Открыть задания", MINIAPP_URL);
}

bot.command("start", async (ctx) => {
  const from = ctx.from;
  if (!from) return;

  const startParam = ctx.match?.trim();
  const existing = await db.user.findUnique({
    where: { telegramId: BigInt(from.id) },
  });

  if (existing) {
    await db.user.update({
      where: { id: existing.id },
      data: {
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
        lastSeenAt: new Date(),
        // Пользователь снова написал боту — значит разблокировал.
        botBlockedAt: null,
      },
    });

    await ctx.reply(
      `С возвращением, ${from.first_name ?? "друг"}!\n\nОткройте приложение, чтобы взять задание или вывести заработанное.`,
      { reply_markup: launchKeyboard() },
    );
    return;
  }

  // Реферальная привязка возможна только при первом входе.
  const refCode = startParam?.startsWith("ref_") ? startParam.slice(4) : null;
  const referrer = refCode
    ? await db.user.findUnique({ where: { referralCode: refCode } })
    : null;

  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        telegramId: BigInt(from.id),
        username: from.username,
        firstName: from.first_name,
        lastName: from.last_name,
        languageCode: from.language_code ?? "ru",
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
          refereeId: user.id,
          level: 1,
          source: "bot_deeplink",
        },
      });
      await tx.userStats.update({
        where: { userId: referrer.id },
        data: { referralsTotal: { increment: 1 } },
      });
      await tx.notification.create({
        data: {
          userId: referrer.id,
          type: "REFERRAL_JOINED",
          priority: "LOW",
          title: "Новый реферал",
          body: `${from.first_name ?? "Пользователь"} присоединился по вашей ссылке.`,
          deepLink: "/referrals",
          deliveries: { create: [{ channel: "IN_APP", status: "SENT", sentAt: new Date() }] },
        },
      });
    }

    return user;
  });

  await ctx.reply(
    [
      `Привет, ${from.first_name ?? "друг"}!`,
      "",
      "ProfiBux — задания за вознаграждение. Как это работает:",
      "",
      "1. Выбираете задание в каталоге",
      "2. Выполняете условия",
      "3. Загружаете доказательства: фото, видео или комментарий",
      "4. После проверки деньги приходят на баланс",
      "",
      "Вывод — на карту, по СБП или в USDT.",
      referrer ? "\nВы пришли по приглашению — спасибо!" : "",
    ]
      .filter(Boolean)
      .join("\n"),
    { reply_markup: launchKeyboard() },
  );

  console.log(`Новый пользователь: ${created.telegramId}`);
});

bot.command("balance", async (ctx) => {
  if (!ctx.from) return;
  const user = await db.user.findUnique({
    where: { telegramId: BigInt(ctx.from.id) },
    include: { wallets: { where: { currency: "RUB" } } },
  });
  const wallet = user?.wallets[0];

  if (!wallet) {
    await ctx.reply("Сначала откройте приложение командой /start.", {
      reply_markup: launchKeyboard(),
    });
    return;
  }

  const fmt = (v: unknown) => `${Number(v).toLocaleString("ru-RU")} ₽`;
  const lines = [`Доступно к выводу: ${fmt(wallet.available)}`];
  if (Number(wallet.pending) > 0) lines.push(`В обработке: ${fmt(wallet.pending)}`);
  if (Number(wallet.hold) > 0) lines.push(`В выводе: ${fmt(wallet.hold)}`);
  lines.push(`\nВсего заработано: ${fmt(wallet.totalEarned)}`);

  await ctx.reply(lines.join("\n"), { reply_markup: launchKeyboard() });
});

bot.command("tasks", async (ctx) => {
  const offers = await db.offer.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ isFeatured: "desc" }, { rewardAmount: "desc" }],
    take: 5,
  });

  if (offers.length === 0) {
    await ctx.reply("Сейчас активных заданий нет. Заглядывайте позже.");
    return;
  }

  const lines = offers.map(
    (offer) =>
      `• ${offer.title} — ${Number(offer.rewardAmount).toLocaleString("ru-RU")} ₽`,
  );

  await ctx.reply(
    ["Топ заданий сейчас:", "", ...lines, "", "Полный каталог — в приложении."].join(
      "\n",
    ),
    { reply_markup: launchKeyboard() },
  );
});

bot.command("support", async (ctx) => {
  const username = (process.env.SUPPORT_TELEGRAM_USERNAME ?? "profibux_support").replace(
    /^@/,
    "",
  );
  await ctx.reply(
    [
      "Напишите человеку в поддержку — бот заявки не читает.",
      "",
      "В сообщении укажите код выполнения (TS-8F3K2) или заявки на вывод (WD-2M91X).",
      "",
      `Ваш Telegram ID: ${ctx.from?.id ?? "неизвестен"}`,
    ].join("\n"),
    {
      reply_markup: new InlineKeyboard().url("Написать в поддержку", `https://t.me/${username}`),
    },
  );
});

bot.on("message", async (ctx) => {
  await ctx.reply(
    "Все действия — в приложении. Команды: /tasks, /balance, /support",
    { reply_markup: launchKeyboard() },
  );
});

bot.catch((err) => {
  console.error("Ошибка бота:", err.error);
});

async function start() {
  const me = await bot.api.getMe();
  await bot.api.setChatMenuButton({
    menu_button: {
      type: "web_app",
      text: "Задания",
      web_app: { url: MINIAPP_URL },
    },
  });
  console.log(`Бот @${me.username} запущен. Mini App: ${MINIAPP_URL}`);
  await bot.start();
}

void start();

process.once("SIGINT", () => void bot.stop());
process.once("SIGTERM", () => void bot.stop());

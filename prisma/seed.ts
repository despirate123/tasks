/**
 * Сиды: справочники + демонстрационные данные.
 *
 * Справочники (источники, категории, причины отказа, шаблоны уведомлений,
 * правила антифрода, настройки) нужны в любом окружении, включая продакшн.
 * Демо-пользователи и офферы создаются только когда SEED_DEMO !== "false".
 */

import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient, Prisma } from "../src/generated/prisma";
import { writeProofFile } from "./demo-media";

const db = new PrismaClient();
const D = Prisma.Decimal;

const UPLOAD_DIR = path.join(process.cwd(), ".uploads");

const REFERRAL_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function code(length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += REFERRAL_ALPHABET[Math.floor(Math.random() * REFERRAL_ALPHABET.length)];
  }
  return out;
}

const minutesAgo = (n: number) => new Date(Date.now() - n * 60_000);
const hoursAgo = (n: number) => new Date(Date.now() - n * 3_600_000);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function seedReferenceData() {
  console.log("→ Справочники");

  const sources = [
    { code: "GETBLOGGER" as const, name: "GetBlogger", syncCron: "0 */2 * * *" },
    { code: "LEADGID" as const, name: "Leadgid", syncCron: "15 */2 * * *" },
    { code: "RAFINAD" as const, name: "Rafinad", syncCron: "30 */2 * * *" },
    { code: "MANUAL" as const, name: "Добавлено вручную", syncCron: null },
  ];
  for (const source of sources) {
    await db.offerSource.upsert({
      where: { code: source.code },
      create: source,
      update: { name: source.name },
    });
  }

  const categories = [
    { slug: "finance", name: "Финансы", icon: "💳", sortOrder: 1 },
    { slug: "marketplace", name: "Маркетплейсы", icon: "🛍", sortOrder: 2 },
    { slug: "apps", name: "Приложения", icon: "📱", sortOrder: 3 },
    { slug: "subscriptions", name: "Подписки", icon: "▶️", sortOrder: 4 },
    { slug: "surveys", name: "Опросы", icon: "📋", sortOrder: 5 },
    { slug: "games", name: "Игры", icon: "🎮", sortOrder: 6 },
    { slug: "delivery", name: "Доставка", icon: "🚀", sortOrder: 7 },
  ];
  for (const category of categories) {
    await db.category.upsert({
      where: { slug: category.slug },
      create: category,
      update: { name: category.name, icon: category.icon },
    });
  }

  // Причины отказа: модератор выбирает из списка, а не пишет текст руками.
  // Это даёт аналитику («40 % отказов — нечитаемый скриншот» → надо
  // переписать инструкцию оффера) и предсказуемые формулировки для участника.
  const reasons = [
    {
      code: "UNREADABLE_PROOF",
      title: "Скриншот нечитаемый",
      description: "Не видно ключевых деталей: суммы, даты, номера заказа.",
      allowsRevision: true,
      riskPoints: 0,
      sortOrder: 1,
    },
    {
      code: "MISSING_PROOF",
      title: "Не хватает обязательного доказательства",
      description: "Приложено меньше материалов, чем требует задание.",
      allowsRevision: true,
      riskPoints: 0,
      sortOrder: 2,
    },
    {
      code: "WRONG_STEP",
      title: "Выполнен не тот шаг",
      description: "Условия задания выполнены частично.",
      allowsRevision: true,
      riskPoints: 5,
      sortOrder: 3,
    },
    {
      code: "NOT_COMPLETED",
      title: "Действие не выполнено",
      description: "Доказательства не подтверждают выполнение условий.",
      allowsRevision: false,
      riskPoints: 10,
      sortOrder: 4,
    },
    {
      code: "FOREIGN_ACCOUNT",
      title: "Чужой аккаунт на скриншоте",
      description: "Данные не совпадают с профилем участника.",
      allowsRevision: false,
      riskPoints: 25,
      sortOrder: 5,
    },
    {
      code: "DUPLICATE",
      title: "Дубликат доказательства",
      description: "Такие же материалы уже присылали ранее.",
      allowsRevision: false,
      riskPoints: 35,
      sortOrder: 6,
    },
    {
      code: "EDITED_MEDIA",
      title: "Признаки редактирования",
      description: "Изображение выглядит изменённым в редакторе.",
      allowsRevision: false,
      riskPoints: 40,
      sortOrder: 7,
    },
    {
      code: "FRAUD_SUSPECT",
      title: "Подозрение на фрод",
      description: "Совокупность признаков указывает на недобросовестность.",
      allowsRevision: false,
      riskPoints: 50,
      sortOrder: 8,
    },
  ];
  for (const reason of reasons) {
    await db.rejectionReason.upsert({
      where: { code: reason.code },
      create: reason,
      update: { title: reason.title, description: reason.description },
    });
  }

  const programs = [
    { level: 1, minReferrals: 0, name: "Друзья", percent: new D(10), signupBonus: new D(0) },
    { level: 2, minReferrals: 0, name: "Друзья друзей", percent: new D(3), signupBonus: new D(0) },
  ];
  for (const program of programs) {
    await db.referralProgram.upsert({
      where: { level_minReferrals: { level: program.level, minReferrals: program.minReferrals } },
      create: program,
      update: { percent: program.percent, name: program.name },
    });
  }

  const fraudRules = [
    {
      code: "DUPLICATE_MEDIA",
      name: "Дубликат медиа",
      description: "Файл или близкий к нему по перцептивному хэшу уже присылали.",
      points: 40,
    },
    {
      code: "SHARED_DEVICE",
      name: "Общее устройство",
      description: "Отпечаток устройства совпадает с другим аккаунтом.",
      points: 30,
    },
    {
      code: "SHARED_IP",
      name: "Общий IP",
      description: "С этого IP выполняют задания несколько аккаунтов.",
      points: 15,
    },
    {
      code: "TOO_FAST",
      name: "Слишком быстрое выполнение",
      description: "Между взятием и отправкой прошло неправдоподобно мало времени.",
      points: 25,
    },
    {
      code: "FRESH_ACCOUNT_HIGH_REWARD",
      name: "Новый аккаунт на дорогом оффере",
      description: "Аккаунт младше суток берёт задание с высокой наградой.",
      points: 20,
    },
    {
      code: "REJECT_STREAK",
      name: "Серия отказов",
      description: "Подряд несколько отклонённых выполнений.",
      points: 20,
    },
  ];
  for (const rule of fraudRules) {
    await db.fraudRule.upsert({
      where: { code: rule.code },
      create: rule,
      update: { name: rule.name, description: rule.description, points: rule.points },
    });
  }

  // Шаблоны уведомлений редактируются в админке без релиза.
  const templates = [
    {
      type: "SUBMISSION_APPROVED" as const,
      title: "Задание подтверждено",
      body: "«{{offerTitle}}» — {{amount}} поступят на баланс.",
      priority: "HIGH" as const,
      variables: ["offerTitle", "amount"],
    },
    {
      type: "SUBMISSION_REJECTED" as const,
      title: "Задание отклонено",
      body: "«{{offerTitle}}» — {{reason}}.",
      priority: "HIGH" as const,
      variables: ["offerTitle", "reason"],
    },
    {
      type: "SUBMISSION_PAID" as const,
      title: "Деньги на балансе",
      body: "{{amount}} за «{{offerTitle}}» доступны к выводу.",
      priority: "HIGH" as const,
      variables: ["offerTitle", "amount"],
    },
    {
      type: "WITHDRAWAL_COMPLETED" as const,
      title: "Выплата отправлена",
      body: "{{amount}} отправлены на {{destination}}.",
      priority: "HIGH" as const,
      variables: ["amount", "destination"],
    },
    {
      type: "WITHDRAWAL_FAILED" as const,
      title: "Выплата не прошла",
      body: "{{reason}} Средства возвращены на баланс.",
      priority: "CRITICAL" as const,
      variables: ["reason"],
    },
    {
      type: "REFERRAL_EARNING" as const,
      title: "Реферальное начисление",
      body: "{{amount}} — ваш реферал выполнил задание.",
      priority: "NORMAL" as const,
      variables: ["amount"],
    },
  ];
  for (const template of templates) {
    for (const channel of ["IN_APP", "BOT"] as const) {
      await db.notificationTemplate.upsert({
        where: {
          type_channel_locale: { type: template.type, channel, locale: "ru" },
        },
        create: { ...template, channel, locale: "ru" },
        update: { title: template.title, body: template.body },
      });
    }
  }

  const settings: Record<string, number> = {
    "withdrawal.min.RUB_CARD": 500,
    "withdrawal.min.USDT": 1000,
    "withdrawal.fee.RUB_CARD": 0,
    "withdrawal.fee.USDT": 2,
    "withdrawal.dailyLimit.user": 50000,
    "withdrawal.autoApprove.threshold": 3000,
    "withdrawal.secondApproval.threshold": 30000,
    "offer.default.holdHours": 24,
    "offer.margin.percent": 40,
    "referral.level1.percent": 10,
    "referral.level2.percent": 3,
    "moderation.slaMinutes": 1440,
    "moderation.maxRevisions": 2,
    "fx.spread.percent": 2,
    "fx.anomaly.percent": 10,
    "antifraud.autoReviewScore": 50,
  };
  for (const [key, value] of Object.entries(settings)) {
    await db.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: {},
    });
  }

  const bannerCount = await db.promoBanner.count();
  if (bannerCount === 0) {
    await db.promoBanner.createMany({
      data: [
        {
          title: "Новые задания каждый день",
          subtitle: "В каталоге свежие CPA-офферы — бери и отправляй пруф.",
          href: "/",
          background: "#111111",
          accent: "#F7F16A",
          sortOrder: 0,
          isActive: true,
        },
        {
          title: "Приведи друга — 10%",
          subtitle: "С каждой выплаты реферала тебе капает процент на кошелёк.",
          href: "/referrals",
          background: "#1a1218",
          accent: "#F7F16A",
          sortOrder: 1,
          isActive: true,
        },
        {
          title: "Вывод без сюрпризов",
          subtitle: "Карта или крипта. Минималка и холд видны до заявки.",
          href: "/profile/withdraw",
          background: "#16120A",
          accent: "#F5C518",
          sortOrder: 2,
          isActive: true,
        },
      ],
    });
  }

  await db.exchangeRate.create({
    data: { pair: "RUB/USDT", rate: new D("94.80"), source: "seed" },
  });
}

type OfferSeed = {
  slug: string;
  source: "GETBLOGGER" | "LEADGID" | "RAFINAD" | "MANUAL";
  category: string;
  title: string;
  subtitle: string;
  description: string;
  brandName: string;
  reward: string;
  networkPayout: string;
  difficulty: "EASY" | "MEDIUM" | "HARD";
  difficultySource?: "AUTO" | "NETWORK" | "MANUAL";
  etaMinutes: number;
  etaSource?: "AUTO" | "NETWORK" | "MANUAL";
  actualEta?: number;
  holdHours: number;
  requirePhoto: boolean;
  requireVideo: boolean;
  requireComment: boolean;
  minPhotos: number;
  maxPhotos: number;
  proofHint?: string;
  completionTtlMins: number;
  promoCode?: string;
  isHot?: boolean;
  isFeatured?: boolean;
  priority?: number;
  totalLimit?: number;
  steps: { title: string; description?: string }[];
};

const OFFER_ICONS: Record<string, string> = {
  "wildberries-first-order": "/offers/wildberries.svg",
  "tinkoff-black-card": "/offers/tbank.svg",
  "yandex-eda-install": "/offers/yandex-eda.svg",
  "vk-music-subscription": "/offers/vk-music.svg",
  "broker-account-with-deposit": "/offers/invest.svg",
  "consumer-survey-15min": "/offers/researchlab.svg",
  "mobile-game-level-10": "/offers/empire-rush.svg",
  "ozon-premium-trial": "/offers/ozon.svg",
  "credit-card-cashback": "/offers/alfa.svg",
  "grocery-delivery-first-order": "/offers/samokat.svg",
  "insurance-quote-request": "/offers/strahdom.svg",
  "fitness-app-trial": "/offers/fitpro.svg",
  "neo-bank-draft": "/offers/neobank.svg",
};

const OFFERS: OfferSeed[] = [
  {
    slug: "wildberries-first-order",
    source: "GETBLOGGER",
    category: "marketplace",
    title: "Первый заказ на Wildberries с промокодом",
    subtitle: "Оформите любой заказ от 1000 ₽ по промокоду и приложите скриншот заказа",
    description:
      "Задание для новых покупателей Wildberries. Нужно зарегистрироваться (или войти в существующий аккаунт без заказов), добавить в корзину товар от 1000 ₽, применить промокод и оформить доставку в пункт выдачи.\n\nЗаказ должен быть оплачен. Отмена заказа после одобрения приводит к аннулированию вознаграждения.",
    brandName: "Wildberries",
    reward: "450",
    networkPayout: "780",
    difficulty: "EASY",
    etaMinutes: 180,
    etaSource: "NETWORK",
    actualEta: 145,
    holdHours: 24,
    requirePhoto: true,
    requireVideo: false,
    requireComment: true,
    minPhotos: 2,
    maxPhotos: 4,
    proofHint:
      "Нужны два скриншота: экран «Заказ оформлен» с номером заказа и страница «Мои заказы» со статусом.",
    completionTtlMins: 1440,
    promoCode: "PROFI450",
    isHot: true,
    isFeatured: true,
    priority: 100,
    steps: [
      { title: "Откройте Wildberries по кнопке в задании" },
      { title: "Добавьте товар от 1000 ₽ в корзину" },
      { title: "Примените промокод PROFI450", description: "Скидка появится в корзине" },
      { title: "Оформите заказ с доставкой в пункт выдачи" },
      {
        title: "Сделайте скриншоты",
        description: "Экран подтверждения с номером заказа и раздел «Мои заказы»",
      },
    ],
  },
  {
    slug: "tinkoff-black-card",
    source: "LEADGID",
    category: "finance",
    title: "Оформить дебетовую карту Т-Банк Black",
    subtitle: "Заполните заявку и дождитесь одобрения — карта бесплатная",
    description:
      "Оформите заявку на дебетовую карту. Вознаграждение выплачивается после одобрения заявки банком и активации карты.\n\nВажно: заявка должна быть новой. Если у вас уже есть карта этого банка, задание не будет одобрено.",
    brandName: "Т-Банк",
    reward: "1800",
    networkPayout: "3200",
    difficulty: "MEDIUM",
    difficultySource: "MANUAL",
    etaMinutes: 4320,
    etaSource: "MANUAL",
    actualEta: 3900,
    holdHours: 72,
    requirePhoto: true,
    requireVideo: false,
    requireComment: true,
    minPhotos: 1,
    maxPhotos: 3,
    proofHint:
      "Скриншот экрана с текстом «Заявка одобрена» или SMS от банка. Номер карты закройте — нам нужен только статус.",
    completionTtlMins: 4320,
    isFeatured: true,
    priority: 90,
    steps: [
      { title: "Перейдите на страницу оформления по кнопке" },
      { title: "Заполните заявку своими реальными данными" },
      { title: "Дождитесь решения банка", description: "Обычно от 5 минут до суток" },
      { title: "Приложите скриншот одобрения заявки" },
    ],
  },
  {
    slug: "yandex-eda-install",
    source: "RAFINAD",
    category: "apps",
    title: "Установить приложение и сделать первый заказ",
    subtitle: "Установка + заказ от 700 ₽ с промокодом на скидку",
    description:
      "Установите приложение доставки, зарегистрируйтесь по своему номеру и сделайте первый заказ от 700 ₽. Промокод даёт скидку — фактически вы платите меньше, а вознаграждение получаете сверху.",
    brandName: "Яндекс Еда",
    reward: "320",
    networkPayout: "540",
    difficulty: "EASY",
    etaMinutes: 120,
    actualEta: 95,
    holdHours: 12,
    requirePhoto: true,
    requireVideo: false,
    requireComment: true,
    minPhotos: 2,
    maxPhotos: 3,
    proofHint: "Скриншот доставленного заказа и скриншот применённого промокода.",
    completionTtlMins: 2880,
    promoCode: "PROFIEDA",
    isHot: true,
    priority: 80,
    steps: [
      { title: "Установите приложение из App Store или Google Play" },
      { title: "Зарегистрируйтесь по своему номеру телефона" },
      { title: "Соберите заказ на сумму от 700 ₽" },
      { title: "Примените промокод PROFIEDA" },
      { title: "Дождитесь доставки и приложите скриншоты" },
    ],
  },
  {
    slug: "vk-music-subscription",
    source: "MANUAL",
    category: "subscriptions",
    title: "Активировать пробную подписку на музыку",
    subtitle: "Бесплатный пробный период на 30 дней",
    description:
      "Активируйте пробную подписку. Подписку можно отменить сразу после активации — вознаграждение это не отменяет, но нужно оставаться подписчиком минимум 3 дня.",
    brandName: "VK Музыка",
    reward: "180",
    networkPayout: "300",
    difficulty: "EASY",
    etaMinutes: 60,
    actualEta: 42,
    holdHours: 72,
    requirePhoto: true,
    requireVideo: false,
    requireComment: false,
    minPhotos: 1,
    maxPhotos: 2,
    proofHint: "Скриншот раздела «Моя подписка» с активным статусом и датой окончания.",
    completionTtlMins: 720,
    priority: 60,
    steps: [
      { title: "Откройте страницу подписки" },
      { title: "Активируйте пробный период" },
      { title: "Сделайте скриншот активной подписки" },
    ],
  },
  {
    slug: "broker-account-with-deposit",
    source: "LEADGID",
    category: "finance",
    title: "Открыть брокерский счёт и внести 10 000 ₽",
    subtitle: "Верификация + пополнение. Средства остаются вашими",
    description:
      "Откройте брокерский счёт, пройдите верификацию личности и внесите на счёт 10 000 ₽. Деньги остаются вашими — их можно вывести обратно через 7 дней после внесения.\n\nЭто самое дорогое задание в каталоге, поэтому проверка тщательная: нужны и скриншоты, и короткое видео, где видно баланс счёта.",
    brandName: "Инвест Брокер",
    reward: "4500",
    networkPayout: "7800",
    difficulty: "HARD",
    difficultySource: "MANUAL",
    etaMinutes: 7200,
    etaSource: "MANUAL",
    holdHours: 168,
    requirePhoto: true,
    requireVideo: true,
    requireComment: true,
    minPhotos: 3,
    maxPhotos: 6,
    proofHint:
      "Скриншоты: подтверждение верификации, история пополнения, баланс счёта. Видео: экран приложения с балансом, без монтажа.",
    completionTtlMins: 10080,
    totalLimit: 50,
    priority: 95,
    isFeatured: true,
    steps: [
      { title: "Зарегистрируйтесь у брокера по кнопке в задании" },
      {
        title: "Пройдите верификацию личности",
        description: "Понадобится паспорт, занимает до суток",
      },
      { title: "Пополните счёт на 10 000 ₽" },
      { title: "Дождитесь зачисления средств" },
      {
        title: "Сделайте скриншоты и видео",
        description: "Верификация, пополнение, баланс. Видео — экран с балансом",
      },
      { title: "Опишите в комментарии дату и способ пополнения" },
    ],
  },
  {
    slug: "consumer-survey-15min",
    source: "GETBLOGGER",
    category: "surveys",
    title: "Пройти опрос о покупательских привычках",
    subtitle: "15 минут, 40 вопросов, без регистрации",
    description:
      "Пройдите опрос до конца и приложите скриншот финального экрана с кодом завершения. Отвечайте честно — некачественные ответы отклоняются заказчиком, и вознаграждение не выплачивается.",
    brandName: "ResearchLab",
    reward: "120",
    networkPayout: "210",
    difficulty: "EASY",
    etaMinutes: 45,
    actualEta: 30,
    holdHours: 0,
    requirePhoto: true,
    requireVideo: false,
    requireComment: false,
    minPhotos: 1,
    maxPhotos: 2,
    proofHint: "Скриншот экрана «Опрос завершён» с кодом завершения.",
    completionTtlMins: 240,
    priority: 40,
    steps: [
      { title: "Откройте опрос" },
      { title: "Ответьте на все вопросы" },
      { title: "Приложите скриншот кода завершения" },
    ],
  },
  {
    slug: "mobile-game-level-10",
    source: "RAFINAD",
    category: "games",
    title: "Установить игру и дойти до 10 уровня",
    subtitle: "Без внутриигровых покупок, примерно 40 минут",
    description:
      "Установите игру, зарегистрируйтесь и доберитесь до 10 уровня. Покупки внутри игры не требуются.",
    brandName: "Empire Rush",
    reward: "260",
    networkPayout: "430",
    difficulty: "MEDIUM",
    etaMinutes: 720,
    actualEta: 610,
    holdHours: 24,
    requirePhoto: true,
    requireVideo: false,
    requireComment: true,
    minPhotos: 2,
    maxPhotos: 3,
    proofHint: "Скриншот профиля с 10 уровнем и ником, плюс скриншот главного экрана.",
    completionTtlMins: 2880,
    priority: 50,
    steps: [
      { title: "Установите игру" },
      { title: "Создайте аккаунт" },
      { title: "Дойдите до 10 уровня" },
      { title: "Приложите скриншоты профиля" },
    ],
  },
  {
    slug: "ozon-premium-trial",
    source: "GETBLOGGER",
    category: "marketplace",
    title: "Подключить пробный Premium на маркетплейсе",
    subtitle: "Бесплатно на 30 дней, отменить можно сразу",
    description:
      "Подключите пробную Premium-подписку. Задание доступно только тем, у кого подписки ещё не было.",
    brandName: "Ozon",
    reward: "220",
    networkPayout: "380",
    difficulty: "EASY",
    etaMinutes: 90,
    holdHours: 48,
    requirePhoto: true,
    requireVideo: false,
    requireComment: false,
    minPhotos: 1,
    maxPhotos: 2,
    completionTtlMins: 720,
    priority: 45,
    steps: [
      { title: "Откройте страницу подписки" },
      { title: "Активируйте пробный период" },
      { title: "Приложите скриншот активной подписки" },
    ],
  },
  {
    slug: "credit-card-cashback",
    source: "LEADGID",
    category: "finance",
    title: "Оформить кредитную карту с кэшбэком",
    subtitle: "Заявка + получение карты в отделении или курьером",
    description:
      "Оформите заявку на кредитную карту, дождитесь одобрения и получите карту. Пользоваться кредитным лимитом не обязательно.",
    brandName: "Альфа-Банк",
    reward: "2600",
    networkPayout: "4600",
    difficulty: "HARD",
    etaMinutes: 5760,
    holdHours: 120,
    requirePhoto: true,
    requireVideo: false,
    requireComment: true,
    minPhotos: 2,
    maxPhotos: 4,
    proofHint:
      "Скриншот одобрения и фото полученной карты с закрытым номером (видны только последние 4 цифры).",
    completionTtlMins: 10080,
    totalLimit: 100,
    priority: 85,
    steps: [
      { title: "Заполните заявку по кнопке" },
      { title: "Дождитесь одобрения" },
      { title: "Получите карту курьером или в отделении" },
      { title: "Приложите доказательства" },
    ],
  },
  {
    slug: "grocery-delivery-first-order",
    source: "RAFINAD",
    category: "delivery",
    title: "Первый заказ продуктов с доставкой",
    subtitle: "Заказ от 1500 ₽, промокод даёт скидку 500 ₽",
    description:
      "Оформите первый заказ продуктов на сумму от 1500 ₽ с промокодом. Задание для новых клиентов сервиса.",
    brandName: "Самокат",
    reward: "380",
    networkPayout: "640",
    difficulty: "EASY",
    etaMinutes: 240,
    holdHours: 24,
    requirePhoto: true,
    requireVideo: false,
    requireComment: true,
    minPhotos: 2,
    maxPhotos: 3,
    completionTtlMins: 2880,
    promoCode: "PROFI500",
    priority: 55,
    steps: [
      { title: "Установите приложение и зарегистрируйтесь" },
      { title: "Соберите заказ от 1500 ₽" },
      { title: "Примените промокод PROFI500" },
      { title: "Дождитесь доставки" },
      { title: "Приложите скриншоты заказа" },
    ],
  },
  {
    slug: "insurance-quote-request",
    source: "MANUAL",
    category: "finance",
    title: "Рассчитать стоимость ОСАГО",
    subtitle: "Заполнить калькулятор и получить расчёт на почту",
    description:
      "Заполните калькулятор ОСАГО реальными данными автомобиля и получите расчёт. Покупать полис не нужно.",
    brandName: "СтрахДом",
    reward: "150",
    networkPayout: "260",
    difficulty: "EASY",
    etaMinutes: 120,
    holdHours: 0,
    requirePhoto: true,
    requireVideo: false,
    requireComment: false,
    minPhotos: 1,
    maxPhotos: 2,
    completionTtlMins: 720,
    priority: 30,
    steps: [
      { title: "Откройте калькулятор" },
      { title: "Заполните данные автомобиля" },
      { title: "Приложите скриншот расчёта" },
    ],
  },
  {
    slug: "fitness-app-trial",
    source: "GETBLOGGER",
    category: "apps",
    title: "Пробная неделя в фитнес-приложении",
    subtitle: "Установка, регистрация и одна тренировка",
    description:
      "Установите приложение, активируйте пробный период и завершите одну тренировку.",
    brandName: "FitPro",
    reward: "240",
    networkPayout: "410",
    difficulty: "MEDIUM",
    etaMinutes: 360,
    holdHours: 24,
    requirePhoto: true,
    requireVideo: false,
    requireComment: true,
    minPhotos: 2,
    maxPhotos: 3,
    completionTtlMins: 2880,
    priority: 35,
    steps: [
      { title: "Установите приложение" },
      { title: "Активируйте пробный период" },
      { title: "Завершите одну тренировку" },
      { title: "Приложите скриншот завершённой тренировки" },
    ],
  },
];

async function seedOffers() {
  console.log("→ Офферы");

  const sources = await db.offerSource.findMany();
  const categories = await db.category.findMany();
  const sourceMap = new Map(sources.map((s) => [s.code, s.id]));
  const categoryMap = new Map(categories.map((c) => [c.slug, c.id]));

  for (const seed of OFFERS) {
    const existing = await db.offer.findUnique({ where: { slug: seed.slug } });
    if (existing) continue;

    await db.offer.create({
      data: {
        sourceId: sourceMap.get(seed.source)!,
        categoryId: categoryMap.get(seed.category),
        externalId: seed.source === "MANUAL" ? null : `${seed.source}-${seed.slug}`,
        slug: seed.slug,
        title: seed.title,
        subtitle: seed.subtitle,
        description: seed.description,
        brandName: seed.brandName,
        iconUrl: OFFER_ICONS[seed.slug],
        difficulty: seed.difficulty,
        difficultySource: seed.difficultySource ?? "AUTO",
        approvalEtaMinutes: seed.etaMinutes,
        approvalEtaSource: seed.etaSource ?? "AUTO",
        actualEtaMinutes: seed.actualEta,
        rewardAmount: new D(seed.reward),
        networkPayout: new D(seed.networkPayout),
        holdHours: seed.holdHours,
        requirePhoto: seed.requirePhoto,
        requireVideo: seed.requireVideo,
        requireComment: seed.requireComment,
        minPhotos: seed.minPhotos,
        maxPhotos: seed.maxPhotos,
        proofHint: seed.proofHint,
        completionTtlMins: seed.completionTtlMins,
        promoCode: seed.promoCode,
        trackingUrl: `https://track.example.com/${seed.slug}?sub_id={clickId}`,
        status: "ACTIVE",
        isHot: seed.isHot ?? false,
        isFeatured: seed.isFeatured ?? false,
        priority: seed.priority ?? 0,
        geo: ["RU"],
        takenCount: Math.floor(Math.random() * 180) + 20,
        approvedCount: Math.floor(Math.random() * 120) + 10,
        rejectedCount: Math.floor(Math.random() * 18),
        completedCount: Math.floor(Math.random() * 130) + 10,
        totalLimit: seed.totalLimit,
        steps: {
          create: seed.steps.map((step, index) => ({
            order: index + 1,
            title: step.title,
            description: step.description,
          })),
        },
      },
    });
  }

  // Один черновик — чтобы в админке был виден неопубликованный оффер из сети.
  const draftSlug = "neo-bank-draft";
  if (!(await db.offer.findUnique({ where: { slug: draftSlug } }))) {
    await db.offer.create({
      data: {
        sourceId: sourceMap.get("LEADGID")!,
        categoryId: categoryMap.get("finance"),
        externalId: "LEADGID-neo-bank-2291",
        slug: draftSlug,
        title: "Счёт в цифровом банке (импорт из Leadgid)",
        subtitle: "Импортировано автоматически — требуется проверка ставки",
        description:
          "Оффер импортирован синхронизацией и ожидает публикации. Награда рассчитана по правилу маржи и должна быть подтверждена вручную: цена для участника не меняется автоматически.",
        brandName: "NeoBank",
        iconUrl: OFFER_ICONS[draftSlug],
        difficulty: "MEDIUM",
        difficultySource: "NETWORK",
        approvalEtaMinutes: 2880,
        approvalEtaSource: "NETWORK",
        rewardAmount: new D("1400"),
        networkPayout: new D("2400"),
        holdHours: 48,
        status: "DRAFT",
        geo: ["RU"],
      },
    });
  }

  for (const [slug, iconUrl] of Object.entries(OFFER_ICONS)) {
    await db.offer.updateMany({ where: { slug }, data: { iconUrl } });
  }
}

type DemoUser = {
  telegramId: bigint;
  firstName: string;
  lastName?: string;
  username?: string;
  role?: "USER" | "MODERATOR" | "FINANCE" | "ADMIN" | "OWNER";
  createdAt: Date;
  riskScore?: number;
};

const DEMO_USERS: DemoUser[] = [
  {
    telegramId: 777000001n,
    firstName: "Алексей",
    lastName: "Смирнов",
    username: "alexey_demo",
    role: "OWNER",
    createdAt: daysAgo(64),
  },
  {
    telegramId: 777000002n,
    firstName: "Мария",
    lastName: "Иванова",
    username: "maria_tasks",
    createdAt: daysAgo(28),
  },
  {
    telegramId: 777000003n,
    firstName: "Дмитрий",
    username: "dmitry_pb",
    createdAt: daysAgo(11),
    riskScore: 35,
  },
  {
    telegramId: 777000004n,
    firstName: "Ольга",
    lastName: "Кузнецова",
    createdAt: daysAgo(4),
  },
  {
    telegramId: 777000005n,
    firstName: "Игорь",
    username: "igor_new",
    createdAt: hoursAgo(9),
    riskScore: 15,
  },
  {
    telegramId: 777000010n,
    firstName: "Елена",
    lastName: "Модератор",
    username: "elena_mod",
    role: "MODERATOR",
    createdAt: daysAgo(40),
  },
];

async function seedUsers() {
  console.log("→ Пользователи");

  const created: Record<string, string> = {};

  for (const seed of DEMO_USERS) {
    const existing = await db.user.findUnique({
      where: { telegramId: seed.telegramId },
    });
    if (existing) {
      created[seed.telegramId.toString()] = existing.id;
      continue;
    }

    const user = await db.user.create({
      data: {
        telegramId: seed.telegramId,
        firstName: seed.firstName,
        lastName: seed.lastName,
        username: seed.username,
        role: seed.role ?? "USER",
        referralCode: code(8),
        riskScore: seed.riskScore ?? 0,
        createdAt: seed.createdAt,
        lastSeenAt: minutesAgo(Math.floor(Math.random() * 300)),
        onboardedAt: seed.createdAt,
        wallets: { create: { currency: "RUB" } },
        stats: { create: {} },
      },
    });
    created[seed.telegramId.toString()] = user.id;
  }

  // Реферальное дерево: владелец пригласил Марию и Дмитрия,
  // Мария пригласила Ольгу (это даёт владельцу второй уровень).
  const owner = created["777000001"];
  const maria = created["777000002"];
  const dmitry = created["777000003"];
  const olga = created["777000004"];

  const links: { referrer: string; referee: string; status: "ACTIVE" | "PENDING" }[] = [
    { referrer: owner, referee: maria, status: "ACTIVE" },
    { referrer: owner, referee: dmitry, status: "ACTIVE" },
    { referrer: maria, referee: olga, status: "PENDING" },
  ];

  for (const link of links) {
    const existing = await db.referral.findUnique({
      where: { refereeId: link.referee },
    });
    if (existing) continue;

    await db.user.update({
      where: { id: link.referee },
      data: { referrerId: link.referrer },
    });
    await db.referral.create({
      data: {
        referrerId: link.referrer,
        refereeId: link.referee,
        level: 1,
        source: "bot_deeplink",
        status: link.status,
        activatedAt: link.status === "ACTIVE" ? daysAgo(10) : null,
      },
    });
    await db.userStats.update({
      where: { userId: link.referrer },
      data: {
        referralsTotal: { increment: 1 },
        referralsActive: link.status === "ACTIVE" ? { increment: 1 } : undefined,
      },
    });
  }

  return created;
}

/**
 * Демо-выполнения на всех стадиях жизненного цикла — чтобы после сидов
 * очередь модерации, «мои задания» и выплаты были не пустыми.
 * Начисления идут через реальные записи леджера, а не прямой правкой баланса.
 */
async function seedSubmissions(users: Record<string, string>) {
  console.log("→ Выполнения и деньги");

  const offers = await db.offer.findMany({
    where: { status: "ACTIVE" },
    orderBy: { priority: "desc" },
  });
  const reasons = await db.rejectionReason.findMany();
  if (offers.length === 0) return;

  const owner = users["777000001"];
  const maria = users["777000002"];
  const dmitry = users["777000003"];
  const olga = users["777000004"];
  const igor = users["777000005"];
  const moderator = users["777000010"];

  const plan: {
    userId: string;
    offerIndex: number;
    status:
      | "DRAFT"
      | "PENDING_REVIEW"
      | "NEEDS_REVISION"
      | "PENDING_PAYOUT"
      | "PAID"
      | "REJECTED";
    submittedAgoMin?: number;
    comment?: string;
    riskScore?: number;
    /** Сколько PNG-заглушек приложить как фото-доказательства. */
    photos?: number;
  }[] = [
    {
      userId: owner,
      offerIndex: 0,
      status: "PAID",
      submittedAgoMin: 60 * 30,
      comment: "Заказ №WB-88421 оформлен, промокод применён, скидка 450 ₽.",
      photos: 2,
    },
    {
      userId: owner,
      offerIndex: 2,
      status: "PAID",
      submittedAgoMin: 60 * 52,
      comment: "Заявка одобрена, карту выдали в отделении.",
      photos: 1,
    },
    {
      userId: owner,
      offerIndex: 5,
      status: "PENDING_PAYOUT",
      submittedAgoMin: 90,
      comment: "Подписку активировал, скриншот раздела «Моя подписка» приложил.",
      photos: 1,
    },
    {
      userId: owner,
      offerIndex: 1,
      status: "PENDING_REVIEW",
      submittedAgoMin: 25,
      comment:
        "Счёт открыт, верификация пройдена, внесено 10 000 ₽. Скриншоты пополнения и баланса приложил.",
      photos: 3,
    },
    { userId: owner, offerIndex: 3, status: "DRAFT" },
    {
      userId: maria,
      offerIndex: 0,
      status: "PAID",
      submittedAgoMin: 60 * 70,
      comment: "Первый заказ на 1340 ₽, скриншоты приложены.",
      photos: 2,
    },
    {
      userId: maria,
      offerIndex: 2,
      status: "PAID",
      submittedAgoMin: 60 * 96,
      comment: "Карта одобрена и получена, скриншот из приложения банка.",
      photos: 2,
    },
    {
      userId: maria,
      offerIndex: 7,
      status: "PENDING_REVIEW",
      submittedAgoMin: 200,
      comment: "10 уровень, ник MariaQ. Скриншот профиля во вложении.",
      photos: 2,
    },
    {
      userId: maria,
      offerIndex: 4,
      status: "PENDING_REVIEW",
      // Просрочено относительно заявленного ETA — попадёт в начало очереди.
      submittedAgoMin: 60 * 130,
      comment: "Заказ доставлен, промокод сработал. Скриншот заказа приложила.",
      photos: 2,
    },
    {
      userId: dmitry,
      offerIndex: 6,
      status: "REJECTED",
      submittedAgoMin: 60 * 20,
      comment: "Заказ сделан.",
      riskScore: 35,
      photos: 1,
    },
    {
      userId: dmitry,
      offerIndex: 9,
      status: "PENDING_REVIEW",
      submittedAgoMin: 40,
      comment: "Опрос пройден.",
      riskScore: 35,
      photos: 1,
    },
    {
      userId: olga,
      offerIndex: 5,
      status: "NEEDS_REVISION",
      submittedAgoMin: 300,
      comment: "Подписку подключила.",
      photos: 1,
    },
    {
      userId: olga,
      offerIndex: 8,
      status: "PENDING_REVIEW",
      submittedAgoMin: 15,
      comment: "Premium активирован на 30 дней, скриншот подписки приложила.",
      photos: 1,
    },
    {
      userId: igor,
      offerIndex: 3,
      status: "PENDING_REVIEW",
      submittedAgoMin: 8,
      comment: "Всё сделал.",
      riskScore: 55,
      photos: 1,
    },
  ];

  for (const item of plan) {
    const offer = offers[item.offerIndex % offers.length];
    const exists = await db.taskSubmission.findFirst({
      where: { userId: item.userId, offerId: offer.id },
    });
    if (exists) continue;

    const startedAt = item.submittedAgoMin
      ? minutesAgo(item.submittedAgoMin + 40)
      : minutesAgo(30);
    const submittedAt = item.submittedAgoMin
      ? minutesAgo(item.submittedAgoMin)
      : null;

    const submission = await db.taskSubmission.create({
      data: {
        publicCode: `TS-${code(5)}`,
        userId: item.userId,
        offerId: offer.id,
        status: item.status,
        rewardAmount: offer.rewardAmount,
        comment: item.comment,
        riskScore: item.riskScore ?? 0,
        startedAt,
        submittedAt,
        expiresAt:
          item.status === "DRAFT"
            ? new Date(startedAt.getTime() + offer.completionTtlMins * 60_000)
            : item.status === "NEEDS_REVISION"
              ? new Date(Date.now() + 20 * 3_600_000)
              : null,
        reviewDeadlineAt: submittedAt
          ? new Date(submittedAt.getTime() + offer.approvalEtaMinutes * 60_000)
          : null,
      },
    });

    await db.submissionEvent.create({
      data: {
        submissionId: submission.id,
        actorType: "USER",
        actorId: item.userId,
        toStatus: "DRAFT",
        comment: "Задание взято в работу",
        createdAt: startedAt,
      },
    });

    if (submittedAt) {
      await db.submissionEvent.create({
        data: {
          submissionId: submission.id,
          actorType: "USER",
          actorId: item.userId,
          fromStatus: "DRAFT",
          toStatus: "PENDING_REVIEW",
          comment: "Доказательства отправлены на проверку",
          createdAt: submittedAt,
        },
      });

      if (item.comment) {
        await db.submissionProof.create({
          data: {
            submissionId: submission.id,
            kind: "TEXT",
            text: item.comment,
            order: 0,
          },
        });
      }

      // Фото-заглушки: без них экран модератора выглядит пустым,
      // а именно он — узкое место продукта и главное, что стоит смотреть.
      for (let i = 0; i < (item.photos ?? 0); i += 1) {
        const media = await writeProofFile(
          UPLOAD_DIR,
          submission.id,
          `${submission.id}:${i}`,
        );
        const asset = await db.mediaAsset.create({
          data: {
            storageKey: media.storageKey,
            bucket: "local",
            mimeType: media.mimeType,
            sizeBytes: media.sizeBytes,
            width: media.width,
            height: media.height,
            checksum: media.checksum,
            status: "READY",
            uploadedById: item.userId,
            meta: { demo: true },
          },
        });
        await db.submissionProof.create({
          data: {
            submissionId: submission.id,
            kind: "PHOTO",
            mediaId: asset.id,
            order: i + 1,
          },
        });
      }
    }

    // Одобренные и оплаченные — с реальными записями леджера.
    if (item.status === "PENDING_PAYOUT" || item.status === "PAID") {
      const reviewedAt = new Date((submittedAt ?? startedAt).getTime() + 45 * 60_000);
      await db.taskSubmission.update({
        where: { id: submission.id },
        data: {
          reviewedAt,
          reviewerId: moderator,
          payoutAvailableAt: new Date(
            reviewedAt.getTime() + offer.holdHours * 3_600_000,
          ),
          paidAt: item.status === "PAID" ? new Date(reviewedAt.getTime() + 3_600_000) : null,
        },
      });

      await db.submissionEvent.create({
        data: {
          submissionId: submission.id,
          actorType: "MODERATOR",
          actorId: moderator,
          fromStatus: "PENDING_REVIEW",
          toStatus: "PENDING_PAYOUT",
          comment: "Выполнение подтверждено",
          createdAt: reviewedAt,
        },
      });

      const wallet = await db.wallet.findUnique({
        where: { userId_currency: { userId: item.userId, currency: "RUB" } },
      });
      if (wallet) {
        const isPaid = item.status === "PAID";
        const amount = new D(offer.rewardAmount);
        const newAvailable = isPaid
          ? new D(wallet.available).plus(amount)
          : new D(wallet.available);
        const newPending = isPaid
          ? new D(wallet.pending)
          : new D(wallet.pending).plus(amount);

        await db.ledgerEntry.create({
          data: {
            walletId: wallet.id,
            userId: item.userId,
            direction: "CREDIT",
            type: "TASK_REWARD",
            amount,
            balanceAfter: newAvailable,
            submissionId: submission.id,
            idempotencyKey: `submission:${submission.id}:reward`,
            description: offer.title,
            createdAt: reviewedAt,
          },
        });

        await db.wallet.update({
          where: { id: wallet.id },
          data: {
            available: newAvailable,
            pending: newPending,
            totalEarned: new D(wallet.totalEarned).plus(amount),
            version: { increment: 1 },
          },
        });

        await db.userStats.update({
          where: { userId: item.userId },
          data: {
            tasksApproved: { increment: 1 },
            tasksSubmitted: { increment: 1 },
            totalEarned: { increment: amount },
          },
        });

        if (isPaid) {
          await db.submissionEvent.create({
            data: {
              submissionId: submission.id,
              actorType: "SYSTEM",
              fromStatus: "PENDING_PAYOUT",
              toStatus: "PAID",
              comment: "Вознаграждение зачислено на баланс",
              createdAt: new Date(reviewedAt.getTime() + 3_600_000),
            },
          });

          await db.notification.create({
            data: {
              userId: item.userId,
              type: "SUBMISSION_PAID",
              priority: "HIGH",
              title: "Деньги на балансе",
              body: `${Number(amount).toLocaleString("ru-RU")} ₽ за «${offer.title}» доступны к выводу.`,
              deepLink: "/profile",
              entityType: "submission",
              entityId: submission.id,
              createdAt: new Date(reviewedAt.getTime() + 3_600_000),
              deliveries: {
                create: [
                  { channel: "IN_APP", status: "SENT", sentAt: reviewedAt },
                  { channel: "BOT", status: "SENT", sentAt: reviewedAt },
                ],
              },
            },
          });
        }
      }
    }

    if (item.status === "REJECTED") {
      const reason = reasons.find((r) => r.code === "UNREADABLE_PROOF") ?? reasons[0];
      const reviewedAt = new Date((submittedAt ?? startedAt).getTime() + 90 * 60_000);

      await db.taskSubmission.update({
        where: { id: submission.id },
        data: {
          reviewedAt,
          reviewerId: moderator,
          rejectionReasonId: reason.id,
          reviewComment: "На скриншоте не видно номер заказа и итоговую сумму.",
        },
      });

      await db.submissionEvent.create({
        data: {
          submissionId: submission.id,
          actorType: "MODERATOR",
          actorId: moderator,
          fromStatus: "PENDING_REVIEW",
          toStatus: "REJECTED",
          comment: `${reason.title}. На скриншоте не видно номер заказа и итоговую сумму.`,
          createdAt: reviewedAt,
        },
      });

      await db.userStats.update({
        where: { userId: item.userId },
        data: { tasksRejected: { increment: 1 }, tasksSubmitted: { increment: 1 } },
      });

      await db.notification.create({
        data: {
          userId: item.userId,
          type: "SUBMISSION_REJECTED",
          priority: "HIGH",
          title: "Задание отклонено",
          body: `«${offer.title}» — ${reason.title}.`,
          deepLink: `/submissions/${submission.id}`,
          createdAt: reviewedAt,
          deliveries: {
            create: [
              { channel: "IN_APP", status: "SENT", sentAt: reviewedAt },
              { channel: "BOT", status: "SENT", sentAt: reviewedAt },
            ],
          },
        },
      });
    }

    if (item.status === "NEEDS_REVISION") {
      const reason = reasons.find((r) => r.code === "MISSING_PROOF") ?? reasons[0];
      const reviewedAt = new Date((submittedAt ?? startedAt).getTime() + 60 * 60_000);

      await db.taskSubmission.update({
        where: { id: submission.id },
        data: {
          reviewerId: moderator,
          rejectionReasonId: reason.id,
          reviewComment:
            "Нужен скриншот раздела «Моя подписка» с датой окончания — на текущем видно только экран оплаты.",
        },
      });

      await db.submissionEvent.create({
        data: {
          submissionId: submission.id,
          actorType: "MODERATOR",
          actorId: moderator,
          fromStatus: "PENDING_REVIEW",
          toStatus: "NEEDS_REVISION",
          comment:
            "Нужен скриншот раздела «Моя подписка» с датой окончания — на текущем видно только экран оплаты.",
          createdAt: reviewedAt,
        },
      });

      await db.notification.create({
        data: {
          userId: item.userId,
          type: "SUBMISSION_NEEDS_REVISION",
          priority: "HIGH",
          title: "Нужно доработать доказательства",
          body: `«${offer.title}» — приложите скриншот активной подписки. У вас 24 часа.`,
          deepLink: `/submissions/${submission.id}`,
          createdAt: reviewedAt,
          deliveries: {
            create: [
              { channel: "IN_APP", status: "SENT", sentAt: reviewedAt },
              { channel: "BOT", status: "SENT", sentAt: reviewedAt },
            ],
          },
        },
      });
    }

    if (item.status === "PENDING_REVIEW") {
      await db.userStats.update({
        where: { userId: item.userId },
        data: { tasksSubmitted: { increment: 1 } },
      });

      await db.notification.create({
        data: {
          userId: item.userId,
          type: "SUBMISSION_RECEIVED",
          priority: "LOW",
          title: "Доказательства получены",
          body: `«${offer.title}» — проверим в течение заявленного времени.`,
          deepLink: `/submissions/${submission.id}`,
          createdAt: submittedAt ?? new Date(),
          deliveries: {
            create: [{ channel: "IN_APP", status: "SENT", sentAt: submittedAt }],
          },
        },
      });
    }
  }

  // Пересчёт процента одобрения в статистике.
  const allStats = await db.userStats.findMany();
  for (const stats of allStats) {
    const decided = stats.tasksApproved + stats.tasksRejected;
    if (decided > 0) {
      await db.userStats.update({
        where: { userId: stats.userId },
        data: {
          approvalRate: new D((stats.tasksApproved / decided) * 100).toDecimalPlaces(2),
        },
      });
    }
  }
}

/**
 * Восстановление файлов доказательств, если записи в БД есть, а файлов нет.
 *
 * Такое расхождение возникает при повторном запуске сидов на уже заполненной
 * базе и при свежем клоне репозитория: сами файлы в гит не попадают, а строки
 * в media_assets переживают всё. Без этого шага галерея в модерации отдаёт 404
 * вместо превью — то есть ломается ровно тот экран, который важнее всех
 * остальных.
 *
 * Генератор детерминирован по seed-строке, а storageKey содержит checksum,
 * поэтому восстановленный файл байт-в-байт совпадает с исходным.
 */
async function ensureProofFiles() {
  const proofs = await db.submissionProof.findMany({
    where: { kind: "PHOTO", mediaId: { not: null } },
    include: { media: true },
  });

  let restored = 0;

  for (const proof of proofs) {
    if (!proof.media) continue;
    if (existsSync(path.join(UPLOAD_DIR, proof.media.storageKey))) continue;

    const written = await writeProofFile(
      UPLOAD_DIR,
      proof.submissionId,
      `${proof.submissionId}:${proof.order - 1}`,
    );

    // Если генератор когда-нибудь изменится, файл на диске и запись в БД
    // разойдутся — приводим запись к тому, что реально записано.
    if (
      written.storageKey !== proof.media.storageKey ||
      written.checksum !== proof.media.checksum
    ) {
      await db.mediaAsset.update({
        where: { id: proof.media.id },
        data: {
          storageKey: written.storageKey,
          checksum: written.checksum,
          sizeBytes: written.sizeBytes,
        },
      });
    }

    restored += 1;
  }

  if (restored > 0) {
    console.log(`   восстановлено файлов доказательств: ${restored}`);
  }
}

/**
 * Флаги антифрода на рискованных выполнениях.
 *
 * Скор не решает за модератора — он сортирует очередь и объясняет, на что
 * смотреть. Без флагов в демо-данных не видно, как это работает на практике.
 */
async function seedFraudFlags(users: Record<string, string>) {
  console.log("→ Флаги антифрода");

  const rules = await db.fraudRule.findMany();
  const ruleByCode = new Map(rules.map((r) => [r.code, r]));

  const risky = await db.taskSubmission.findMany({
    where: { riskScore: { gte: 30 }, status: { in: ["PENDING_REVIEW", "REJECTED"] } },
    select: { id: true, userId: true, riskScore: true },
  });

  for (const submission of risky) {
    const existing = await db.fraudFlag.count({
      where: { submissionId: submission.id },
    });
    if (existing > 0) continue;

    const codes =
      submission.userId === users["777000005"]
        ? ["FRESH_ACCOUNT_HIGH_REWARD", "TOO_FAST"]
        : ["REJECT_STREAK", "SHARED_IP"];

    for (const code of codes) {
      const rule = ruleByCode.get(code);
      if (!rule) continue;
      await db.fraudFlag.create({
        data: {
          ruleId: rule.id,
          userId: submission.userId,
          submissionId: submission.id,
          points: rule.points,
          details: {
            note:
              code === "TOO_FAST"
                ? "Между взятием задания и отправкой доказательств прошло 3 минуты при заявленном сроке выполнения в несколько дней."
                : code === "FRESH_ACCOUNT_HIGH_REWARD"
                  ? "Аккаунт зарегистрирован 9 часов назад и сразу взял задание с наградой 4500 ₽."
                  : code === "SHARED_IP"
                    ? "С этого IP выполняют задания ещё 2 аккаунта."
                    : "Два отклонённых выполнения подряд.",
          },
        },
      });
    }
  }
}

async function seedReferralEarnings(users: Record<string, string>) {
  console.log("→ Реферальные начисления");

  const owner = users["777000001"];
  const maria = users["777000002"];

  const paidByMaria = await db.taskSubmission.findFirst({
    where: { userId: maria, status: "PAID" },
    include: { offer: { select: { title: true } } },
  });
  if (!paidByMaria) return;

  const existing = await db.referralEarning.findUnique({
    where: {
      referrerId_submissionId_level: {
        referrerId: owner,
        submissionId: paidByMaria.id,
        level: 1,
      },
    },
  });
  if (existing) return;

  const amount = new D(paidByMaria.rewardAmount).mul(10).div(100).toDecimalPlaces(2);

  await db.referralEarning.create({
    data: {
      referrerId: owner,
      refereeId: maria,
      submissionId: paidByMaria.id,
      level: 1,
      percent: new D(10),
      amount,
    },
  });

  const wallet = await db.wallet.findUnique({
    where: { userId_currency: { userId: owner, currency: "RUB" } },
  });
  if (!wallet) return;

  const newAvailable = new D(wallet.available).plus(amount);

  await db.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: owner,
      direction: "CREDIT",
      type: "REFERRAL_BONUS",
      amount,
      balanceAfter: newAvailable,
      submissionId: paidByMaria.id,
      idempotencyKey: `referral:${paidByMaria.id}:l1`,
      description: "Бонус 10% с реферала (уровень 1)",
      createdAt: daysAgo(2),
    },
  });

  await db.wallet.update({
    where: { id: wallet.id },
    data: {
      available: newAvailable,
      totalEarned: new D(wallet.totalEarned).plus(amount),
      version: { increment: 1 },
    },
  });

  await db.userStats.update({
    where: { userId: owner },
    data: { referralEarnings: { increment: amount } },
  });

  await db.notification.create({
    data: {
      userId: owner,
      type: "REFERRAL_EARNING",
      priority: "NORMAL",
      title: "Реферальное начисление",
      body: `${Number(amount).toLocaleString("ru-RU")} ₽ — ваш реферал выполнил «${paidByMaria.offer.title}».`,
      deepLink: "/referrals",
      groupKey: `referral-earning:${daysAgo(2).toDateString()}`,
      createdAt: daysAgo(2),
      deliveries: { create: [{ channel: "IN_APP", status: "SENT", sentAt: daysAgo(2) }] },
    },
  });
}

async function seedWithdrawal(users: Record<string, string>) {
  console.log("→ Заявка на вывод");

  const maria = users["777000002"];
  const existing = await db.withdrawal.findFirst({ where: { userId: maria } });
  if (existing) return;

  const wallet = await db.wallet.findUnique({
    where: { userId_currency: { userId: maria, currency: "RUB" } },
  });
  if (!wallet || new D(wallet.available).lt(500)) return;

  const method = await db.payoutMethod.create({
    data: {
      userId: maria,
      kind: "CARD_RUB",
      label: "Карта",
      maskedValue: "•••• 4242",
      // В продакшене здесь AES-256-GCM шифртекст; для сидов достаточно метки.
      detailsEncrypted: "seed-placeholder",
      holderName: "Мария Иванова",
      isDefault: true,
    },
  });

  const amount = new D("500");
  const id = crypto.randomUUID();

  const withdrawal = await db.withdrawal.create({
    data: {
      id,
      publicCode: `WD-${code(5)}`,
      userId: maria,
      walletId: wallet.id,
      methodId: method.id,
      status: "PENDING_REVIEW",
      amountGross: amount,
      fee: new D(0),
      amountNet: amount,
      payoutCurrency: "RUB",
      methodKind: "CARD_RUB",
      methodSnapshot: {
        kind: "CARD_RUB",
        masked: "•••• 4242",
        holderName: "Мария Иванова",
        network: null,
      },
      provider: "MANUAL",
      idempotencyKey: `withdrawal:${id}:create`,
      antifraud: {
        accountAgeHours: 672,
        rejectRatePercent: 0,
        riskScore: 0,
        paidTasks: 1,
        flags: [],
        checkedAt: new Date().toISOString(),
      },
      requestedAt: hoursAgo(3),
    },
  });

  const newAvailable = new D(wallet.available).minus(amount);

  await db.ledgerEntry.create({
    data: {
      walletId: wallet.id,
      userId: maria,
      direction: "DEBIT",
      type: "WITHDRAWAL_HOLD",
      amount,
      balanceAfter: newAvailable,
      withdrawalId: withdrawal.id,
      idempotencyKey: `withdrawal:${withdrawal.id}:hold`,
      description: `Заявка на вывод ${withdrawal.publicCode}`,
      createdAt: hoursAgo(3),
    },
  });

  await db.wallet.update({
    where: { id: wallet.id },
    data: {
      available: newAvailable,
      hold: new D(wallet.hold).plus(amount),
      version: { increment: 1 },
    },
  });

  await db.withdrawalEvent.create({
    data: {
      withdrawalId: withdrawal.id,
      actorType: "USER",
      actorId: maria,
      toStatus: "PENDING_REVIEW",
      comment: "Заявка создана, средства заморожены",
      createdAt: hoursAgo(3),
    },
  });
}

async function main() {
  console.log("Сиды ProfiBux\n");

  await seedReferenceData();

  if (process.env.SEED_DEMO === "false") {
    console.log("\nДемо-данные пропущены (SEED_DEMO=false)");
    return;
  }

  await seedOffers();
  const users = await seedUsers();
  await seedSubmissions(users);
  await ensureProofFiles();
  await seedFraudFlags(users);
  await seedReferralEarnings(users);
  await seedWithdrawal(users);

  const [offerCount, userCount, submissionCount, notificationCount] =
    await Promise.all([
      db.offer.count(),
      db.user.count(),
      db.taskSubmission.count(),
      db.notification.count(),
    ]);

  console.log(
    `\nГотово: ${offerCount} офферов, ${userCount} пользователей, ${submissionCount} выполнений, ${notificationCount} уведомлений.`,
  );
  console.log(
    "Демо-вход: Telegram ID 777000001 (роль OWNER) — задаётся через DEV_USER_TELEGRAM_ID.",
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

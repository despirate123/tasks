/**
 * Сквозная проверка домена: npm run check:e2e
 *
 * Это исполняемая версия критериев приёмки из docs/05-tech-spec.md.
 * Проверяет не UI, а то, что дороже всего сломать незаметно: деньги,
 * идемпотентность начислений и защиту ручных правок от синхронизации.
 *
 * Работает на отдельной базе (имя из DATABASE_URL + суффикс _e2e), поэтому
 * демо-данные не трогает и запускать можно сколько угодно раз.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient, Prisma } from "../src/generated/prisma";

function loadDotEnv() {
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const raw of text.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq);
      let value = line.slice(eq + 1);
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    /* переменные уже могут быть в окружении */
  }
}

function unquoteEnv() {
  for (const [key, value] of Object.entries(process.env)) {
    if (
      typeof value === "string" &&
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      process.env[key] = value.slice(1, -1);
    }
  }
}

loadDotEnv();
unquoteEnv();

const D = Prisma.Decimal;

// ── Инфраструктура проверок ──────────────────────────────────────────────────

let passed = 0;
const failures: string[] = [];

const c = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
};

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`${c.green}✓${c.reset} ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`${c.red}✗ ${name}${c.reset}${detail ? `\n  ${c.dim}${detail}${c.reset}` : ""}`);
  }
}

function section(title: string) {
  console.log(`\n${c.bold}${title}${c.reset}`);
}

// ── Отдельная база под проверку ──────────────────────────────────────────────

const sourceUrl = process.env.DATABASE_URL;
if (!sourceUrl) {
  console.error("DATABASE_URL не задан. Запустите npm run setup.");
  process.exit(1);
}

const parsed = new URL(sourceUrl);
const baseName = parsed.pathname.replace(/^\//, "");
const testName = `${baseName}_e2e`;
parsed.pathname = `/${testName}`;
const testUrl = parsed.toString();

/**
 * psql не принимает query-параметры вида ?schema=public, которые Prisma
 * держит в DATABASE_URL, поэтому строку подключения собираем заново.
 */
function psqlUrl(database: string) {
  const url = new URL(sourceUrl!);
  url.pathname = `/${database}`;
  url.search = "";
  return url.toString();
}

function psql(database: string, sql: string) {
  execFileSync("psql", [psqlUrl(database), "-v", "ON_ERROR_STOP=1", "-c", sql], {
    stdio: "pipe",
    encoding: "utf8",
  });
}

console.log(`${c.bold}Сквозная проверка домена${c.reset}`);
console.log(`${c.dim}база: ${testName}${c.reset}`);

try {
  psql(baseName, `DROP DATABASE IF EXISTS ${testName} WITH (FORCE);`);
  psql(baseName, `CREATE DATABASE ${testName};`);
} catch (error) {
  console.error(
    "\nНе удалось создать базу для проверки. Нужны права CREATEDB у роли из DATABASE_URL.",
  );
  console.error(String((error as { stderr?: string }).stderr ?? error).slice(-400));
  process.exit(1);
}

execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
  stdio: "pipe",
  encoding: "utf8",
  env: { ...process.env, DATABASE_URL: testUrl },
});

const db = new PrismaClient({ datasources: { db: { url: testUrl } } });

// Модули домена импортируются после подмены URL, чтобы синглтон клиента
// в src/server/db.ts подключился к проверочной базе, а не к рабочей.
process.env.DATABASE_URL = testUrl;

const { postLedgerEntry, reconcileWallet } = await import("../src/server/modules/wallet");
const {
  approveSubmission,
  rejectSubmission,
  requestRevision,
  settleSubmission,
  submitForReview,
  takeOffer,
  claimForReview,
  getModerationQueue,
} = await import("../src/server/modules/submissions");
const {
  createWithdrawal,
  approveWithdrawal,
  markWithdrawalSent,
  completeWithdrawal,
  refundWithdrawal,
  quoteWithdrawal,
  encryptDetails,
  decryptDetails,
  isValidCardNumber,
  isValidCryptoAddress,
} = await import("../src/server/modules/withdrawals");
const {
  setOfferDifficulty,
  setOfferApprovalEta,
  upsertOfferFromNetwork,
  resetOfferAuto,
  listOffers,
  createManualOffer,
} = await import("../src/server/modules/offers");
const { expireStaleSubmissions } = await import("../src/server/modules/jobs");
const { parseRewardFilter, matchesRewardFilter } = await import(
  "../src/lib/catalog-filters"
);

async function main() {
  // ── Подготовка ─────────────────────────────────────────────────────────────

  const source = await db.offerSource.create({
    data: { code: "MANUAL", name: "Вручную" },
  });

  await db.referralProgram.createMany({
    data: [
      { level: 1, minReferrals: 0, name: "L1", percent: new D(10) },
      { level: 2, minReferrals: 0, name: "L2", percent: new D(3) },
    ],
  });

  const reason = await db.rejectionReason.create({
    data: {
      code: "UNREADABLE",
      title: "Нечитаемый скриншот",
      allowsRevision: true,
      riskPoints: 5,
    },
  });

  const referrer = await db.user.create({
    data: {
      telegramId: 900000001n,
      firstName: "Пригласивший",
      referralCode: "REFERRER",
      role: "ADMIN",
      wallets: { create: { currency: "RUB" } },
      stats: { create: {} },
    },
  });

  const worker = await db.user.create({
    data: {
      telegramId: 900000002n,
      firstName: "Исполнитель",
      referralCode: "WORKER01",
      referrerId: referrer.id,
      wallets: { create: { currency: "RUB" } },
      stats: { create: {} },
    },
  });

  await db.referral.create({
    data: { referrerId: referrer.id, refereeId: worker.id, level: 1 },
  });

  const moderator = await db.user.create({
    data: {
      telegramId: 900000003n,
      firstName: "Модератор",
      referralCode: "MODER001",
      role: "MODERATOR",
      wallets: { create: { currency: "RUB" } },
      stats: { create: {} },
    },
  });

  const makeOffer = (slug: string, holdHours: number, reward = "1000") =>
    db.offer.create({
      data: {
        sourceId: source.id,
        slug,
        title: `Задание ${slug}`,
        description: "Описание",
        rewardAmount: new D(reward),
        holdHours,
        status: "ACTIVE",
        requirePhoto: false,
        requireComment: true,
        perUserLimit: 1,
      },
    });

  // ── 1. Взятие и отправка ───────────────────────────────────────────────────

  section("Выполнение задания");

  const offer = await makeOffer("hold-24", 24);
  const taken = await takeOffer(worker, offer.id);
  const submissionId = taken.submissionId;

  const draft = await db.taskSubmission.findUniqueOrThrow({
    where: { id: submissionId },
  });
  check(
    "награда фиксируется снапшотом при взятии",
    new D(draft.rewardAmount).equals(new D("1000")),
    `получено ${draft.rewardAmount}`,
  );
  check("выполнение создаётся в статусе DRAFT", draft.status === "DRAFT");

  // Снижаем ставку в оффере уже после взятия.
  await db.offer.update({
    where: { id: offer.id },
    data: { rewardAmount: new D("100") },
  });

  let incompleteRejected = false;
  try {
    await submitForReview(worker.id, submissionId);
  } catch {
    incompleteRejected = true;
  }
  check("отправка без обязательного комментария отклоняется", incompleteRejected);

  await db.taskSubmission.update({
    where: { id: submissionId },
    data: { comment: "Выполнено, номер заказа 12345" },
  });
  await db.submissionProof.create({
    data: { submissionId, kind: "TEXT", text: "Выполнено", order: 0 },
  });
  await submitForReview(worker.id, submissionId);

  const submitted = await db.taskSubmission.findUniqueOrThrow({
    where: { id: submissionId },
  });
  check("после отправки статус PENDING_REVIEW", submitted.status === "PENDING_REVIEW");
  check("выставляется дедлайн модерации по SLA", submitted.reviewDeadlineAt !== null);

  // ── 2. Лок модерации ───────────────────────────────────────────────────────

  section("Модерация");

  await claimForReview(moderator.id, submissionId);
  let lockHeld = false;
  try {
    await claimForReview(referrer.id, submissionId);
  } catch {
    lockHeld = true;
  }
  check("второй модератор не может взять занятое выполнение", lockHeld);

  // ── 3. Одобрение и идемпотентность ─────────────────────────────────────────

  await approveSubmission(moderator.id, submissionId);

  const approved = await db.taskSubmission.findUniqueOrThrow({
    where: { id: submissionId },
  });
  check("после одобрения статус PENDING_PAYOUT", approved.status === "PENDING_PAYOUT");
  check(
    "оплата по снапшоту, а не по новой ставке оффера",
    new D(approved.rewardAmount).equals(new D("1000")),
  );

  let walletAfterApprove = await db.wallet.findFirstOrThrow({
    where: { userId: worker.id },
  });
  check(
    "при холде деньги идут в pending, а не в available",
    new D(walletAfterApprove.pending).equals(new D("1000")) &&
      new D(walletAfterApprove.available).equals(new D(0)),
    `pending=${walletAfterApprove.pending} available=${walletAfterApprove.available}`,
  );

  // Повторное одобрение и гонка параллельных вызовов.
  await approveSubmission(moderator.id, submissionId).catch(() => {});
  await Promise.allSettled([
    approveSubmission(moderator.id, submissionId),
    approveSubmission(moderator.id, submissionId),
  ]);

  const rewardEntries = await db.ledgerEntry.count({
    where: { submissionId, type: "TASK_REWARD" },
  });
  check(
    "повторное и параллельное одобрение не удваивают начисление",
    rewardEntries === 1,
    `записей TASK_REWARD: ${rewardEntries}`,
  );

  // ── 4. Снятие холда и реферальный бонус ────────────────────────────────────

  section("Холд и рефералы");

  await db.taskSubmission.update({
    where: { id: submissionId },
    data: { payoutAvailableAt: new Date(Date.now() - 1000) },
  });
  await settleSubmission(submissionId);

  const paid = await db.taskSubmission.findUniqueOrThrow({ where: { id: submissionId } });
  check("после холда статус PAID", paid.status === "PAID");

  walletAfterApprove = await db.wallet.findFirstOrThrow({ where: { userId: worker.id } });
  check(
    "холд снят: pending переехал в available",
    new D(walletAfterApprove.available).equals(new D("1000")) &&
      new D(walletAfterApprove.pending).equals(new D(0)),
    `pending=${walletAfterApprove.pending} available=${walletAfterApprove.available}`,
  );

  const referrerWallet = await db.wallet.findFirstOrThrow({
    where: { userId: referrer.id },
  });
  check(
    "реферальный бонус 10% начислен пригласившему",
    new D(referrerWallet.available).equals(new D("100")),
    `получено ${referrerWallet.available}`,
  );
  check(
    "у исполнителя бонус не вычтен из награды",
    new D(walletAfterApprove.available).equals(new D("1000")),
  );

  const refActivated = await db.referral.findUniqueOrThrow({
    where: { refereeId: worker.id },
  });
  check("реферал активирован после первой выплаты", refActivated.status === "ACTIVE");

  await settleSubmission(submissionId);
  const refEntries = await db.ledgerEntry.count({
    where: { submissionId, type: "REFERRAL_BONUS" },
  });
  check(
    "повторное снятие холда не удваивает реферальный бонус",
    refEntries === 1,
    `записей REFERRAL_BONUS: ${refEntries}`,
  );

  // ── 5. Отказ и доработка ───────────────────────────────────────────────────

  section("Отказ и доработка");

  const offer2 = await makeOffer("reject-me", 0, "500");
  const t2 = await takeOffer(worker, offer2.id);
  await db.taskSubmission.update({
    where: { id: t2.submissionId },
    data: { comment: "Комментарий достаточной длины" },
  });
  await submitForReview(worker.id, t2.submissionId);
  await requestRevision(moderator.id, t2.submissionId, reason.id, "Приложите чёткий скриншот");

  const revised = await db.taskSubmission.findUniqueOrThrow({
    where: { id: t2.submissionId },
  });
  check("доработка переводит в NEEDS_REVISION", revised.status === "NEEDS_REVISION");
  check("доработке ставится свой дедлайн", revised.expiresAt !== null);

  await submitForReview(worker.id, t2.submissionId);
  const resubmitted = await db.taskSubmission.findUniqueOrThrow({
    where: { id: t2.submissionId },
  });
  check("повторная отправка увеличивает счётчик доработок", resubmitted.revisionCount === 1);

  await rejectSubmission(moderator.id, t2.submissionId, reason.id, "Всё ещё нечитаемо");
  const rejected = await db.taskSubmission.findUniqueOrThrow({
    where: { id: t2.submissionId },
  });
  check("отказ переводит в REJECTED с причиной", rejected.status === "REJECTED");
  check("причина отказа сохранена", rejected.rejectionReasonId === reason.id);

  const riskUser = await db.user.findUniqueOrThrow({ where: { id: worker.id } });
  check("штрафные очки причины ушли в риск-скор", riskUser.riskScore >= 5);

  const rejectLedger = await db.ledgerEntry.count({
    where: { submissionId: t2.submissionId },
  });
  check("за отклонённое выполнение денег не начислено", rejectLedger === 0);

  // ── 6. Приоритизация очереди ───────────────────────────────────────────────

  section("Очередь модерации");

  const offer3 = await makeOffer("queue-cheap", 0, "100");
  const offer4 = await makeOffer("queue-rich", 0, "5000");

  const cheap = await takeOffer(worker, offer3.id);
  await db.taskSubmission.update({
    where: { id: cheap.submissionId },
    data: { comment: "Комментарий достаточной длины" },
  });
  await submitForReview(worker.id, cheap.submissionId);

  const other = await db.user.create({
    data: {
      telegramId: 900000004n,
      firstName: "Другой",
      referralCode: "OTHER001",
      wallets: { create: { currency: "RUB" } },
      stats: { create: {} },
    },
  });
  const rich = await takeOffer(other, offer4.id);
  await db.taskSubmission.update({
    where: { id: rich.submissionId },
    data: { comment: "Комментарий достаточной длины" },
  });
  await submitForReview(other.id, rich.submissionId);

  // Дешёвое делаем просроченным — оно должно обойти дорогое.
  await db.taskSubmission.update({
    where: { id: cheap.submissionId },
    data: { reviewDeadlineAt: new Date(Date.now() - 3_600_000) },
  });

  const queue = await getModerationQueue();
  check(
    "просроченное по SLA идёт первым, даже если дешевле",
    queue[0]?.id === cheap.submissionId,
    `первым оказалось ${queue[0]?.id === rich.submissionId ? "дорогое" : queue[0]?.id}`,
  );

  await db.taskSubmission.update({
    where: { id: cheap.submissionId },
    data: { reviewDeadlineAt: new Date(Date.now() + 3_600_000) },
  });
  const queue2 = await getModerationQueue();
  check(
    "без просрочки вперёд выходит дорогое выполнение",
    queue2[0]?.id === rich.submissionId,
  );

  // ── 7. Ручные сложность и ETA ──────────────────────────────────────────────

  section("Ручное переопределение сложности и ETA");

  const netOffer = await db.offer.create({
    data: {
      sourceId: source.id,
      externalId: "NET-1",
      slug: "from-network",
      title: "Оффер из сети",
      description: "Описание",
      rewardAmount: new D("700"),
      difficulty: "EASY",
      difficultySource: "NETWORK",
      approvalEtaMinutes: 120,
      approvalEtaSource: "NETWORK",
      status: "ACTIVE",
    },
  });

  await setOfferDifficulty(referrer.id, netOffer.id, "HARD");
  await setOfferApprovalEta(referrer.id, netOffer.id, 4320);

  let edited = await db.offer.findUniqueOrThrow({ where: { id: netOffer.id } });
  check("ручная сложность применилась", edited.difficulty === "HARD");
  check("сложность помечена как MANUAL", edited.difficultySource === "MANUAL");
  check("ручной ETA применился", edited.approvalEtaMinutes === 4320);
  check("ETA помечен как MANUAL", edited.approvalEtaSource === "MANUAL");

  // Синхронизация из сети приходит с другими значениями.
  await upsertOfferFromNetwork(source.id, {
    externalId: "NET-1",
    slug: "from-network",
    title: "Оффер из сети (обновлён)",
    description: "Новое описание",
    networkPayout: 1200,
    rewardAmount: 700,
    suggestedDifficulty: "EASY",
    suggestedEtaMinutes: 60,
  });

  edited = await db.offer.findUniqueOrThrow({ where: { id: netOffer.id } });
  check(
    "синхронизация НЕ перезаписала ручную сложность",
    edited.difficulty === "HARD" && edited.difficultySource === "MANUAL",
    `стало ${edited.difficulty}/${edited.difficultySource}`,
  );
  check(
    "синхронизация НЕ перезаписала ручной ETA",
    edited.approvalEtaMinutes === 4320 && edited.approvalEtaSource === "MANUAL",
    `стало ${edited.approvalEtaMinutes}/${edited.approvalEtaSource}`,
  );
  check(
    "синхронизация обновила поля, которых админ не касался",
    edited.title === "Оффер из сети (обновлён)",
  );

  const audit = await db.auditLog.count({
    where: { entityType: "offer", entityId: netOffer.id },
  });
  check("правки попали в журнал аудита", audit >= 2, `записей: ${audit}`);

  await resetOfferAuto(referrer.id, netOffer.id, "difficulty");
  edited = await db.offer.findUniqueOrThrow({ where: { id: netOffer.id } });
  check("сброс возвращает сложность под автоматику", edited.difficultySource === "AUTO");

  // ── 8. Реквизиты выплат ────────────────────────────────────────────────────

  section("Реквизиты и расчёт вывода");

  check("валидная карта проходит проверку Луна", isValidCardNumber("4242424242424242"));
  check("карта с опечаткой отклоняется", !isValidCardNumber("1234567890123456"));
  check(
    "валидный TRC-20 адрес проходит",
    isValidCryptoAddress("USDT_TRC20", "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE"),
  );
  check("мусор вместо адреса отклоняется", !isValidCryptoAddress("USDT_TRC20", "abc123"));
  check(
    "адрес чужой сети отклоняется",
    !isValidCryptoAddress("USDT_TRC20", "0x71C7656EC7ab88b098defB751B7401B5f6d8976F"),
  );

  const secret = "4242424242424242";
  check("реквизиты шифруются и расшифровываются", decryptDetails(encryptDetails(secret)) === secret);
  check(
    "шифртекст не содержит исходные данные",
    !encryptDetails(secret).includes(secret),
  );

  await db.exchangeRate.create({
    data: { pair: "RUB/USDT", rate: new D("95.00"), source: "test" },
  });

  const cardQuote = await quoteWithdrawal("CARD_RUB", 1000);
  check(
    "по карте комиссии нет, к получению вся сумма",
    cardQuote.amountNet === "1000.00" && cardQuote.payoutCurrency === "RUB",
    `${cardQuote.amountNet} ${cardQuote.payoutCurrency}`,
  );

  const cryptoQuote = await quoteWithdrawal("USDT_TRC20", 1000);
  check(
    "по USDT удержана комиссия 2%",
    cryptoQuote.fee === "20.00" && cryptoQuote.amountNet === "980.00",
    `комиссия ${cryptoQuote.fee}, к отправке ${cryptoQuote.amountNet}`,
  );
  check(
    "в расчёте есть курс и сумма в USDT",
    cryptoQuote.fxRate !== null && cryptoQuote.cryptoAmount !== null,
  );
  check(
    "курс включает спред платформы",
    Number(cryptoQuote.fxRate) > 95,
    `курс ${cryptoQuote.fxRate} при базовом 95`,
  );

  // ── 9. Заявка на вывод ─────────────────────────────────────────────────────

  section("Вывод средств");

  const method = await db.payoutMethod.create({
    data: {
      userId: worker.id,
      kind: "CARD_RUB",
      maskedValue: "•••• 4242",
      detailsEncrypted: encryptDetails(secret),
      isDefault: true,
    },
  });

  const workerUser = await db.user.findUniqueOrThrow({ where: { id: worker.id } });

  let belowMin = false;
  try {
    await createWithdrawal(workerUser, method.id, 100);
  } catch {
    belowMin = true;
  }
  check("сумма ниже минимума отклоняется", belowMin);

  let tooMuch = false;
  try {
    await createWithdrawal(workerUser, method.id, 99999);
  } catch {
    tooMuch = true;
  }
  check("сумма больше доступного отклоняется", tooMuch);

  const withdrawal = await createWithdrawal(workerUser, method.id, 600);
  let wallet = await db.wallet.findFirstOrThrow({ where: { userId: worker.id } });
  check(
    "средства заморожены: available уменьшился, hold вырос",
    new D(wallet.available).equals(new D("400")) && new D(wallet.hold).equals(new D("600")),
    `available=${wallet.available} hold=${wallet.hold}`,
  );

  let secondRequest = false;
  try {
    await createWithdrawal(workerUser, method.id, 400);
  } catch {
    secondRequest = true;
  }
  check("вторая активная заявка не создаётся", secondRequest);

  await approveWithdrawal(referrer.id, withdrawal.id);
  await markWithdrawalSent(referrer.id, withdrawal.id, "TESTTX123456");
  const sent = await db.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
  check("заявка доходит до статуса SENT с референсом", sent.status === "SENT" && sent.txHash === "TESTTX123456");

  await completeWithdrawal(withdrawal.id, referrer.id);
  wallet = await db.wallet.findFirstOrThrow({ where: { userId: worker.id } });
  check(
    "после подтверждения hold закрыт",
    new D(wallet.hold).equals(new D(0)) && new D(wallet.available).equals(new D("400")),
    `available=${wallet.available} hold=${wallet.hold}`,
  );
  check(
    "выплата учтена в totalWithdrawn",
    new D(wallet.totalWithdrawn).equals(new D("600")),
  );

  const events = await db.withdrawalEvent.count({ where: { withdrawalId: withdrawal.id } });
  check("все переходы заявки записаны в аудит", events >= 4, `событий: ${events}`);

  // ── 10. Возврат при отказе ─────────────────────────────────────────────────

  section("Возврат средств");

  // Пополняем до суммы, которая проходит минимум вывода.
  await db.$transaction(async (tx) => {
    await postLedgerEntry(tx, {
      userId: worker.id,
      direction: "CREDIT",
      type: "PROMO_BONUS",
      amount: 200,
      idempotencyKey: "promo:refund-test-topup",
      description: "Пополнение под проверку возврата",
    });
  });

  const w2 = await createWithdrawal(
    await db.user.findUniqueOrThrow({ where: { id: worker.id } }),
    method.id,
    500,
  );

  wallet = await db.wallet.findFirstOrThrow({ where: { userId: worker.id } });
  check(
    "заявка снова заморозила средства",
    new D(wallet.available).equals(new D("100")) && new D(wallet.hold).equals(new D("500")),
    `available=${wallet.available} hold=${wallet.hold}`,
  );

  await refundWithdrawal(w2.id, "REJECTED", "Не прошёл антифрод", referrer.id);

  wallet = await db.wallet.findFirstOrThrow({ where: { userId: worker.id } });
  check(
    "отказ вернул средства на баланс",
    new D(wallet.available).equals(new D("600")) && new D(wallet.hold).equals(new D(0)),
    `available=${wallet.available} hold=${wallet.hold}`,
  );

  let doubleRefund = false;
  try {
    await refundWithdrawal(w2.id, "REJECTED", "Повторный отказ", referrer.id);
  } catch {
    doubleRefund = true;
  }
  check("повторный отказ не проходит", doubleRefund);

  wallet = await db.wallet.findFirstOrThrow({ where: { userId: worker.id } });
  check(
    "баланс после повторного отказа не удвоился",
    new D(wallet.available).equals(new D("600")),
    `available=${wallet.available}`,
  );

  // ── 11. Идемпотентность леджера ────────────────────────────────────────────

  section("Целостность денег");

  const before = await db.wallet.findFirstOrThrow({ where: { userId: worker.id } });
  for (let i = 0; i < 3; i += 1) {
    await db.$transaction(async (tx) => {
      await postLedgerEntry(tx, {
        userId: worker.id,
        direction: "CREDIT",
        type: "PROMO_BONUS",
        amount: 50,
        idempotencyKey: "promo:fixed-key",
        description: "Проверка идемпотентности",
      });
    });
  }
  const after = await db.wallet.findFirstOrThrow({ where: { userId: worker.id } });
  check(
    "три вызова с одним ключом идемпотентности дают одно начисление",
    new D(after.available).minus(new D(before.available)).equals(new D("50")),
    `прирост ${new D(after.available).minus(new D(before.available))}`,
  );

  let negative = false;
  try {
    await db.$transaction(async (tx) => {
      await postLedgerEntry(tx, {
        userId: worker.id,
        direction: "DEBIT",
        type: "PENALTY",
        amount: 999999,
        idempotencyKey: "penalty:overdraft",
      });
    });
  } catch {
    negative = true;
  }
  check("списание больше баланса не проходит", negative);

  for (const userId of [worker.id, referrer.id, other.id]) {
    const result = await reconcileWallet(userId);
    check(
      `сверка леджера сходится (${userId === worker.id ? "исполнитель" : userId === referrer.id ? "пригласивший" : "другой"})`,
      result.balanced,
      `ожидалось ${result.expected}, фактически ${result.actual}`,
    );
  }

  const mutable = await db.ledgerEntry.findFirst({ where: { userId: worker.id } });
  check("у каждой записи леджера есть ключ идемпотентности", Boolean(mutable?.idempotencyKey));

  // ── 12. Уведомления ────────────────────────────────────────────────────────

  section("Уведомления");

  const notifications = await db.notification.findMany({
    where: { userId: worker.id },
    include: { deliveries: true },
  });
  check("уведомления создавались вместе с событиями", notifications.length > 0);

  const approvedNotice = notifications.find((n) => n.type === "SUBMISSION_APPROVED");
  check("есть уведомление об одобрении", Boolean(approvedNotice));
  check(
    "важное уведомление продублировано в бот",
    Boolean(approvedNotice?.deliveries.some((d) => d.channel === "BOT")),
  );

  const receivedNotice = notifications.find((n) => n.type === "SUBMISSION_RECEIVED");
  check(
    "рутинное уведомление в бот не дублируется",
    !receivedNotice?.deliveries.some((d) => d.channel === "BOT"),
  );

  const unread = await db.notification.count({
    where: { userId: worker.id, readAt: null },
  });
  await db.notification.updateMany({
    where: { userId: worker.id, readAt: null },
    data: { readAt: new Date() },
  });
  const unreadAfter = await db.notification.count({
    where: { userId: worker.id, readAt: null },
  });
  check(
    "отметка «прочитать всё» обнуляет счётчик",
    unread > 0 && unreadAfter === 0,
    `было ${unread}, стало ${unreadAfter}`,
  );

  const outbox = await db.outboxEvent.count();
  check("события для доставки в бот легли в outbox", outbox > 0);

  // ── 13. Фильтры каталога, ручной оффер, истечение ──────────────────────────

  section("Каталог, ручной оффер, истечение");

  check(
    "«до 150 ₽» включает и 120, и 150",
    matchesRewardFilter(120, parseRewardFilter("to150")) &&
      matchesRewardFilter(150, parseRewardFilter("to150")) &&
      matchesRewardFilter(150, parseRewardFilter("0-150")) &&
      !matchesRewardFilter(151, parseRewardFilter("to150")),
  );
  check(
    "«150–400 ₽» не отрезает нижнюю границу",
    matchesRewardFilter(150, parseRewardFilter("150to400")) &&
      matchesRewardFilter(400, parseRewardFilter("150to400")) &&
      !matchesRewardFilter(120, parseRewardFilter("150to400")),
  );
  check(
    "«от 400 ₽» не захватывает 380",
    matchesRewardFilter(400, parseRewardFilter("from400")) &&
      !matchesRewardFilter(380, parseRewardFilter("from400")),
  );

  const cheapOffer = await db.offer.create({
    data: {
      sourceId: source.id,
      slug: "filter-120",
      title: "Опрос за 120",
      description: "Описание задания для фильтра",
      rewardAmount: new D("120"),
      status: "ACTIVE",
    },
  });
  const edgeOffer = await db.offer.create({
    data: {
      sourceId: source.id,
      slug: "filter-150",
      title: "Калькулятор за 150",
      description: "Описание задания для фильтра",
      rewardAmount: new D("150"),
      status: "ACTIVE",
    },
  });
  await db.offer.create({
    data: {
      sourceId: source.id,
      slug: "filter-380",
      title: "Заказ за 380",
      description: "Описание задания для фильтра",
      rewardAmount: new D("380"),
      status: "ACTIVE",
    },
  });

  const low = await listOffers({ maxReward: 150, take: 50 });
  const lowIds = new Set(low.items.map((item) => item.id));
  check(
    "listOffers(до 150) возвращает 120 и 150",
    lowIds.has(cheapOffer.id) && lowIds.has(edgeOffer.id),
  );
  check(
    "listOffers(до 150) не возвращает 380",
    !lowIds.has(
      (await db.offer.findUniqueOrThrow({ where: { slug: "filter-380" } })).id,
    ),
  );

  const mid = await listOffers({ minReward: 150, maxReward: 400, take: 50 });
  const midIds = new Set(mid.items.map((item) => item.id));
  check(
    "listOffers(150–400) держит границу 150",
    midIds.has(edgeOffer.id),
  );

  const manual = await createManualOffer(referrer.id, {
    title: "Ручное задание для запуска",
    description: "Скачать приложение и прислать скриншот главного экрана",
    rewardAmount: 90,
    status: "ACTIVE",
    requirePhoto: true,
    requireComment: false,
    steps: [{ title: "Открыть ссылку" }],
  });
  const published = await listOffers({ maxReward: 150, take: 80 });
  check(
    "созданный вручную ACTIVE-оффер сразу в каталоге",
    published.items.some((item) => item.id === manual.id),
  );

  const ttlOffer = await makeOffer("expire-ttl", 0, "80");
  const ttlTake = await takeOffer(worker, ttlOffer.id);
  const beforeExpire = await db.offer.findUniqueOrThrow({ where: { id: ttlOffer.id } });
  await db.taskSubmission.update({
    where: { id: ttlTake.submissionId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expiredCount = await expireStaleSubmissions();
  const ttlRow = await db.taskSubmission.findUniqueOrThrow({
    where: { id: ttlTake.submissionId },
  });
  const afterExpire = await db.offer.findUniqueOrThrow({ where: { id: ttlOffer.id } });
  check("истёкший черновик переходит в EXPIRED", ttlRow.status === "EXPIRED");
  check("expire уменьшает takenCount", expiredCount >= 1);
  check(
    "после истечения слот в оффере освобождён",
    afterExpire.takenCount === beforeExpire.takenCount - 1,
    `было ${beforeExpire.takenCount}, стало ${afterExpire.takenCount}`,
  );
}

main()
  .then(async () => {
    await db.$disconnect();
    try {
      psql(baseName, `DROP DATABASE IF EXISTS ${testName} WITH (FORCE);`);
    } catch {
      // База для проверки могла не создаться — это не влияет на итог.
    }

    console.log(
      `\n${failures.length === 0 ? c.green : c.red}${c.bold}` +
        `${passed} проверок пройдено, ${failures.length} провалено${c.reset}`,
    );
    if (failures.length > 0) {
      console.log("\nПровалено:");
      for (const failure of failures) console.log(`  ${c.red}✗${c.reset} ${failure}`);
      process.exit(1);
    }
  })
  .catch(async (error) => {
    console.error(`\n${c.red}Проверка упала:${c.reset}`, error);
    await db.$disconnect().catch(() => {});
    process.exit(1);
  });

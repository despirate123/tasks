import { Prisma } from "@/generated/prisma";
import type {
  NotificationChannel,
  NotificationPriority,
  NotificationType,
} from "@/generated/prisma";
import { db } from "@/server/db";

type Tx = Prisma.TransactionClient;

/**
 * Какие уведомления дублируются в Telegram-бот.
 *
 * Правило: в бот идёт только то, из-за чего пользователь должен вернуться
 * в приложение или что-то сделать. Всё остальное — только колокольчик.
 * Иначе бот превращается в спам, его блокируют, и мы теряем канал для
 * действительно важных сообщений (выплаты, ограничение аккаунта).
 */
const BOT_DUPLICATED: Record<NotificationType, boolean> = {
  SUBMISSION_RECEIVED: false,
  SUBMISSION_APPROVED: true,
  SUBMISSION_REJECTED: true,
  SUBMISSION_NEEDS_REVISION: true,
  SUBMISSION_PAID: true,
  WITHDRAWAL_CREATED: false,
  WITHDRAWAL_COMPLETED: true,
  WITHDRAWAL_FAILED: true,
  REFERRAL_JOINED: false,
  REFERRAL_EARNING: false,
  NEW_OFFER: false,
  OFFER_EXPIRING: false,
  BALANCE_CREDITED: false,
  SYSTEM_ANNOUNCEMENT: true,
  ACCOUNT_LIMITED: true,
};

const DEFAULT_PRIORITY: Record<NotificationType, NotificationPriority> = {
  SUBMISSION_RECEIVED: "LOW",
  SUBMISSION_APPROVED: "HIGH",
  SUBMISSION_REJECTED: "HIGH",
  SUBMISSION_NEEDS_REVISION: "HIGH",
  SUBMISSION_PAID: "HIGH",
  WITHDRAWAL_CREATED: "NORMAL",
  WITHDRAWAL_COMPLETED: "HIGH",
  WITHDRAWAL_FAILED: "CRITICAL",
  REFERRAL_JOINED: "LOW",
  REFERRAL_EARNING: "NORMAL",
  NEW_OFFER: "LOW",
  OFFER_EXPIRING: "LOW",
  BALANCE_CREDITED: "NORMAL",
  SYSTEM_ANNOUNCEMENT: "NORMAL",
  ACCOUNT_LIMITED: "CRITICAL",
};

/** Уведомления этих приоритетов нельзя отключить в настройках. */
const UNDISMISSABLE: NotificationPriority[] = ["CRITICAL"];

export type NotifyInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  deepLink?: string;
  entityType?: string;
  entityId?: string;
  /** Однотипные события с одним ключом сворачиваются в одно уведомление. */
  groupKey?: string;
  priority?: NotificationPriority;
  data?: Prisma.InputJsonValue;
  expiresAt?: Date;
};

/**
 * Создание уведомления.
 *
 * Вызывается ВНУТРИ бизнес-транзакции — вместе со сменой статуса и записью
 * в леджер. Это принципиально: иначе появляются два класса багов —
 * «статус изменился, уведомления нет» и «уведомление пришло, транзакция
 * откатилась». Доставку в бот забирает отдельный воркер через outbox.
 */
export async function notify(tx: Tx, input: NotifyInput) {
  const priority = input.priority ?? DEFAULT_PRIORITY[input.type];

  // Группировка: если есть непрочитанное уведомление с тем же ключом —
  // обновляем его, а не создаём второе.
  if (input.groupKey) {
    const existing = await tx.notification.findFirst({
      where: { userId: input.userId, groupKey: input.groupKey, readAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      return tx.notification.update({
        where: { id: existing.id },
        data: {
          title: input.title,
          body: input.body,
          data: input.data ?? {},
          createdAt: new Date(),
        },
      });
    }
  }

  const channels: NotificationChannel[] = ["IN_APP"];
  if (BOT_DUPLICATED[input.type]) channels.push("BOT");

  const allowed = await filterByPreferences(
    tx,
    input.userId,
    input.type,
    priority,
    channels,
  );

  const notification = await tx.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      priority,
      title: input.title,
      body: input.body,
      deepLink: input.deepLink,
      entityType: input.entityType,
      entityId: input.entityId,
      groupKey: input.groupKey,
      data: input.data ?? {},
      expiresAt: input.expiresAt,
      deliveries: {
        create: channels.map((channel) => ({
          channel,
          status: allowed.includes(channel)
            ? channel === "IN_APP"
              ? ("SENT" as const)
              : ("QUEUED" as const)
            : ("SKIPPED" as const),
          sentAt: channel === "IN_APP" && allowed.includes(channel) ? new Date() : null,
        })),
      },
    },
  });

  // Transactional outbox: событие пишется в той же транзакции, что и данные.
  // Воркер разгребает очередь отдельно — уведомление не потеряется при падении
  // процесса и не отправится, если транзакция откатится.
  if (allowed.includes("BOT")) {
    await tx.outboxEvent.create({
      data: {
        topic: "notification.bot",
        payload: { notificationId: notification.id, userId: input.userId },
      },
    });
  }

  return notification;
}

async function filterByPreferences(
  tx: Tx,
  userId: string,
  type: NotificationType,
  priority: NotificationPriority,
  channels: NotificationChannel[],
): Promise<NotificationChannel[]> {
  if (UNDISMISSABLE.includes(priority)) return channels;

  const [pref, user] = await Promise.all([
    tx.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    }),
    tx.user.findUnique({ where: { id: userId }, select: { botBlockedAt: true } }),
  ]);

  return channels.filter((channel) => {
    if (channel === "IN_APP") return pref ? pref.inApp : true;
    // Бот заблокирован пользователем — не тратим попытки, in-app продолжает работать.
    if (user?.botBlockedAt) return false;
    return pref ? pref.bot : true;
  });
}

export async function getUnreadCount(userId: string): Promise<number> {
  return db.notification.count({
    where: {
      userId,
      readAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}

export async function listNotifications(
  userId: string,
  options: { take?: number; unreadOnly?: boolean } = {},
) {
  return db.notification.findMany({
    where: {
      userId,
      ...(options.unreadOnly ? { readAt: null } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    orderBy: { createdAt: "desc" },
    take: options.take ?? 50,
  });
}

export async function markRead(userId: string, notificationId: string) {
  await db.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function getNotificationPreferences(userId: string) {
  const rows = await db.notificationPreference.findMany({ where: { userId } });
  return new Map(rows.map((row) => [row.type, { inApp: row.inApp, bot: row.bot }]));
}

export async function setNotificationGroupPreference(
  userId: string,
  types: NotificationType[],
  channel: "inApp" | "bot",
  enabled: boolean,
) {
  for (const type of types) {
    const priority = DEFAULT_PRIORITY[type];
    if (UNDISMISSABLE.includes(priority)) continue;
    const current = await db.notificationPreference.findUnique({
      where: { userId_type: { userId, type } },
    });
    await db.notificationPreference.upsert({
      where: { userId_type: { userId, type } },
      create: {
        userId,
        type,
        inApp: channel === "inApp" ? enabled : true,
        bot: channel === "bot" ? enabled : BOT_DUPLICATED[type],
      },
      update: {
        inApp: channel === "inApp" ? enabled : (current?.inApp ?? true),
        bot: channel === "bot" ? enabled : (current?.bot ?? true),
      },
    });
  }
}

/** Группировка списка по дням — «Сегодня», «Вчера», дата. */
export function groupByDay<T extends { createdAt: Date }>(items: T[]) {
  const groups = new Map<string, T[]>();
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();

  for (const item of items) {
    const key = item.createdAt.toDateString();
    const label =
      key === today
        ? "Сегодня"
        : key === yesterday
          ? "Вчера"
          : item.createdAt.toLocaleDateString("ru-RU", {
              day: "numeric",
              month: "long",
            });
    const bucket = groups.get(label);
    if (bucket) bucket.push(item);
    else groups.set(label, [item]);
  }

  return [...groups.entries()].map(([label, items]) => ({ label, items }));
}

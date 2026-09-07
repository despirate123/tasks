import type { NotificationType } from "@/generated/prisma";

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  SUBMISSION_RECEIVED: "Задание принято в работу",
  SUBMISSION_APPROVED: "Задание одобрено",
  SUBMISSION_REJECTED: "Задание отклонено",
  SUBMISSION_NEEDS_REVISION: "Нужна доработка",
  SUBMISSION_PAID: "Вознаграждение зачислено",
  WITHDRAWAL_CREATED: "Заявка на вывод создана",
  WITHDRAWAL_COMPLETED: "Вывод выполнен",
  WITHDRAWAL_FAILED: "Вывод не прошёл",
  REFERRAL_JOINED: "Друг зарегистрировался",
  REFERRAL_EARNING: "Реферальное начисление",
  NEW_OFFER: "Новые задания",
  OFFER_EXPIRING: "Срок задания истекает",
  BALANCE_CREDITED: "Пополнение баланса",
  SYSTEM_ANNOUNCEMENT: "Объявления",
  ACCOUNT_LIMITED: "Ограничение аккаунта",
};

export type NotificationGroupId = "tasks" | "money" | "friends" | "offers" | "system";

export const NOTIFICATION_GROUPS: {
  id: NotificationGroupId;
  title: string;
  hint: string;
  types: NotificationType[];
  /** Эти типы в бот не дублируются — тумблер бота скрываем. */
  bot: boolean;
  locked?: boolean;
}[] = [
  {
    id: "tasks",
    title: "Задания",
    hint: "Принято, одобрено, доработка, отказ, зачисление",
    types: [
      "SUBMISSION_RECEIVED",
      "SUBMISSION_APPROVED",
      "SUBMISSION_REJECTED",
      "SUBMISSION_NEEDS_REVISION",
      "SUBMISSION_PAID",
      "OFFER_EXPIRING",
    ],
    bot: true,
  },
  {
    id: "money",
    title: "Выплаты",
    hint: "Заявки на вывод и зачисления",
    types: ["WITHDRAWAL_CREATED", "WITHDRAWAL_COMPLETED", "WITHDRAWAL_FAILED", "BALANCE_CREDITED"],
    bot: true,
  },
  {
    id: "friends",
    title: "Друзья",
    hint: "Регистрации и бонусы с рефералов",
    types: ["REFERRAL_JOINED", "REFERRAL_EARNING"],
    bot: false,
  },
  {
    id: "offers",
    title: "Новые задания",
    hint: "Появление офферов в каталоге",
    types: ["NEW_OFFER"],
    bot: false,
  },
  {
    id: "system",
    title: "Системные",
    hint: "Ограничение аккаунта и объявления. Их нельзя выключить.",
    types: ["SYSTEM_ANNOUNCEMENT", "ACCOUNT_LIMITED"],
    bot: true,
    locked: true,
  },
];

export const HOLD_EXPLAINER =
  "Деньги уже ваши, но ещё проходят проверку у рекламодателя. Обычно это часы или дни. У части офферов проверка занимает до 60 дней.";

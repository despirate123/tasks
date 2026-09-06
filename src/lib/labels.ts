import type {
  Difficulty,
  LedgerEntryType,
  NotificationType,
  PayoutMethodKind,
  SubmissionStatus,
  UserRole,
  UserStatus,
  ValueSource,
  WithdrawalStatus,
} from "@/generated/prisma";

export const DIFFICULTY: Record<
  Difficulty,
  { label: string; className: string; dot: string }
> = {
  EASY: {
    label: "Лёгкое",
    className: "bg-money-500/12 text-money-400 ring-money-500/25",
    dot: "bg-money-400",
  },
  MEDIUM: {
    label: "Среднее",
    className: "bg-medium/12 text-medium ring-medium/25",
    dot: "bg-medium",
  },
  HARD: {
    label: "Сложное",
    className: "bg-hard/12 text-hard ring-hard/25",
    dot: "bg-hard",
  },
};

export const DIFFICULTY_ORDER: Difficulty[] = ["EASY", "MEDIUM", "HARD"];

/**
 * Подписи статусов выполнения для пользователя.
 * Формулировки намеренно отвечают на вопрос «что сейчас происходит»,
 * а не называют внутреннее состояние машины.
 */
export const SUBMISSION_STATUS: Record<
  SubmissionStatus,
  { label: string; className: string; hint: string }
> = {
  DRAFT: {
    label: "Черновик",
    className: "bg-content-muted/12 text-content-secondary ring-border-strong",
    hint: "Задание взято. Загрузите доказательства и отправьте на проверку.",
  },
  PENDING_REVIEW: {
    label: "Ожидает подтверждения",
    className: "bg-info/12 text-info ring-info/25",
    hint: "Доказательства получены и стоят в очереди на проверку.",
  },
  IN_REVIEW: {
    label: "Проверяется",
    className: "bg-info/12 text-info ring-info/25",
    hint: "Модератор смотрит ваши доказательства прямо сейчас.",
  },
  NEEDS_REVISION: {
    label: "Нужна доработка",
    className: "bg-medium/12 text-medium ring-medium/25",
    hint: "Дозагрузите доказательства по замечанию и отправьте снова.",
  },
  PENDING_PAYOUT: {
    label: "Ожидает выплаты",
    className: "bg-brand-500/14 text-brand-300 ring-brand-500/28",
    hint: "Выполнение подтверждено. Деньги придут на баланс после холда.",
  },
  PAID: {
    label: "Выплачено",
    className: "bg-money-500/12 text-money-400 ring-money-500/25",
    hint: "Вознаграждение зачислено на баланс.",
  },
  REJECTED: {
    label: "Отклонено",
    className: "bg-hard/12 text-hard ring-hard/25",
    hint: "Доказательства не приняты. Причина указана ниже.",
  },
  EXPIRED: {
    label: "Истёк срок",
    className: "bg-content-muted/12 text-content-muted ring-border-strong",
    hint: "Срок выполнения закончился раньше, чем поступили доказательства.",
  },
  CANCELLED: {
    label: "Отменено",
    className: "bg-content-muted/12 text-content-muted ring-border-strong",
    hint: "Вы отменили это выполнение.",
  },
};

/** Что сделать дальше — короткая подпись в списках выполнений. */
export function submissionNextAction(status: SubmissionStatus): string {
  if (status === "DRAFT") return "Загрузить пруфы";
  if (status === "NEEDS_REVISION") return "Доработать";
  if (status === "PENDING_REVIEW" || status === "IN_REVIEW") {
    return "Статус проверки";
  }
  return "Подробнее";
}

export const WITHDRAWAL_STATUS: Record<
  WithdrawalStatus,
  { label: string; className: string }
> = {
  PENDING_REVIEW: {
    label: "На проверке",
    className: "bg-info/12 text-info ring-info/25",
  },
  APPROVED: {
    label: "Одобрена",
    className: "bg-brand-500/14 text-brand-300 ring-brand-500/28",
  },
  PROCESSING: {
    label: "Обрабатывается",
    className: "bg-brand-500/14 text-brand-300 ring-brand-500/28",
  },
  SENT: {
    label: "Отправлена",
    className: "bg-medium/12 text-medium ring-medium/25",
  },
  COMPLETED: {
    label: "Выплачена",
    className: "bg-money-500/12 text-money-400 ring-money-500/25",
  },
  FAILED: {
    label: "Ошибка",
    className: "bg-hard/12 text-hard ring-hard/25",
  },
  REJECTED: {
    label: "Отклонена",
    className: "bg-hard/12 text-hard ring-hard/25",
  },
  CANCELLED: {
    label: "Отменена",
    className: "bg-content-muted/12 text-content-muted ring-border-strong",
  },
};

export const LEDGER_TYPE: Record<LedgerEntryType, string> = {
  TASK_REWARD: "Вознаграждение за задание",
  REFERRAL_BONUS: "Реферальный бонус",
  WITHDRAWAL_HOLD: "Заморозка для вывода",
  WITHDRAWAL_SETTLED: "Вывод средств",
  WITHDRAWAL_REFUND: "Возврат по выводу",
  WITHDRAWAL_FEE: "Комиссия за вывод",
  MANUAL_ADJUSTMENT: "Корректировка администратором",
  PROMO_BONUS: "Бонус",
  PENALTY: "Штраф",
  REVERSAL: "Отмена операции",
};

export const PAYOUT_METHOD: Record<
  PayoutMethodKind,
  { label: string; short: string; currency: string; network?: string }
> = {
  CARD_RUB: { label: "Банковская карта", short: "Карта", currency: "RUB" },
  SBP_RUB: { label: "СБП по номеру телефона", short: "СБП", currency: "RUB" },
  USDT_TRC20: {
    label: "USDT · TRC-20 (TRON)",
    short: "USDT TRC-20",
    currency: "USDT",
    network: "TRON",
  },
  USDT_TON: {
    label: "USDT · TON",
    short: "USDT TON",
    currency: "USDT",
    network: "TON",
  },
  USDT_ERC20: {
    label: "USDT · ERC-20 (Ethereum)",
    short: "USDT ERC-20",
    currency: "USDT",
    network: "Ethereum",
  },
};

export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  SUBMISSION_RECEIVED: "inbox",
  SUBMISSION_APPROVED: "check",
  SUBMISSION_REJECTED: "x",
  SUBMISSION_NEEDS_REVISION: "edit",
  SUBMISSION_PAID: "coins",
  WITHDRAWAL_CREATED: "arrow-up",
  WITHDRAWAL_COMPLETED: "banknote",
  WITHDRAWAL_FAILED: "alert",
  REFERRAL_JOINED: "users",
  REFERRAL_EARNING: "gift",
  NEW_OFFER: "sparkles",
  OFFER_EXPIRING: "clock",
  BALANCE_CREDITED: "coins",
  SYSTEM_ANNOUNCEMENT: "megaphone",
  ACCOUNT_LIMITED: "shield",
};

export const VALUE_SOURCE: Record<ValueSource, { label: string; hint: string }> = {
  AUTO: {
    label: "авто",
    hint: "Значение рассчитывается автоматически по фактическим данным.",
  },
  NETWORK: {
    label: "из сети",
    hint: "Значение получено от партнёрской сети при синхронизации.",
  },
  MANUAL: {
    label: "вручную",
    hint: "Выставлено администратором. Синхронизация это значение не изменит.",
  },
};

export const USER_ROLE: Record<UserRole, string> = {
  USER: "Пользователь",
  SUPPORT: "Поддержка",
  MODERATOR: "Модератор",
  FINANCE: "Финансы",
  ADMIN: "Администратор",
  OWNER: "Владелец",
};

export const USER_STATUS: Record<UserStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: "Активен",
    className: "bg-money-500/12 text-money-400 ring-money-500/25",
  },
  LIMITED: {
    label: "Ограничен",
    className: "bg-medium/12 text-medium ring-medium/25",
  },
  BLOCKED: {
    label: "Заблокирован",
    className: "bg-hard/12 text-hard ring-hard/25",
  },
};

/** Статусы, которые пользователь видит как «в работе». */
export const ACTIVE_SUBMISSION_STATUSES: SubmissionStatus[] = [
  "DRAFT",
  "PENDING_REVIEW",
  "IN_REVIEW",
  "NEEDS_REVISION",
];

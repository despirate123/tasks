import { Bell } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import {
  groupByDay,
  listNotifications,
  getUnreadCount,
} from "@/server/modules/notifications";
import { EmptyState } from "@/components/ui/misc";
import { NotificationList, MarkAllReadButton } from "./notification-list";

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <EmptyState
        icon={<Bell />}
        title="Откройте приложение через Telegram"
        description="Уведомления привязаны к вашему аккаунту."
      />
    );
  }

  const [notifications, unread] = await Promise.all([
    listNotifications(user.id),
    getUnreadCount(user.id),
  ]);

  const groups = groupByDay(notifications).map((group) => ({
    label: group.label,
    items: group.items.map((n) => ({
      id: n.id,
      type: n.type,
      priority: n.priority,
      title: n.title,
      body: n.body,
      deepLink: n.deepLink,
      readAt: n.readAt ? n.readAt.toISOString() : null,
      createdAt: n.createdAt.toISOString(),
    })),
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] leading-tight font-bold">Уведомления</h1>
          <p className="mt-1 text-[13px] text-content-secondary">
            {unread > 0
              ? `Непрочитанных: ${unread}`
              : "Все уведомления прочитаны"}
          </p>
        </div>
        {unread > 0 ? <MarkAllReadButton /> : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          icon={<Bell />}
          title="Уведомлений пока нет"
          description="Здесь появятся результаты проверки заданий, начисления и статусы выплат. Важные сообщения мы также дублируем в бот."
        />
      ) : (
        <NotificationList groups={groups} />
      )}

      <div className="rounded-card bg-surface-raised/60 p-4 ring-1 ring-inset ring-border-subtle">
        <p className="text-[12.5px] leading-relaxed text-content-secondary">
          Результаты проверки, зачисления и статусы выплат дублируются в
          Telegram-бот. Остальное — только здесь, чтобы бот не превращался в спам.
        </p>
      </div>
    </div>
  );
}

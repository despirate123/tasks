"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpCircle,
  Banknote,
  Bell,
  CheckCircle2,
  Clock,
  Coins,
  Gift,
  Inbox,
  Megaphone,
  PencilLine,
  Shield,
  Sparkles,
  Users,
  XCircle,
} from "lucide-react";
import type { NotificationType } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/server/actions";
import { haptic } from "@/components/telegram-init";

type Item = {
  id: string;
  type: NotificationType;
  priority: string;
  title: string;
  body: string;
  deepLink: string | null;
  readAt: string | null;
  createdAt: string;
};

const ICONS: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
  SUBMISSION_RECEIVED: Inbox,
  SUBMISSION_APPROVED: CheckCircle2,
  SUBMISSION_REJECTED: XCircle,
  SUBMISSION_NEEDS_REVISION: PencilLine,
  SUBMISSION_PAID: Coins,
  WITHDRAWAL_CREATED: ArrowUpCircle,
  WITHDRAWAL_COMPLETED: Banknote,
  WITHDRAWAL_FAILED: AlertTriangle,
  REFERRAL_JOINED: Users,
  REFERRAL_EARNING: Gift,
  NEW_OFFER: Sparkles,
  OFFER_EXPIRING: Clock,
  BALANCE_CREDITED: Coins,
  SYSTEM_ANNOUNCEMENT: Megaphone,
  ACCOUNT_LIMITED: Shield,
};

const TONES: Partial<Record<NotificationType, string>> = {
  SUBMISSION_APPROVED: "bg-money-500/12 text-money-400",
  SUBMISSION_PAID: "bg-money-500/12 text-money-400",
  BALANCE_CREDITED: "bg-money-500/12 text-money-400",
  WITHDRAWAL_COMPLETED: "bg-money-500/12 text-money-400",
  REFERRAL_EARNING: "bg-money-500/12 text-money-400",
  SUBMISSION_REJECTED: "bg-hard/12 text-hard",
  WITHDRAWAL_FAILED: "bg-hard/12 text-hard",
  ACCOUNT_LIMITED: "bg-hard/12 text-hard",
  SUBMISSION_NEEDS_REVISION: "bg-medium/12 text-medium",
  OFFER_EXPIRING: "bg-medium/12 text-medium",
};

export function NotificationList({
  groups,
}: {
  groups: { label: string; items: Item[] }[];
}) {
  const router = useRouter();
  const flat = groups.flatMap((g) => g.items);
  // Оптимистичное чтение: бейдж и подсветка гаснут мгновенно, не дожидаясь
  // ответа сервера — иначе тап по уведомлению ощущается «залипающим».
  const [readIds, addReadId] = useOptimistic<string[], string>(
    flat.filter((i) => i.readAt).map((i) => i.id),
    (state, id) => [...state, id],
  );
  const [, startTransition] = useTransition();

  const open = (item: Item) => {
    haptic("light");
    startTransition(async () => {
      addReadId(item.id);
      await markNotificationReadAction(item.id);
      if (item.deepLink) router.push(item.deepLink);
      else router.refresh();
    });
  };

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.label} className="space-y-2">
          <p className="px-1 text-[11px] font-semibold tracking-wide text-content-muted uppercase">
            {group.label}
          </p>
          <div className="motion-list overflow-hidden rounded-card bg-surface-raised/70 ring-1 ring-inset ring-border-subtle">
            {group.items.map((item, index) => {
              const Icon = ICONS[item.type] ?? Bell;
              const isRead = readIds.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => open(item)}
                  className={cn(
                    "flex w-full items-start gap-3 px-4 py-3.5 text-left transition-[background,transform] duration-300 ease-soft active:bg-surface-overlay active:scale-[0.995]",
                    index > 0 && "border-t border-border-subtle",
                    !isRead && "bg-brand-500/[0.055]",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-xl",
                      TONES[item.type] ?? "bg-surface-overlay text-content-secondary",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "min-w-0 truncate text-[13.5px]",
                          isRead ? "font-medium" : "font-semibold",
                        )}
                      >
                        {item.title}
                      </span>
                      {!isRead ? (
                        <span className="pulse-dot size-2 shrink-0 rounded-full bg-brand-400" />
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[12.5px] leading-relaxed text-content-secondary">
                      {item.body}
                    </span>
                    <span className="mt-1.5 block text-[11px] text-content-muted">
                      {formatRelative(item.createdAt)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarkAllReadButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await markAllNotificationsReadAction();
          router.refresh();
        })
      }
    >
      Прочитать всё
    </Button>
  );
}

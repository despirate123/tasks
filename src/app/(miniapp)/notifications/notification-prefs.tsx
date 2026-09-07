"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { NotificationType } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { NOTIFICATION_GROUPS } from "@/lib/notification-settings";
import { setNotificationGroupAction } from "@/server/actions";
import { haptic } from "@/components/telegram-init";

type Pref = { inApp: boolean; bot: boolean };

export function NotificationPrefs({
  prefs,
}: {
  prefs: Partial<Record<NotificationType, Pref>>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const groupValue = (types: NotificationType[], key: keyof Pref) =>
    types.every((type) => prefs[type]?.[key] !== false);

  const toggle = (types: NotificationType[], channel: "inApp" | "bot", enabled: boolean) => {
    haptic("light");
    startTransition(async () => {
      await setNotificationGroupAction(types, channel, enabled);
      router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      {NOTIFICATION_GROUPS.map((group) => {
        const inApp = groupValue(group.types, "inApp");
        const bot = groupValue(group.types, "bot");
        return (
          <div
            key={group.id}
            className="rounded-card bg-surface-raised/70 p-3.5 ring-1 ring-inset ring-border-subtle"
          >
            <p className="text-[13.5px] font-semibold">{group.title}</p>
            <p className="mt-0.5 text-[12px] leading-relaxed text-content-muted">
              {group.hint}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Toggle
                label="В приложении"
                on={inApp}
                disabled={pending || group.locked}
                onClick={() => toggle(group.types, "inApp", !inApp)}
              />
              {group.bot ? (
                <Toggle
                  label="В боте"
                  on={bot}
                  disabled={pending || group.locked}
                  onClick={() => toggle(group.types, "bot", !bot)}
                />
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Toggle({
  label,
  on,
  disabled,
  onClick,
}: {
  label: string;
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition disabled:opacity-60",
        on
          ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
          : "bg-surface-input text-content-secondary ring-border-strong",
      )}
    >
      {label}
      {on ? " · вкл" : " · выкл"}
    </button>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const POLL_INTERVAL_MS = 20_000;

/**
 * Колокольчик с бейджем непрочитанных.
 *
 * Доставка через поллинг, а не WebSocket. Причина: WebView Telegram агрессивно
 * засыпает при сворачивании, соединение рвётся, и надёжное восстановление
 * пропущенных событий — отдельная подсистема. Продукту достаточно, чтобы
 * счётчик обновлялся за секунды. Поллинг останавливается, когда приложение
 * не на экране, поэтому реальная нагрузка ниже номинальной.
 *
 * На этапе 2 заменяется на SSE (см. docs/04-key-decisions.md).
 */
export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);

  // У счётчика два источника: опрос и серверный рендер. После отметки
  // уведомлений прочитанными роут ревалидируется и в проп приходит свежее
  // число — без этой синхронизации бейдж продолжал бы висеть до следующего
  // тика опроса, то есть до 20 секунд после действия пользователя.
  useEffect(() => {
    setCount(initialCount);
  }, [initialCount]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", {
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { count: number };
      setCount(data.count);
    } catch {
      // Сеть в мобильном WebView отваливается регулярно — молча ждём
      // следующий тик, показывать ошибку из-за счётчика бессмысленно.
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer) return;
      timer = setInterval(refresh, POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  return (
    <Link
      href="/notifications"
      aria-label={count > 0 ? `Уведомления, ${count} непрочитанных` : "Уведомления"}
      className="relative flex size-10 items-center justify-center rounded-xl bg-surface-raised/80 ring-1 ring-inset ring-border-subtle transition active:scale-95"
    >
      <Bell className="size-[18px] text-content-secondary" />
      {count > 0 ? (
        <span
          className={cn(
            "tabular absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-hard px-1.5 text-[10px] font-bold text-white ring-2 ring-surface-base",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

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
  const [seenServerCount, setSeenServerCount] = useState(initialCount);

  // У счётчика два источника: опрос и серверный рендер. После отметки
  // уведомлений прочитанными роут ревалидируется и в пропе приходит свежее
  // число — без этой сверки бейдж висел бы до следующего тика опроса,
  // то есть до 20 секунд после действия пользователя.
  //
  // Сравнение с предыдущим значением пропа — документированный способ
  // подстроить состояние под изменившийся проп; эффект здесь дал бы лишний
  // рендер и мигание бейджа.
  if (initialCount !== seenServerCount) {
    setSeenServerCount(initialCount);
    setCount(initialCount);
  }

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
      className="relative flex size-10 items-center justify-center rounded-full glass-thin ring-1 ring-inset ring-white/12 transition-[transform,background] duration-300 ease-soft hover:bg-white/6 active:scale-95"
    >
      <Bell className="size-[18px] text-content-secondary" strokeWidth={1.75} />
      {count > 0 ? (
        <span
          className={cn(
            "animate-pop tabular absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-pill bg-[var(--acid)] px-1.5 text-[10px] font-bold text-[var(--ink)] ring-2 ring-[var(--canvas)]",
          )}
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

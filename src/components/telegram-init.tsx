"use client";

import { useEffect } from "react";
import { applyTelegramSafeArea } from "@/lib/telegram-safe-area";

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  isVersionAtLeast?: (version: string) => boolean;
  requestFullscreen?: () => void;
  initData: string;
  themeParams?: Record<string, string>;
  viewportStableHeight?: number;
  safeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  contentSafeAreaInset?: { top?: number; bottom?: number; left?: number; right?: number };
  onEvent?: (
    event: string,
    handler: (payload?: { isStateStable?: boolean }) => void,
  ) => void;
  offEvent?: (
    event: string,
    handler: (payload?: { isStateStable?: boolean }) => void,
  ) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
  disableVerticalSwipes?: () => void;
  openTelegramLink?: (url: string) => void;
  platform?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/**
 * Инициализация Telegram WebView.
 *
 * Вне Telegram (обычный браузер, локальная разработка) молча ничего не делает —
 * приложение остаётся работоспособным, аутентификация идёт через DEV_AUTH_BYPASS.
 */
function tgSupports(app: TelegramWebApp, version: string) {
  try {
    return app.isVersionAtLeast?.(version) === true;
  } catch {
    return false;
  }
}

function tgTry(fn: () => void) {
  try {
    fn();
  } catch {
    /* старый WebView или обычный браузер */
  }
}

export function TelegramInit({ serverUserId = null }: { serverUserId?: string | null }) {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    tgTry(() => webApp.ready());
    tgTry(() => webApp.expand());
    // requestFullscreen — Bot API 8.0. В браузере и старом Telegram
    // метод есть, но скрипт пишет ошибку в console и Next рисует оверлей.
    if (tgSupports(webApp, "8.0")) tgTry(() => webApp.requestFullscreen?.());
    if (tgSupports(webApp, "7.7")) tgTry(() => webApp.disableVerticalSwipes?.());
    if (tgSupports(webApp, "6.1")) {
      tgTry(() => webApp.setHeaderColor?.("#121212"));
      tgTry(() => webApp.setBackgroundColor?.("#121212"));
    }

    const applyNow = (
      payload?: { isStateStable?: boolean },
      force = false,
    ) => {
      applyTelegramSafeArea(webApp, {
        force,
        isStateStable: payload?.isStateStable !== false,
      });
    };

    // viewportChanged во время скролла приходит с isStateStable=false —
    // игнор. Остальные события дебаунсим, чтобы не дёргать CSS mid-gesture.
    let scheduled: number | null = null;
    const scheduleStable = () => {
      if (scheduled != null) window.clearTimeout(scheduled);
      scheduled = window.setTimeout(() => applyNow({ isStateStable: true }), 80);
    };
    const onViewportChanged = (payload?: { isStateStable?: boolean }) => {
      if (payload?.isStateStable === false) return;
      scheduleStable();
    };

    applyNow(undefined, true);
    webApp.onEvent?.("viewportChanged", onViewportChanged);
    webApp.onEvent?.("fullscreenChanged", scheduleStable);
    webApp.onEvent?.("safeAreaChanged", scheduleStable);
    webApp.onEvent?.("contentSafeAreaChanged", scheduleStable);

    // Обмен initData на серверную сессию. Если сервер ещё рисует демо-Алексея,
    // после успешного входа перезагружаем страницу уже под реальным аккаунтом.
    if (webApp.initData) {
      void fetch("/api/auth/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData: webApp.initData }),
      })
        .then(async (response) => {
          if (!response.ok) return;
          const data = (await response.json()) as { user?: { id?: string } };
          if (!data.user?.id || data.user.id === serverUserId) return;
          // Если cookie не записалась, reload зациклится и WebView сыпет ошибками.
          const key = "pb-auth-reloaded";
          if (sessionStorage.getItem(key) === data.user.id) return;
          sessionStorage.setItem(key, data.user.id);
          window.location.reload();
        })
        .catch(() => {
          /* сеть туннеля могла моргнуть */
        });
    }

    return () => {
      if (scheduled != null) window.clearTimeout(scheduled);
      webApp.offEvent?.("viewportChanged", onViewportChanged);
      webApp.offEvent?.("fullscreenChanged", scheduleStable);
      webApp.offEvent?.("safeAreaChanged", scheduleStable);
      webApp.offEvent?.("contentSafeAreaChanged", scheduleStable);
    };
  }, [serverUserId]);

  return null;
}

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  const feedback = window.Telegram?.WebApp?.HapticFeedback;
  if (feedback?.impactOccurred) {
    try {
      feedback.impactOccurred(style);
      return;
    } catch {
      /* старый WebView */
    }
  }
  try {
    navigator.vibrate?.(style === "heavy" ? 26 : style === "medium" ? 16 : 10);
  } catch {
    /* нет вибрации */
  }
}

export function hapticNotify(type: "error" | "success" | "warning") {
  const feedback = window.Telegram?.WebApp?.HapticFeedback;
  if (feedback?.notificationOccurred) {
    try {
      feedback.notificationOccurred(type);
      return;
    } catch {
      /* старый WebView */
    }
  }
  try {
    navigator.vibrate?.(type === "error" ? [12, 36, 18] : 16);
  } catch {
    /* нет вибрации */
  }
}

/** Открывает t.me-ссылку в Telegram, в браузере — в новой вкладке. */
export function openTelegramLink(url: string) {
  try {
    const app = window.Telegram?.WebApp;
    if (app?.openTelegramLink) {
      app.openTelegramLink(url);
      return;
    }
  } catch {
    /* старый WebView или обычный браузер */
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

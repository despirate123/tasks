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
  onEvent?: (event: string, handler: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
  disableVerticalSwipes?: () => void;
  openTelegramLink?: (url: string) => void;
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
      tgTry(() => webApp.setHeaderColor?.("#000000"));
      tgTry(() => webApp.setBackgroundColor?.("#000000"));
    }

    const applyViewport = () => applyTelegramSafeArea(webApp);
    applyViewport();
    webApp.onEvent?.("viewportChanged", applyViewport);
    webApp.onEvent?.("fullscreenChanged", applyViewport);
    webApp.onEvent?.("safeAreaChanged", applyViewport);
    webApp.onEvent?.("contentSafeAreaChanged", applyViewport);

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
  }, [serverUserId]);

  return null;
}

export function haptic(style: "light" | "medium" | "heavy" = "light") {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
}

export function hapticNotify(type: "error" | "success" | "warning") {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(type);
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

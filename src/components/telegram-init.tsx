"use client";

import { useEffect } from "react";

type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  requestFullscreen?: () => void;
  initData: string;
  themeParams?: Record<string, string>;
  viewportStableHeight?: number;
  safeAreaInset?: { top?: number };
  contentSafeAreaInset?: { top?: number };
  onEvent?: (event: string, handler: () => void) => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
  disableVerticalSwipes?: () => void;
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
export function TelegramInit({ serverUserId = null }: { serverUserId?: string | null }) {
  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) return;

    webApp.ready();
    webApp.expand();
    webApp.requestFullscreen?.();
    webApp.disableVerticalSwipes?.();
    webApp.setHeaderColor?.("#0b0f1a");
    webApp.setBackgroundColor?.("#0b0f1a");

    // Safe area и высота вьюпорта — иначе контент уезжает под системные элементы
    // и нижняя навигация оказывается за пределами экрана.
    const applyViewport = () => {
      if (webApp.viewportStableHeight) {
        document.documentElement.style.setProperty(
          "--tg-viewport-stable-height",
          `${webApp.viewportStableHeight}px`,
        );
      }
      const top = Math.max(
        webApp.safeAreaInset?.top ?? 0,
        webApp.contentSafeAreaInset?.top ?? 0,
      );
      if (top) {
        document.documentElement.style.setProperty("--safe-top", `${top}px`);
      }
    };
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
          if (data.user?.id && data.user.id !== serverUserId) {
            window.location.reload();
          }
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

type Insets = { top?: number; bottom?: number; left?: number; right?: number };

export type TelegramViewport = {
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  viewportStableHeight?: number;
};

function px(value: number | undefined) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** System inset + content inset, как требует Telegram Bot API 8+. */
export function applyTelegramSafeArea(app: TelegramViewport) {
  const sys = app.safeAreaInset ?? {};
  const content = app.contentSafeAreaInset ?? {};
  const root = document.documentElement;

  const write = (name: string, value: number) => {
    root.style.setProperty(name, `${value}px`);
  };

  write("--tg-safe-area-inset-top", px(sys.top));
  write("--tg-safe-area-inset-bottom", px(sys.bottom));
  write("--tg-safe-area-inset-left", px(sys.left));
  write("--tg-safe-area-inset-right", px(sys.right));
  write("--tg-content-safe-area-inset-top", px(content.top));
  write("--tg-content-safe-area-inset-bottom", px(content.bottom));
  write("--tg-content-safe-area-inset-left", px(content.left));
  write("--tg-content-safe-area-inset-right", px(content.right));

  const top = px(sys.top) + px(content.top);
  const bottom = px(sys.bottom) + px(content.bottom);
  const left = px(sys.left) + px(content.left);
  const right = px(sys.right) + px(content.right);

  // Нули не записываем: оставляем CSS calc с env(safe-area-inset-*).
  if (top) write("--safe-top", top);
  if (bottom) write("--safe-bottom", bottom);
  if (left) write("--safe-left", left);
  if (right) write("--safe-right", right);

  if (app.viewportStableHeight) {
    root.style.setProperty(
      "--tg-viewport-stable-height",
      `${app.viewportStableHeight}px`,
    );
  }
}

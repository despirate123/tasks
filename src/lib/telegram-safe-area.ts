type Insets = { top?: number; bottom?: number; left?: number; right?: number };

export type TelegramViewport = {
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  viewportStableHeight?: number;
};

export type ApplyTelegramSafeAreaOptions = {
  /** Первый кадр / смена ориентации — пишем даже мелкий сдвиг. */
  force?: boolean;
  /**
   * Telegram `viewportChanged.isStateStable`.
   * `false` — жест скролла: viewport прыгает, писать CSS-переменные нельзя.
   */
  isStateStable?: boolean;
};

const INSET_JITTER_PX = 8;
const HEIGHT_JITTER_PX = 12;

type Box = { top: number; bottom: number; left: number; right: number };

let lastInsets: Box | null = null;
let lastHeight: number | null = null;

function px(value: number | undefined) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function drifted(prev: number, next: number, threshold: number) {
  return Math.abs(prev - next) >= threshold;
}

function insetsDrifted(prev: Box, next: Box, threshold: number) {
  return (
    drifted(prev.top, next.top, threshold) ||
    drifted(prev.bottom, next.bottom, threshold) ||
    drifted(prev.left, next.left, threshold) ||
    drifted(prev.right, next.right, threshold)
  );
}

function write(root: HTMLElement, name: string, value: string) {
  if (root.style.getPropertyValue(name) === value) return;
  root.style.setProperty(name, value);
}

function writePx(root: HTMLElement, name: string, value: number) {
  write(root, name, `${value}px`);
}

/** System inset + content inset, как требует Telegram Bot API 8+. */
export function applyTelegramSafeArea(
  app: TelegramViewport,
  options: ApplyTelegramSafeAreaOptions = {},
) {
  const force = options.force === true;
  const isStateStable = options.isStateStable !== false;

  // Во время жеста Telegram шлёт viewportChanged с isStateStable=false
  // и промежуточной высотой. Запись --safe-* / --tg-viewport-stable-height
  // двигает sticky-шапку и min-height — экран трясётся.
  if (!force && !isStateStable) return;

  const sys = app.safeAreaInset ?? {};
  const content = app.contentSafeAreaInset ?? {};
  const root = document.documentElement;

  const next: Box = {
    top: px(sys.top) + px(content.top),
    bottom: px(sys.bottom) + px(content.bottom),
    left: px(sys.left) + px(content.left),
    right: px(sys.right) + px(content.right),
  };

  const commitInsets =
    force || !lastInsets || insetsDrifted(lastInsets, next, INSET_JITTER_PX);

  if (commitInsets) {
    writePx(root, "--tg-safe-area-inset-top", px(sys.top));
    writePx(root, "--tg-safe-area-inset-bottom", px(sys.bottom));
    writePx(root, "--tg-safe-area-inset-left", px(sys.left));
    writePx(root, "--tg-safe-area-inset-right", px(sys.right));
    writePx(root, "--tg-content-safe-area-inset-top", px(content.top));
    writePx(root, "--tg-content-safe-area-inset-bottom", px(content.bottom));
    writePx(root, "--tg-content-safe-area-inset-left", px(content.left));
    writePx(root, "--tg-content-safe-area-inset-right", px(content.right));

    // Нули не записываем: оставляем CSS calc с env(safe-area-inset-*).
    if (next.top) writePx(root, "--safe-top", next.top);
    if (next.bottom) writePx(root, "--safe-bottom", next.bottom);
    if (next.left) writePx(root, "--safe-left", next.left);
    if (next.right) writePx(root, "--safe-right", next.right);

    lastInsets = next;
  }

  const height = app.viewportStableHeight;
  if (!height) return;

  const commitHeight =
    force || lastHeight == null || drifted(lastHeight, height, HEIGHT_JITTER_PX);

  if (commitHeight) {
    writePx(root, "--tg-viewport-stable-height", height);
    lastHeight = height;
  }
}

"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeHttpUrl } from "@/lib/urls";
import { haptic } from "@/components/telegram-init";

export type PromoBannerSlide = {
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  imageUrl: string | null;
  background: string;
  accent: string;
};

const INTERVAL_MS = 5000;
const SWIPE_RATIO = 0.2;
const AXIS_LOCK_PX = 8;

export function PromoBannerCard({
  banner,
  className,
}: {
  banner: PromoBannerSlide;
  className?: string;
}) {
  const imageUrl = sanitizeHttpUrl(banner.imageUrl);
  return (
    <div
      className={cn(
        "clip-frame clip-banner relative overflow-hidden rounded-[22px] px-4 py-3.5 ring-1 ring-inset ring-white/12",
        className,
      )}
      style={{ background: banner.background }}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-35"
        />
      ) : (
        <div
          aria-hidden
          className="corner-wash"
          style={
            {
              "--wash": `color-mix(in srgb, ${banner.accent} 28%, transparent)`,
            } as CSSProperties
          }
        />
      )}
      <div className="relative flex items-start gap-3">
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full"
          style={{ background: banner.accent, color: "#111" }}
        >
          <Megaphone className="size-4" strokeWidth={2.2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] leading-snug font-semibold [overflow-wrap:anywhere]">
            {banner.title}
          </span>
          {banner.subtitle ? (
            <span className="mt-0.5 block line-clamp-2 text-[12px] leading-snug text-white/75">
              {banner.subtitle}
            </span>
          ) : null}
        </span>
      </div>
    </div>
  );
}

function isBannerSlide(value: unknown): value is PromoBannerSlide {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.title === "string" &&
    typeof item.background === "string" &&
    typeof item.accent === "string"
  );
}

function bannerSignature(banners: PromoBannerSlide[]) {
  return banners
    .map(
      (banner) =>
        `${banner.id}:${banner.title}:${banner.subtitle ?? ""}:${banner.href ?? ""}:${banner.imageUrl ?? ""}:${banner.background}:${banner.accent}`,
    )
    .join("|");
}

function useLiveBanners(initial: PromoBannerSlide[]) {
  const [banners, setBanners] = useState(initial);
  const initialKey = bannerSignature(initial);

  useEffect(() => {
    setBanners(initial);
    // Серверный payload сравниваем по содержимому, не по ссылке на массив.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialKey]);

  useEffect(() => {
    let cancelled = false;

    const apply = (data: unknown) => {
      if (cancelled || !Array.isArray(data) || !data.every(isBannerSlide)) return;
      setBanners(data);
    };

    const load = () => {
      fetch("/api/banners", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then(apply)
        .catch(() => undefined);
    };

    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, []);

  return banners;
}

export function PromoBannerRail({ banners: initial }: { banners: PromoBannerSlide[] }) {
  const banners = useLiveBanners(initial);
  const viewportRef = useRef<HTMLDivElement>(null);
  const drag = useRef({
    active: false,
    axis: null as "h" | "v" | null,
    startX: 0,
    startY: 0,
    dx: 0,
    width: 1,
    swiped: false,
  });
  const [index, setIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);

  const count = banners.length;

  useEffect(() => {
    if (index < count) return;
    setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (count < 2 || dragging) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % count);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [count, dragging, index]);

  useEffect(() => {
    const root = viewportRef.current;
    if (!root || count < 2) return;

    const onStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) return;
      drag.current = {
        active: true,
        axis: null,
        startX: touch.clientX,
        startY: touch.clientY,
        dx: 0,
        width: root.offsetWidth || 1,
        swiped: false,
      };
      setDragging(true);
    };

    const onMove = (event: TouchEvent) => {
      const session = drag.current;
      const touch = event.touches[0];
      if (!session.active || !touch) return;
      const dx = touch.clientX - session.startX;
      const dy = touch.clientY - session.startY;
      if (session.axis == null && (Math.abs(dx) > AXIS_LOCK_PX || Math.abs(dy) > AXIS_LOCK_PX)) {
        session.axis = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (session.axis !== "h") return;
      event.preventDefault();
      session.dx = dx;
      session.swiped = Math.abs(dx) > 10;
      setDragX(dx);
    };

    const onEnd = () => {
      const session = drag.current;
      if (!session.active) return;
      const threshold = session.width * SWIPE_RATIO;
      if (session.axis === "h" && Math.abs(session.dx) > threshold) {
        const step = session.dx < 0 ? 1 : -1;
        setIndex((current) => (current + step + count) % count);
        haptic("light");
      }
      session.active = false;
      session.axis = null;
      session.dx = 0;
      setDragX(0);
      setDragging(false);
    };

    root.addEventListener("touchstart", onStart, { passive: true });
    root.addEventListener("touchmove", onMove, { passive: false });
    root.addEventListener("touchend", onEnd);
    root.addEventListener("touchcancel", onEnd);
    return () => {
      root.removeEventListener("touchstart", onStart);
      root.removeEventListener("touchmove", onMove);
      root.removeEventListener("touchend", onEnd);
      root.removeEventListener("touchcancel", onEnd);
    };
  }, [count]);

  if (count === 0) return null;

  const goTo = (next: number) => {
    setIndex(((next % count) + count) % count);
    haptic("light");
  };

  return (
    <div className="pt-1 pb-3">
      <div
        ref={viewportRef}
        className="relative overflow-hidden rounded-[22px] [touch-action:pan-y]"
        onClickCapture={(event) => {
          if (!drag.current.swiped) return;
          event.preventDefault();
          event.stopPropagation();
          drag.current.swiped = false;
        }}
      >
        <div
          className="flex w-full min-w-0"
          style={{
            transform: `translate3d(calc(${-index * 100}% + ${dragX}px), 0, 0)`,
            transition: dragging ? "none" : "transform 0.42s var(--ease-soft)",
          }}
        >
          {banners.map((banner, i) => {
            const inner = <PromoBannerCard banner={banner} />;
            const href = sanitizeHttpUrl(banner.href);
            const body = href ? (
              <Link
                href={href}
                onClick={() => haptic("light")}
                className="block"
                tabIndex={i === index ? 0 : -1}
              >
                {inner}
              </Link>
            ) : (
              inner
            );

            return (
              <div
                key={`${banner.id}:${banner.title}:${banner.imageUrl ?? ""}:${banner.subtitle ?? ""}`}
                className="w-full min-w-full shrink-0 basis-full"
                aria-hidden={i !== index}
              >
                {body}
              </div>
            );
          })}
        </div>
      </div>

      {count > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5">
          {banners.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Баннер ${i + 1}`}
              onClick={() => goTo(i)}
              className={cn(
                "h-1 rounded-full transition-all duration-300 ease-soft",
                i === index ? "w-4 bg-white" : "w-1.5 bg-white/35",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

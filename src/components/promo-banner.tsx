"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
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

export function PromoBannerCard({
  banner,
  className,
}: {
  banner: PromoBannerSlide;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[22px] px-4 py-3.5 ring-1 ring-inset ring-white/12",
        className,
      )}
      style={{ background: banner.background }}
    >
      {banner.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={banner.imageUrl}
          alt=""
          className="absolute inset-0 size-full object-cover opacity-35"
        />
      ) : (
        <div
          className="absolute -top-10 -right-8 size-28 rounded-full blur-2xl"
          style={{ background: banner.accent, opacity: 0.28 }}
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
          <span className="block truncate text-[14px] leading-tight font-semibold">
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

export function PromoBannerRail({ banners }: { banners: PromoBannerSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (banners.length < 2 || paused) return;
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % banners.length);
    }, INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [banners.length, paused]);

  useEffect(() => {
    if (index < banners.length) return;
    setIndex(0);
  }, [banners.length, index]);

  if (banners.length === 0) return null;

  return (
    <div
      className="pt-1 pb-3"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
    >
      <div className="relative">
        {banners.map((banner, i) => {
          const active = i === index;
          const inner = <PromoBannerCard banner={banner} />;
          const body = banner.href ? (
            <Link
              href={banner.href}
              onClick={() => haptic("light")}
              className="block"
              tabIndex={active ? 0 : -1}
            >
              {inner}
            </Link>
          ) : (
            inner
          );

          return (
            <div
              key={banner.id}
              className={cn(
                "transition-all duration-500 ease-out",
                active
                  ? "relative z-10 translate-y-0 opacity-100"
                  : "pointer-events-none absolute inset-x-0 top-0 z-0 translate-y-1 opacity-0",
              )}
              aria-hidden={!active}
            >
              {body}
            </div>
          );
        })}
      </div>

      {banners.length > 1 ? (
        <div className="mt-2 flex justify-center gap-1.5">
          {banners.map((banner, i) => (
            <button
              key={banner.id}
              type="button"
              aria-label={`Баннер ${i + 1}`}
              onClick={() => {
                haptic("light");
                setIndex(i);
              }}
              className={cn(
                "h-1 rounded-full transition-all duration-300",
                i === index ? "w-4 bg-white" : "w-1.5 bg-white/35",
              )}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

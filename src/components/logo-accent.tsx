"use client";

import {
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { accentFromImageData } from "@/lib/offer-accent";

const memory = new Map<string, string>();

function sampleLogo(image: HTMLImageElement): string | null {
  const canvas = document.createElement("canvas");
  const size = 32;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0, size, size);
  return accentFromImageData(ctx.getImageData(0, 0, size, size).data);
}

export function useLogoAccent(
  iconUrl: string | null | undefined,
  fallback: string,
): string {
  const [accent, setAccent] = useState(fallback);

  useEffect(() => {
    setAccent(fallback);
    if (!iconUrl) return;

    const cached = memory.get(iconUrl);
    if (cached) {
      setAccent(cached);
      return;
    }

    let cancelled = false;
    const image = new Image();
    image.decoding = "async";
    if (!iconUrl.startsWith("data:")) image.crossOrigin = "anonymous";
    image.onload = () => {
      const color = sampleLogo(image);
      if (color) memory.set(iconUrl, color);
      if (!cancelled) setAccent(color ?? fallback);
    };
    image.onerror = () => {
      if (!cancelled) setAccent(fallback);
    };
    image.src = iconUrl;
    return () => {
      cancelled = true;
    };
  }, [iconUrl, fallback]);

  return accent;
}

export function TintedOfferCard({
  iconUrl,
  fallback,
  className,
  children,
}: {
  iconUrl?: string | null;
  fallback: string;
  className?: string;
  children: ReactNode | ((accent: string) => ReactNode);
}) {
  const accent = useLogoAccent(iconUrl, fallback);
  return (
    <article
      className={className}
      style={{ "--offer-accent": accent } as CSSProperties}
    >
      {typeof children === "function" ? children(accent) : children}
    </article>
  );
}

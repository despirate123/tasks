"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Горизонтальные чипы с затуханием по краю.
 * Mask, а не чёрный оверлей — фон страницы просвечивает.
 */
export function ChipScroller({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ left: false, right: true });

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;

    const sync = () => {
      const max = node.scrollWidth - node.clientWidth;
      const next = {
        left: node.scrollLeft > 6,
        right: max > 6 && node.scrollLeft < max - 6,
      };
      setEdge((prev) =>
        prev.left === next.left && prev.right === next.right ? prev : next,
      );
    };

    sync();
    const active = node.querySelector<HTMLElement>("[data-chip-active='true']");
    if (active) {
      const pad = 16;
      const viewLeft = node.scrollLeft;
      const viewRight = viewLeft + node.clientWidth;
      const chipLeft = active.offsetLeft;
      const chipRight = chipLeft + active.offsetWidth;
      // Не центрируем чип по умолчанию — иначе лента уезжает
      // и «до 150 ₽» пропадает с первого экрана.
      if (chipLeft < viewLeft + pad || chipRight > viewRight - pad) {
        const left =
          chipLeft - node.clientWidth / 2 + active.offsetWidth / 2;
        node.scrollTo({ left: Math.max(0, left) });
      }
    }
    node.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, []);

  const start = edge.left ? "transparent, #000 2.75rem" : "#000";
  const end = edge.right ? "#000 calc(100% - 2.75rem), transparent" : "#000";
  const mask = `linear-gradient(to right, ${start}, ${end})`;

  return (
    <div className={cn("relative -mx-4 overflow-x-clip overflow-y-clip", className)}>
      <div
        ref={scroller}
        className="motion-chips flex gap-2 overflow-x-auto overflow-y-clip px-4 py-0.5 no-scrollbar"
        style={{
          WebkitMaskImage: mask,
          maskImage: mask,
        }}
      >
        {children}
      </div>
    </div>
  );
}

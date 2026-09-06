"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Горизонтальные чипы с затемнением по краю —
 * видно, что лента уходит «за поворот».
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
      setEdge({
        left: node.scrollLeft > 6,
        right: max > 6 && node.scrollLeft < max - 6,
      });
    };

    sync();
    node.addEventListener("scroll", sync, { passive: true });
    const observer = new ResizeObserver(sync);
    observer.observe(node);
    return () => {
      node.removeEventListener("scroll", sync);
      observer.disconnect();
    };
  }, []);

  return (
    <div className={cn("relative -mx-4", className)}>
      <div
        ref={scroller}
        className="flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar"
      >
        {children}
      </div>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 z-10 w-11 bg-gradient-to-r from-black via-black/75 to-transparent transition-opacity duration-200",
          edge.left ? "opacity-100" : "opacity-0",
        )}
      />
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 z-10 w-11 bg-gradient-to-l from-black via-black/75 to-transparent transition-opacity duration-200",
          edge.right ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}

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

  const start = edge.left ? "transparent, #000 2.75rem" : "#000";
  const end = edge.right ? "#000 calc(100% - 2.75rem), transparent" : "#000";
  const mask = `linear-gradient(to right, ${start}, ${end})`;

  return (
    <div className={cn("relative -mx-4", className)}>
      <div
        ref={scroller}
        className="motion-chips flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar"
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

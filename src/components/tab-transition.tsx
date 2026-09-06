"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { appTabIndex } from "@/lib/app-tabs";
import { cn } from "@/lib/utils";

export function TabTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const node = useRef<HTMLDivElement>(null);
  const from = appTabIndex(previousPath.current);
  const to = appTabIndex(pathname);
  const direction = from === -1 || to === -1 || to === from ? 0 : to > from ? 1 : -1;
  previousPath.current = pathname;

  useEffect(() => {
    const element = node.current;
    if (!element) return;
    for (const animation of element.getAnimations()) {
      animation.cancel();
      animation.play();
    }
  }, [pathname]);

  return (
    <div
      ref={node}
      className={cn(
        "tab-surface",
        direction > 0 && "animate-tab-next",
        direction < 0 && "animate-tab-prev",
        direction === 0 && "animate-tab-fade",
      )}
    >
      {children}
    </div>
  );
}

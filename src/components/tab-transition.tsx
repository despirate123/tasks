"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";
import { appTabIndex } from "@/lib/app-tabs";
import { cn } from "@/lib/utils";

export function TabTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const previousPath = useRef(pathname);
  const from = appTabIndex(previousPath.current);
  const to = appTabIndex(pathname);
  const direction = from === -1 || to === -1 || to === from ? 0 : to > from ? 1 : -1;
  previousPath.current = pathname;

  return (
    <div
      key={pathname}
      className={cn(
        direction > 0 && "animate-tab-next",
        direction < 0 && "animate-tab-prev",
        direction === 0 && "animate-tab-fade",
      )}
    >
      {children}
    </div>
  );
}

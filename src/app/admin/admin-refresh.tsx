"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";

/** Админка не должна показывать 30-секундный снимок страницы до сохранения. */
export function AdminRefresh() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    router.refresh();
  }, [pathname, router]);

  return null;
}

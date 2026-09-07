"use client";

import {
  forwardRef,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import {
  CATALOG_MEMORY_EVENT,
  readCatalogHref,
} from "@/lib/catalog-memory";

export function useRememberedCatalogHref() {
  const [href, setHref] = useState("/");

  useEffect(() => {
    const sync = () => setHref(readCatalogHref());
    sync();
    window.addEventListener(CATALOG_MEMORY_EVENT, sync);
    window.addEventListener("pageshow", sync);
    return () => {
      window.removeEventListener(CATALOG_MEMORY_EVENT, sync);
      window.removeEventListener("pageshow", sync);
    };
  }, []);

  return href;
}

export const CatalogHomeLink = forwardRef<
  HTMLAnchorElement,
  Omit<ComponentProps<typeof Link>, "href"> & { href?: string }
>(function CatalogHomeLink({ children, href: _ignored, ...props }, ref) {
  const href = useRememberedCatalogHref();
  return (
    <Link ref={ref} href={href} {...props}>
      {children}
    </Link>
  );
});

export function CatalogBackLink({
  children = "Все задания",
  className = "back-nav",
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <CatalogHomeLink className={className}>
      <ArrowLeft className="size-4" />
      {children}
    </CatalogHomeLink>
  );
}

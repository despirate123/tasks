"use client";

import {
  createContext,
  useCallback,
  useContext,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rememberCatalogHref } from "@/lib/catalog-memory";
import { cn } from "@/lib/utils";

type CatalogNav = {
  pending: boolean;
  navigate: (href: string) => void;
};

const CatalogNavContext = createContext<CatalogNav>({
  pending: false,
  navigate: () => {},
});

export function CatalogNavProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const navigate = useCallback(
    (href: string) => {
      rememberCatalogHref(href);
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [router],
  );

  return (
    <CatalogNavContext.Provider value={{ pending, navigate }}>
      {children}
    </CatalogNavContext.Provider>
  );
}

export function useCatalogNav() {
  return useContext(CatalogNavContext);
}

export function FilterLink({
  href,
  className,
  children,
  ...props
}: ComponentProps<typeof Link> & { href: string }) {
  const { navigate } = useCatalogNav();

  return (
    <Link
      {...props}
      href={href}
      scroll={false}
      replace
      className={className}
      onClick={(event) => {
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        event.preventDefault();
        navigate(href);
      }}
    >
      {children}
    </Link>
  );
}

export function CatalogPendingFrame({ children }: { children: ReactNode }) {
  const { pending } = useCatalogNav();
  return (
    <div
      className={cn(
        "transition-opacity duration-200 ease-soft",
        pending && "opacity-55",
      )}
    >
      {children}
    </div>
  );
}

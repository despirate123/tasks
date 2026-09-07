const STORAGE_KEY = "pb-catalog-href";
export const CATALOG_MEMORY_EVENT = "pb-catalog-memory";

export function isCatalogHref(href: string) {
  return href === "/" || href.startsWith("/?");
}

export function rememberCatalogHref(href: string) {
  if (typeof window === "undefined") return;
  if (!isCatalogHref(href)) return;
  try {
    sessionStorage.setItem(STORAGE_KEY, href);
    window.dispatchEvent(new Event(CATALOG_MEMORY_EVENT));
  } catch {
    // private mode / quota
  }
}

export function readCatalogHref() {
  if (typeof window === "undefined") return "/";
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored && isCatalogHref(stored)) return stored;
  } catch {
    // private mode
  }
  return "/";
}

"use client";

import { useEffect } from "react";

/** Снимает overflow-x: clip с html/body — иначе iOS трясёт sticky-шапку. */
export function AdminRootClass() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("is-admin");
    return () => root.classList.remove("is-admin");
  }, []);
  return null;
}

import { promises as fs } from "node:fs";
import path from "node:path";
import { accentFromSvg, accentFromTitle } from "@/lib/offer-accent";

const cache = new Map<string, { stamp: number; color: string | null }>();

function localPublicFile(iconUrl: string): string | null {
  if (!iconUrl.startsWith("/") || iconUrl.startsWith("//")) return null;
  const clean = decodeURIComponent(iconUrl.split("?")[0] ?? "");
  if (!clean || clean.includes("..")) return null;
  return path.join(process.cwd(), "public", clean);
}

export async function resolveOfferAccent(
  iconUrl: string | null | undefined,
  title: string,
): Promise<{ color: string; fromLogo: boolean }> {
  const fallback = accentFromTitle(title);
  if (!iconUrl) return { color: fallback, fromLogo: false };

  const file = localPublicFile(iconUrl);
  if (!file) return { color: fallback, fromLogo: false };

  try {
    const stat = await fs.stat(file);
    const hit = cache.get(file);
    if (hit && hit.stamp === stat.mtimeMs) {
      return hit.color
        ? { color: hit.color, fromLogo: true }
        : { color: fallback, fromLogo: false };
    }

    const buffer = await fs.readFile(file);
    const head = buffer.subarray(0, 240).toString("utf8");
    const color =
      file.endsWith(".svg") || head.includes("<svg")
        ? accentFromSvg(buffer.toString("utf8"))
        : null;

    cache.set(file, { stamp: stat.mtimeMs, color });
    return color ? { color, fromLogo: true } : { color: fallback, fromLogo: false };
  } catch {
    return { color: fallback, fromLogo: false };
  }
}

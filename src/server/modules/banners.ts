import { connection } from "next/server";
import { db } from "@/server/db";
import { requireSanitizedUrl } from "@/lib/urls";

export type PromoBannerInput = {
  title: string;
  subtitle?: string;
  href?: string;
  imageUrl?: string;
  background?: string;
  accent?: string;
  sortOrder?: number;
  isActive?: boolean;
  startsAt?: Date | null;
  endsAt?: Date | null;
};

function clean(value?: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length ? trimmed : null;
}

export type AdminBannerValues = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  imageUrl: string;
  background: string;
  accent: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
};

function toLocalInput(date: Date | null) {
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

export function parseOptionalDate(value: string | undefined | null) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Некорректная дата");
  return date;
}

export function serializeAdminBanner(banner: {
  id: string;
  title: string;
  subtitle: string | null;
  href: string | null;
  imageUrl: string | null;
  background: string;
  accent: string;
  sortOrder: number;
  isActive: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
}): AdminBannerValues {
  return {
    id: banner.id,
    title: banner.title,
    subtitle: banner.subtitle ?? "",
    href: banner.href ?? "",
    imageUrl: banner.imageUrl ?? "",
    background: banner.background,
    accent: banner.accent,
    sortOrder: banner.sortOrder,
    isActive: banner.isActive,
    startsAt: toLocalInput(banner.startsAt),
    endsAt: toLocalInput(banner.endsAt),
  };
}

/** Без Data Cache: 3 строки, а 30-секундный unstable_cache оставлял старый слайд после правки. */
export async function listActiveBanners() {
  await connection();
  const now = new Date();
  return db.promoBanner.findMany({
    where: {
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      subtitle: true,
      href: true,
      imageUrl: true,
      background: true,
      accent: true,
    },
  });
}

export async function listAdminBanners() {
  await connection();
  return db.promoBanner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export async function getBanner(id: string) {
  await connection();
  return db.promoBanner.findUnique({ where: { id } });
}

export async function upsertBanner(
  id: string | undefined,
  input: PromoBannerInput,
  createdById?: string,
) {
  const title = input.title.trim();
  if (!title) throw new Error("Укажите заголовок баннера");

  const data = {
    title,
    subtitle: clean(input.subtitle),
    href: requireSanitizedUrl(input.href, "href"),
    imageUrl: requireSanitizedUrl(input.imageUrl, "image"),
    background: input.background?.trim() || "#111111",
    accent: input.accent?.trim() || "#F7F16A",
    sortOrder: Number.isFinite(input.sortOrder) ? Number(input.sortOrder) : 0,
    isActive: input.isActive ?? true,
    startsAt: input.startsAt ?? null,
    endsAt: input.endsAt ?? null,
  };

  if (id) {
    return db.promoBanner.update({ where: { id }, data });
  }
  return db.promoBanner.create({
    data: createdById ? { ...data, createdById } : data,
  });
}

export async function toggleBanner(id: string, isActive: boolean) {
  return db.promoBanner.update({ where: { id }, data: { isActive } });
}

export async function deleteBanner(id: string) {
  return db.promoBanner.delete({ where: { id } });
}

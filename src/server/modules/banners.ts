import { db } from "@/server/db";
import { sanitizeHttpUrl } from "@/lib/urls";

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

export async function listActiveBanners() {
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
  });
}

export async function listAdminBanners() {
  return db.promoBanner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
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
    href: sanitizeHttpUrl(input.href),
    imageUrl: sanitizeHttpUrl(input.imageUrl),
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

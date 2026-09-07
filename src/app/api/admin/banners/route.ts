import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireRole } from "@/server/auth";
import {
  deleteBanner,
  getBanner,
  parseOptionalDate,
  serializeAdminBanner,
  toggleBanner,
  upsertBanner,
} from "@/server/modules/banners";

export const dynamic = "force-dynamic";

type BannerBody = {
  id?: string;
  title?: string;
  subtitle?: string;
  href?: string;
  imageUrl?: string;
  background?: string;
  accent?: string;
  sortOrder?: number;
  isActive?: boolean;
  startsAt?: string;
  endsAt?: string;
};

function fail(error: unknown, status = 400) {
  const message =
    error instanceof Error
      ? error.message === "UNAUTHORIZED"
        ? "Нужно войти заново"
        : error.message === "FORBIDDEN"
          ? "Недостаточно прав"
          : error.message === "USER_BLOCKED"
            ? "Аккаунт заблокирован"
            : error.message
      : "Не удалось сохранить баннер";
  const code =
    message === "Нужно войти заново"
      ? 401
      : message === "Недостаточно прав" || message === "Аккаунт заблокирован"
        ? 403
        : status;
  return NextResponse.json({ ok: false, error: message }, { status: code });
}

function noStore(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function bumpPaths() {
  revalidatePath("/");
  revalidatePath("/admin/banners");
}

export async function POST(request: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const body = (await request.json()) as BannerBody;
    const id = body.id?.trim() || undefined;
    const saved = await upsertBanner(
      id,
      {
        title: String(body.title ?? ""),
        subtitle: String(body.subtitle ?? ""),
        href: String(body.href ?? ""),
        imageUrl: String(body.imageUrl ?? ""),
        background: String(body.background ?? "#111111"),
        accent: String(body.accent ?? "#F7F16A"),
        sortOrder: Number(body.sortOrder ?? 0),
        isActive: body.isActive ?? true,
        startsAt: parseOptionalDate(body.startsAt),
        endsAt: parseOptionalDate(body.endsAt),
      },
      admin.id,
    );
    const verify = await getBanner(saved.id);
    if (!verify || verify.title !== saved.title) {
      return noStore(
        { ok: false, error: "Заголовок не записался в базу. Попробуйте ещё раз." },
        500,
      );
    }
    bumpPaths();
    return noStore({
      ok: true,
      message: `Сохранено: «${verify.title}»`,
      banner: serializeAdminBanner(verify),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function PATCH(request: Request) {
  try {
    await requireRole("ADMIN");
    const body = (await request.json()) as BannerBody;
    const id = body.id?.trim();
    if (!id) return noStore({ ok: false, error: "Нет id баннера" }, 400);
    const saved = await toggleBanner(id, Boolean(body.isActive));
    const verify = await getBanner(saved.id);
    if (!verify) return noStore({ ok: false, error: "Баннер не найден" }, 404);
    bumpPaths();
    return noStore({
      ok: true,
      message: verify.isActive ? "Баннер включён" : "Баннер скрыт",
      banner: serializeAdminBanner(verify),
    });
  } catch (error) {
    return fail(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireRole("ADMIN");
    const body = (await request.json()) as BannerBody;
    const id = body.id?.trim();
    if (!id) return noStore({ ok: false, error: "Нет id баннера" }, 400);
    await deleteBanner(id);
    const leftover = await getBanner(id);
    if (leftover) {
      return noStore({ ok: false, error: "Баннер не удалился" }, 500);
    }
    bumpPaths();
    return noStore({ ok: true, message: "Баннер удалён" });
  } catch (error) {
    return fail(error);
  }
}

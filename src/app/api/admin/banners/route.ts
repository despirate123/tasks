import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireRole } from "@/server/auth";
import { sanitizeHttpUrl } from "@/lib/urls";
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
  _action?: string;
  id?: string;
  title?: string;
  subtitle?: string;
  href?: string;
  imageUrl?: string;
  background?: string;
  accent?: string;
  sortOrder?: number | string;
  isActive?: boolean | string;
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

function flagOn(value: BannerBody["isActive"]) {
  return value === true || value === "on" || value === "true" || value === "1";
}

async function readBody(request: Request): Promise<{ body: BannerBody; viaForm: boolean }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return { body: (await request.json()) as BannerBody, viaForm: false };
  }
  const form = await request.formData();
  const body: BannerBody = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") body[key as keyof BannerBody] = value as never;
  }
  return { body, viaForm: true };
}

function adminRedirect(request: Request, title?: string) {
  const url = new URL("/admin/banners", request.url);
  url.searchParams.set("saved", "1");
  if (title) url.searchParams.set("title", title);
  return NextResponse.redirect(url, 303);
}

export async function POST(request: Request) {
  try {
    const admin = await requireRole("ADMIN");
    const { body, viaForm } = await readBody(request);
    const action = String(body._action ?? "save");
    const id = String(body.id ?? "").trim() || undefined;

    if (action === "delete") {
      if (!id) return noStore({ ok: false, error: "Нет id баннера" }, 400);
      await deleteBanner(id);
      bumpPaths();
      if (viaForm) return adminRedirect(request);
      return noStore({ ok: true, message: "Баннер удалён" });
    }

    if (action === "toggle") {
      if (!id) return noStore({ ok: false, error: "Нет id баннера" }, 400);
      const current = await getBanner(id);
      if (!current) return noStore({ ok: false, error: "Баннер не найден" }, 404);
      const saved = await toggleBanner(id, !current.isActive);
      const verify = await getBanner(saved.id);
      if (!verify) return noStore({ ok: false, error: "Баннер не найден" }, 404);
      bumpPaths();
      if (viaForm) return adminRedirect(request, verify.title);
      return noStore({
        ok: true,
        message: verify.isActive ? "Баннер включён" : "Баннер скрыт",
        banner: serializeAdminBanner(verify),
      });
    }

    const rawHref = String(body.href ?? "");
    const rawImage = String(body.imageUrl ?? "");
    const warnings: string[] = [];
    if (rawHref.trim() && !sanitizeHttpUrl(rawHref)) {
      warnings.push("Ссылка сброшена — нужен путь /referrals или https://");
    }
    if (rawImage.trim() && !sanitizeHttpUrl(rawImage)) {
      warnings.push("Картинка сброшена — нужна прямая http(s)-ссылка");
    }

    const saved = await upsertBanner(
      id,
      {
        title: String(body.title ?? ""),
        subtitle: String(body.subtitle ?? ""),
        href: rawHref,
        imageUrl: rawImage,
        background: String(body.background ?? "#111111"),
        accent: String(body.accent ?? "#F7F16A"),
        sortOrder: Number(body.sortOrder ?? 0),
        isActive: viaForm
          ? flagOn(body.isActive)
          : body.isActive === undefined
            ? true
            : flagOn(body.isActive),
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
    const message = [
      `Сохранено: «${verify.title}»`,
      ...warnings,
    ].join(". ");
    if (viaForm) return adminRedirect(request, verify.title);
    return noStore({
      ok: true,
      message,
      warnings,
      banner: serializeAdminBanner(verify),
    });
  } catch (error) {
    return fail(error);
  }
}

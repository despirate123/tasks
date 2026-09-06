import { Megaphone } from "lucide-react";
import { hasRole, requireRole } from "@/server/auth";
import { listAdminBanners } from "@/server/modules/banners";
import { EmptyState } from "@/components/ui/misc";
import { BannerEditor, type BannerEditorValues } from "./banner-editor";

function toLocalInput(date: Date | null) {
  if (!date) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function toValues(banner: Awaited<ReturnType<typeof listAdminBanners>>[number]): BannerEditorValues {
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

export default async function AdminBannersPage() {
  const actor = await requireRole("MODERATOR");
  if (!hasRole(actor, "ADMIN")) {
    return (
      <EmptyState
        title="Нужны права администратора"
        description="Баннеры может менять только ADMIN или OWNER. Модератору эта страница недоступна."
      />
    );
  }
  const banners = await listAdminBanners();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[24px] leading-tight font-bold">Баннеры</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-content-secondary">
          Карусель под аватаром в Mini App. Слайды меняются каждые 5 секунд.
          Здесь можно добавить объявление, акцию или ссылку на раздел.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold">Новый баннер</h2>
        <BannerEditor mode="create" />
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <Megaphone className="size-4 text-brand-300" />
          Опубликованные
          <span className="text-[12px] font-medium text-content-muted">{banners.length}</span>
        </h2>
        {banners.length === 0 ? (
          <EmptyState
            title="Баннеров ещё нет"
            description="Добавьте первый слайд — он сразу появится в шапке приложения."
          />
        ) : (
          <div className="space-y-3">
            {banners.map((banner) => (
              <BannerEditor key={banner.id} mode="edit" initial={toValues(banner)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

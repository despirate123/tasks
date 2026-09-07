import { Megaphone } from "lucide-react";
import { hasRole, requireRole } from "@/server/auth";
import { listAdminBanners, serializeAdminBanner } from "@/server/modules/banners";
import { EmptyState } from "@/components/ui/misc";
import { BannerEditor } from "./banner-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

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
    <div className="motion-page space-y-6">
      <div>
        <h1 className="text-[24px] leading-tight font-bold">Баннеры</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-content-secondary">
          Карусель под аватаром. Слайд 1 виден сразу, остальные — свайпом
          или через 5 секунд. Сохранение пишет в базу; главная подтягивает
          новый текст сама, без перезапуска.
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
            {banners.map((banner, index) => (
              <BannerEditor
                key={banner.id}
                mode="edit"
                slide={index + 1}
                initial={serializeAdminBanner(banner)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

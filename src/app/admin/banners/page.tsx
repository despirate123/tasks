import { Megaphone } from "lucide-react";
import { hasRole, requireRole } from "@/server/auth";
import { listAdminBanners, serializeAdminBanner } from "@/server/modules/banners";
import { EmptyState } from "@/components/ui/misc";
import { BannerEditor } from "./banner-editor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParams = Promise<{ saved?: string | string[]; title?: string | string[] }>;

function firstParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminBannersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const actor = await requireRole("MODERATOR");
  if (!hasRole(actor, "ADMIN")) {
    return (
      <EmptyState
        title="Нужны права администратора"
        description="Баннеры может менять только ADMIN или OWNER. Модератору эта страница недоступна."
      />
    );
  }
  const params = await searchParams;
  const saved = firstParam(params.saved) === "1";
  const savedTitle = firstParam(params.title)?.trim();
  const banners = await listAdminBanners();

  return (
    <div className="motion-page space-y-6">
      <div>
        <h1 className="text-[24px] leading-tight font-bold">Баннеры</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-content-secondary">
          Карусель под аватаром в Mini App. Слайды меняются каждые 5 секунд —
          если правите второй или третий, на главной сначала виден первый.
          После сохранения страница перечитывает базу, не кэш.
        </p>
        {saved ? (
          <p className="mt-2 text-[13px] font-medium text-brand-300">
            {savedTitle ? `Записано в базу: «${savedTitle}»` : "Изменение записано в базу"}
          </p>
        ) : null}
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
              <BannerEditor
                key={`${banner.id}:${banner.updatedAt.toISOString()}`}
                mode="edit"
                initial={serializeAdminBanner(banner)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

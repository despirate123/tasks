"use client";

import { useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { PromoBannerCard, type PromoBannerSlide } from "@/components/promo-banner";
import { sanitizeHttpUrl } from "@/lib/urls";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";

export type BannerEditorValues = PromoBannerSlide & {
  sortOrder: number;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
};

function emptyValues(): BannerEditorValues {
  return {
    id: "",
    title: "",
    subtitle: "",
    href: "",
    imageUrl: "",
    background: "#111111",
    accent: "#F7F16A",
    sortOrder: 0,
    isActive: true,
    startsAt: "",
    endsAt: "",
  };
}

export function BannerEditor({
  initial,
  mode,
  slide,
}: {
  initial?: BannerEditorValues;
  mode: "create" | "edit";
  slide?: number;
}) {
  const [values, setValues] = useState<BannerEditorValues>(initial ?? emptyValues());
  const [pending, setPending] = useState(false);

  const set =
    (key: keyof BannerEditorValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value =
        event.target.type === "checkbox"
          ? (event.target as HTMLInputElement).checked
          : event.target.type === "number"
            ? Number(event.target.value)
            : event.target.value;
      setValues((current) => ({ ...current, [key]: value }));
    };

  const hrefHint =
    (values.href ?? "").trim() && !sanitizeHttpUrl(values.href)
      ? "Неверный формат — при сохранении ссылка сбросится"
      : undefined;
  const imageHint =
    (values.imageUrl ?? "").trim() && !sanitizeHttpUrl(values.imageUrl)
      ? "Неверный формат — при сохранении картинка сбросится"
      : undefined;

  return (
    <Card className="space-y-4 p-4">
      {slide != null ? (
        <p className="text-[12px] font-medium text-content-muted">
          Слайд {slide}
          {slide === 1 ? " · его первым видно на главной" : " · свайп или автосмена каждые 5 сек"}
        </p>
      ) : null}
      <PromoBannerCard
        banner={{
          id: values.id || "preview",
          title: values.title || "Заголовок баннера",
          subtitle: values.subtitle || "Короткий текст объявления",
          href: values.href,
          imageUrl: values.imageUrl,
          background: values.background || "#111111",
          accent: values.accent || "#F7F16A",
        }}
      />

      <form
        action="/api/admin/banners"
        method="post"
        className="grid gap-3 md:grid-cols-2"
        onSubmit={() => setPending(true)}
      >
        <input type="hidden" name="_action" value="save" />
        {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

        <Field label="Заголовок" className="md:col-span-2">
          <Input
            name="title"
            value={values.title}
            onChange={set("title")}
            placeholder="Приведи друга — получай 10% с его прибыли"
          />
        </Field>
        <Field label="Текст" className="md:col-span-2">
          <Textarea
            name="subtitle"
            value={values.subtitle ?? ""}
            onChange={set("subtitle")}
            placeholder="Коротко, что изменилось или куда нажать"
          />
        </Field>
        <Field
          label="Ссылка"
          hint={hrefHint ?? "Внутренний путь (/referrals) или https://"}
          error={hrefHint}
        >
          <Input
            name="href"
            value={values.href ?? ""}
            onChange={set("href")}
            placeholder="/referrals"
          />
        </Field>
        <Field
          label="Картинка (URL)"
          hint={imageHint ?? "Только прямая http(s)-ссылка"}
          error={imageHint}
        >
          <Input
            name="imageUrl"
            value={values.imageUrl ?? ""}
            onChange={set("imageUrl")}
            placeholder="https://..."
          />
        </Field>
        <Field label="Фон">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(values.background) ? values.background : "#111111"}
              onChange={set("background")}
              className="size-11 shrink-0 cursor-pointer rounded-2xl border-0 bg-transparent"
            />
            <Input name="background" value={values.background} onChange={set("background")} />
          </div>
        </Field>
        <Field label="Акцент">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(values.accent) ? values.accent : "#F7F16A"}
              onChange={set("accent")}
              className="size-11 shrink-0 cursor-pointer rounded-2xl border-0 bg-transparent"
            />
            <Input name="accent" value={values.accent} onChange={set("accent")} />
          </div>
        </Field>
        <Field label="Порядок">
          <Input
            type="number"
            name="sortOrder"
            value={values.sortOrder}
            onChange={set("sortOrder")}
          />
        </Field>
        <Field label="Показ">
          <label className="flex h-11 items-center gap-2 rounded-2xl glass-thin px-3.5 text-sm ring-1 ring-inset ring-white/12">
            <input
              type="checkbox"
              name="isActive"
              value="on"
              checked={values.isActive}
              onChange={set("isActive")}
              className="size-4 accent-[var(--acid)]"
            />
            Активен в приложении
          </label>
        </Field>
        <Field label="С" hint="Пусто — сразу">
          <Input
            type="datetime-local"
            name="startsAt"
            value={values.startsAt}
            onChange={set("startsAt")}
          />
        </Field>
        <Field label="По" hint="Пусто — бессрочно">
          <Input
            type="datetime-local"
            name="endsAt"
            value={values.endsAt}
            onChange={set("endsAt")}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2 md:col-span-2">
          <Button type="submit" disabled={pending || !values.title.trim()}>
            {pending ? <Loader2 className="animate-spin" /> : null}
            {mode === "create" ? "Добавить баннер" : "Сохранить"}
          </Button>
        </div>
      </form>

      {mode === "edit" && values.id ? (
        <div className="flex flex-wrap items-center gap-2">
          <form action="/api/admin/banners" method="post">
            <input type="hidden" name="_action" value="toggle" />
            <input type="hidden" name="id" value={values.id} />
            <Button type="submit" variant="secondary">
              {values.isActive ? "Скрыть" : "Показать"}
            </Button>
          </form>
          <form
            action="/api/admin/banners"
            method="post"
            onSubmit={(event) => {
              if (!window.confirm("Удалить этот баннер?")) event.preventDefault();
            }}
          >
            <input type="hidden" name="_action" value="delete" />
            <input type="hidden" name="id" value={values.id} />
            <Button type="submit" variant="danger">
              <Trash2 />
              Удалить
            </Button>
          </form>
        </div>
      ) : null}
    </Card>
  );
}

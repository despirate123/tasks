"use client";

import { useState, useTransition } from "react";
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

type SaveResult =
  | { ok: true; message?: string; banner?: BannerEditorValues }
  | { ok: false; error: string };

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

async function bannerRequest(
  method: "POST" | "PATCH" | "DELETE",
  body: Record<string, unknown>,
): Promise<SaveResult> {
  const res = await fetch("/api/admin/banners", {
    method,
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as SaveResult | null;
  if (!data) return { ok: false, error: "Сервер не ответил" };
  return data;
}

function reloadBanners(title?: string) {
  const params = new URLSearchParams({ saved: "1" });
  if (title) params.set("title", title);
  window.location.assign(`/admin/banners?${params.toString()}`);
}

export function BannerEditor({
  initial,
  mode,
}: {
  initial?: BannerEditorValues;
  mode: "create" | "edit";
}) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<BannerEditorValues>(initial ?? emptyValues());
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

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

  const run = (fn: () => Promise<SaveResult>, after?: (result: SaveResult) => void) => {
    startTransition(async () => {
      const result = await fn();
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Готово") : (result.error ?? "Ошибка"),
      });
      if (!result.ok) return;
      after?.(result);
    });
  };

  const hrefError =
    (values.href ?? "").trim() && !sanitizeHttpUrl(values.href)
      ? "Нужен путь вроде /referrals или адрес https://"
      : undefined;
  const imageError =
    (values.imageUrl ?? "").trim() && !sanitizeHttpUrl(values.imageUrl)
      ? "Нужна прямая ссылка http:// или https:// на изображение"
      : undefined;

  const save = () => {
    run(
      () =>
        bannerRequest("POST", {
          id: values.id || undefined,
          title: values.title,
          subtitle: values.subtitle ?? "",
          href: values.href ?? "",
          imageUrl: values.imageUrl ?? "",
          background: values.background,
          accent: values.accent,
          sortOrder: values.sortOrder,
          isActive: values.isActive,
          startsAt: values.startsAt,
          endsAt: values.endsAt,
        }),
      (result) => {
        if (result.ok && result.banner) setValues(result.banner);
        reloadBanners(result.ok ? result.banner?.title ?? values.title : undefined);
      },
    );
  };

  return (
    <Card className="space-y-4 p-4">
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

      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Заголовок" className="md:col-span-2">
          <Input
            value={values.title}
            onChange={set("title")}
            placeholder="Новые задания каждый день"
          />
        </Field>
        <Field label="Текст" className="md:col-span-2">
          <Textarea
            value={values.subtitle ?? ""}
            onChange={set("subtitle")}
            placeholder="Коротко, что изменилось или куда нажать"
          />
        </Field>
        <Field
          label="Ссылка"
          hint="Внутренний путь (/referrals) или https://"
          error={hrefError}
        >
          <Input
            value={values.href ?? ""}
            onChange={set("href")}
            placeholder="/referrals"
          />
        </Field>
        <Field
          label="Картинка (URL)"
          hint="Только прямая http(s)-ссылка. Файл из Telegram или проводника Windows не подойдёт."
          error={imageError}
        >
          <Input
            value={values.imageUrl ?? ""}
            onChange={set("imageUrl")}
            placeholder="https://..."
          />
        </Field>
        <Field label="Фон">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={values.background}
              onChange={set("background")}
              className="size-11 shrink-0 cursor-pointer rounded-2xl border-0 bg-transparent"
            />
            <Input value={values.background} onChange={set("background")} />
          </div>
        </Field>
        <Field label="Акцент">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={values.accent}
              onChange={set("accent")}
              className="size-11 shrink-0 cursor-pointer rounded-2xl border-0 bg-transparent"
            />
            <Input value={values.accent} onChange={set("accent")} />
          </div>
        </Field>
        <Field label="Порядок">
          <Input
            type="number"
            value={values.sortOrder}
            onChange={set("sortOrder")}
          />
        </Field>
        <Field label="Показ">
          <label className="flex h-11 items-center gap-2 rounded-2xl glass-thin px-3.5 text-sm ring-1 ring-inset ring-white/12">
            <input
              type="checkbox"
              checked={values.isActive}
              onChange={set("isActive")}
              className="size-4 accent-[var(--acid)]"
            />
            Активен в приложении
          </label>
        </Field>
        <Field label="С" hint="Пусто — сразу">
          <Input type="datetime-local" value={values.startsAt} onChange={set("startsAt")} />
        </Field>
        <Field label="По" hint="Пусто — бессрочно">
          <Input type="datetime-local" value={values.endsAt} onChange={set("endsAt")} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={save}
          disabled={pending || !values.title.trim() || Boolean(hrefError || imageError)}
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === "create" ? "Добавить баннер" : "Сохранить"}
        </Button>
        {mode === "edit" ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    bannerRequest("PATCH", {
                      id: values.id,
                      isActive: !values.isActive,
                    }),
                  (result) => reloadBanners(result.ok ? result.banner?.title : undefined),
                )
              }
            >
              {values.isActive ? "Скрыть" : "Показать"}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Удалить этот баннер?")) return;
                run(
                  () => bannerRequest("DELETE", { id: values.id }),
                  () => reloadBanners(),
                );
              }}
            >
              <Trash2 />
              Удалить
            </Button>
          </>
        ) : null}
        {feedback ? (
          <p
            className={
              feedback.ok ? "text-[12.5px] text-brand-300" : "text-[12.5px] text-hard"
            }
          >
            {feedback.text}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

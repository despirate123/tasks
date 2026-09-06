"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import {
  deleteBannerAction,
  toggleBannerAction,
  upsertBannerAction,
} from "@/server/actions";
import { PromoBannerCard, type PromoBannerSlide } from "@/components/promo-banner";
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
    accent: "#EF7A7C",
    sortOrder: 0,
    isActive: true,
    startsAt: "",
    endsAt: "",
  };
}

export function BannerEditor({
  initial,
  mode,
}: {
  initial?: BannerEditorValues;
  mode: "create" | "edit";
}) {
  const router = useRouter();
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

  const run = (fn: () => Promise<{ ok: boolean; message?: string; error?: string }>) => {
    startTransition(async () => {
      const result = await fn();
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Готово") : (result.error ?? "Ошибка"),
      });
      if (result.ok && mode === "create") {
        setValues(emptyValues());
      }
      setTimeout(() => setFeedback(null), 3500);
      router.refresh();
    });
  };

  const save = () => {
    const data = new FormData();
    if (values.id) data.set("id", values.id);
    data.set("title", values.title);
    data.set("subtitle", values.subtitle ?? "");
    data.set("href", values.href ?? "");
    data.set("imageUrl", values.imageUrl ?? "");
    data.set("background", values.background);
    data.set("accent", values.accent);
    data.set("sortOrder", String(values.sortOrder));
    if (values.isActive) data.set("isActive", "on");
    data.set("startsAt", values.startsAt);
    data.set("endsAt", values.endsAt);
    run(() => upsertBannerAction(data));
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
          accent: values.accent || "#EF7A7C",
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
        <Field label="Ссылка" hint="Внутренний путь (/referrals) или https://">
          <Input
            value={values.href ?? ""}
            onChange={set("href")}
            placeholder="/referrals"
          />
        </Field>
        <Field label="Картинка (URL)">
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
        <Button type="button" onClick={save} disabled={pending || !values.title.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {mode === "create" ? "Добавить баннер" : "Сохранить"}
        </Button>
        {mode === "edit" ? (
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => toggleBannerAction(values.id, !values.isActive))}
            >
              {values.isActive ? "Скрыть" : "Показать"}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={pending}
              onClick={() => {
                if (!window.confirm("Удалить этот баннер?")) return;
                run(() => deleteBannerAction(values.id));
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
              feedback.ok ? "text-[12.5px] text-money-400" : "text-[12.5px] text-hard"
            }
          >
            {feedback.text}
          </p>
        ) : null}
      </div>
    </Card>
  );
}

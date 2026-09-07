"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Difficulty, OfferStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { DIFFICULTY, DIFFICULTY_ORDER } from "@/lib/labels";
import { saveOfferAction } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SectionTitle } from "@/components/ui/misc";

export type OfferEditorValues = {
  title: string;
  subtitle: string;
  brandName: string;
  description: string;
  iconUrl: string;
  categoryId: string;
  rewardAmount: string;
  holdHours: string;
  difficulty: Difficulty;
  approvalEtaMinutes: string;
  requirePhoto: boolean;
  requireVideo: boolean;
  requireComment: boolean;
  minPhotos: string;
  maxPhotos: string;
  proofHint: string;
  completionTtlMins: string;
  perUserLimit: string;
  totalLimit: string;
  dailyLimit: string;
  newUsersOnly: boolean;
  trackingUrl: string;
  promoCode: string;
  isFeatured: boolean;
  isHot: boolean;
  publishNow: boolean;
  steps: { title: string; description: string }[];
};

export function emptyOfferValues(): OfferEditorValues {
  return {
    title: "",
    subtitle: "",
    brandName: "",
    description: "",
    iconUrl: "",
    categoryId: "",
    rewardAmount: "150",
    holdHours: "0",
    difficulty: "MEDIUM",
    approvalEtaMinutes: "1440",
    requirePhoto: true,
    requireVideo: false,
    requireComment: true,
    minPhotos: "1",
    maxPhotos: "5",
    proofHint: "",
    completionTtlMins: "1440",
    perUserLimit: "1",
    totalLimit: "",
    dailyLimit: "",
    newUsersOnly: false,
    trackingUrl: "",
    promoCode: "",
    isFeatured: false,
    isHot: false,
    publishNow: false,
    steps: [{ title: "", description: "" }],
  };
}

function toInput(values: OfferEditorValues, status?: OfferStatus) {
  return {
    title: values.title,
    subtitle: values.subtitle,
    description: values.description,
    brandName: values.brandName,
    iconUrl: values.iconUrl,
    categoryId: values.categoryId || undefined,
    rewardAmount: Number(values.rewardAmount),
    holdHours: Number(values.holdHours) || 0,
    difficulty: values.difficulty,
    approvalEtaMinutes: Number(values.approvalEtaMinutes) || 1440,
    requirePhoto: values.requirePhoto,
    requireVideo: values.requireVideo,
    requireComment: values.requireComment,
    minPhotos: Number(values.minPhotos) || 1,
    maxPhotos: Number(values.maxPhotos) || 5,
    proofHint: values.proofHint,
    completionTtlMins: Number(values.completionTtlMins) || 1440,
    perUserLimit: Number(values.perUserLimit) || 1,
    totalLimit: values.totalLimit ? Number(values.totalLimit) : null,
    dailyLimit: values.dailyLimit ? Number(values.dailyLimit) : null,
    newUsersOnly: values.newUsersOnly,
    trackingUrl: values.trackingUrl,
    promoCode: values.promoCode,
    isFeatured: values.isFeatured,
    isHot: values.isHot,
    status,
    steps: values.steps,
  };
}

export function OfferEditor({
  offerId,
  categories,
  initial,
}: {
  offerId?: string;
  categories: { id: string; name: string }[];
  initial?: OfferEditorValues;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState<OfferEditorValues>(initial ?? emptyOfferValues());
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const set =
    (key: keyof OfferEditorValues) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      const target = event.target;
      const value =
        target instanceof HTMLInputElement && target.type === "checkbox"
          ? target.checked
          : target.value;
      setValues((current) => ({ ...current, [key]: value }));
    };

  const setStep = (index: number, key: "title" | "description", value: string) => {
    setValues((current) => ({
      ...current,
      steps: current.steps.map((step, i) => (i === index ? { ...step, [key]: value } : step)),
    }));
  };

  const save = () => {
    startTransition(async () => {
      const result = await saveOfferAction(
        offerId,
        toInput(values, offerId ? undefined : values.publishNow ? "ACTIVE" : "DRAFT"),
      );
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? "Готово") : (result.error ?? "Ошибка"),
      });
      if (result.ok && result.offerId) {
        router.push(`/admin/offers/${result.offerId}`);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-5">
      <Card className="space-y-4 p-4">
        <SectionTitle>Карточка</SectionTitle>
        <Field label="Название">
          <Input value={values.title} onChange={set("title")} placeholder="Установить приложение и зарегистрироваться" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Бренд">
            <Input value={values.brandName} onChange={set("brandName")} placeholder="Яндекс Еда" />
          </Field>
          <Field label="Категория">
            <select
              value={values.categoryId}
              onChange={set("categoryId")}
              className="clip-frame clip-soft h-11 w-full rounded-2xl glass-thin px-3.5 text-sm ring-1 ring-inset ring-white/12"
            >
              <option value="">Без категории</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Короткий подзаголовок" hint="Одна строка на карточке, если нужна.">
          <Input value={values.subtitle} onChange={set("subtitle")} />
        </Field>
        <Field label="Что нужно сделать">
          <Textarea
            value={values.description}
            onChange={set("description")}
            className="min-h-32"
            placeholder="По шагам: скачать, зарегистрироваться, сделать заказ, прислать скрин."
          />
        </Field>
        <Field label="Иконка, URL" hint="Необязательно. http или https.">
          <Input value={values.iconUrl} onChange={set("iconUrl")} placeholder="https://..." />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionTitle>Деньги и сроки</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Вознаграждение, ₽">
            <Input
              inputMode="decimal"
              value={values.rewardAmount}
              onChange={set("rewardAmount")}
              className="tabular"
            />
          </Field>
          <Field label="Холд, часов" hint="0 — сразу на баланс после одобрения.">
            <Input inputMode="numeric" value={values.holdHours} onChange={set("holdHours")} className="tabular" />
          </Field>
          <Field label="Срок на выполнение, мин">
            <Input
              inputMode="numeric"
              value={values.completionTtlMins}
              onChange={set("completionTtlMins")}
              className="tabular"
            />
          </Field>
        </div>
        <Field label="Сложность">
          <div className="flex flex-wrap gap-2">
            {DIFFICULTY_ORDER.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setValues((current) => ({ ...current, difficulty: value }))}
                className={cn(
                  "rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset",
                  values.difficulty === value
                    ? DIFFICULTY[value].className
                    : "bg-surface-input text-content-secondary ring-border-strong",
                )}
              >
                {DIFFICULTY[value].label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Заявленное время одобрения, мин">
          <Input
            inputMode="numeric"
            value={values.approvalEtaMinutes}
            onChange={set("approvalEtaMinutes")}
            className="tabular"
          />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionTitle>Доказательства</SectionTitle>
        <div className="flex flex-wrap gap-3 text-[13px]">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={values.requirePhoto} onChange={set("requirePhoto")} />
            Фото
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={values.requireVideo} onChange={set("requireVideo")} />
            Видео
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={values.requireComment} onChange={set("requireComment")} />
            Комментарий
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Минимум фото">
            <Input inputMode="numeric" value={values.minPhotos} onChange={set("minPhotos")} />
          </Field>
          <Field label="Максимум фото">
            <Input inputMode="numeric" value={values.maxPhotos} onChange={set("maxPhotos")} />
          </Field>
        </div>
        <Field label="Подсказка к пруфам">
          <Textarea value={values.proofHint} onChange={set("proofHint")} />
        </Field>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionTitle>Шаги</SectionTitle>
        <div className="space-y-3">
          {values.steps.map((step, index) => (
            <div key={index} className="space-y-2 rounded-2xl bg-surface-overlay/50 p-3 ring-1 ring-inset ring-border-subtle">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[12px] text-content-muted">Шаг {index + 1}</p>
                {values.steps.length > 1 ? (
                  <button
                    type="button"
                    className="text-content-muted"
                    onClick={() =>
                      setValues((current) => ({
                        ...current,
                        steps: current.steps.filter((_, i) => i !== index),
                      }))
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </div>
              <Input
                value={step.title}
                onChange={(event) => setStep(index, "title", event.target.value)}
                placeholder="Что сделать"
              />
              <Textarea
                value={step.description}
                onChange={(event) => setStep(index, "description", event.target.value)}
                placeholder="Как именно, если нужно пояснение"
              />
            </div>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() =>
            setValues((current) => ({
              ...current,
              steps: [...current.steps, { title: "", description: "" }],
            }))
          }
        >
          <Plus className="size-4" />
          Ещё шаг
        </Button>
      </Card>

      <Card className="space-y-4 p-4">
        <SectionTitle>Ссылка, лимиты, витрина</SectionTitle>
        <Field label="Трекинговая ссылка">
          <Input value={values.trackingUrl} onChange={set("trackingUrl")} placeholder="https://..." />
        </Field>
        <Field label="Промокод">
          <Input value={values.promoCode} onChange={set("promoCode")} className="uppercase" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="На одного человека">
            <Input inputMode="numeric" value={values.perUserLimit} onChange={set("perUserLimit")} />
          </Field>
          <Field label="Общий лимит" hint="Пусто — без лимита.">
            <Input inputMode="numeric" value={values.totalLimit} onChange={set("totalLimit")} />
          </Field>
          <Field label="В сутки" hint="Пусто — без лимита.">
            <Input inputMode="numeric" value={values.dailyLimit} onChange={set("dailyLimit")} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-[13px]">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={values.newUsersOnly} onChange={set("newUsersOnly")} />
            Только новички
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={values.isFeatured} onChange={set("isFeatured")} />
            Топ
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={values.isHot} onChange={set("isHot")} />
            Хит
          </label>
          {!offerId ? (
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={values.publishNow} onChange={set("publishNow")} />
              Сразу опубликовать
            </label>
          ) : null}
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={save} disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {offerId ? "Сохранить задание" : "Создать задание"}
        </Button>
        {feedback ? (
          <p className={cn("text-[13px]", feedback.ok ? "text-brand-300" : "text-hard")}>
            {feedback.text}
          </p>
        ) : null}
      </div>
    </div>
  );
}

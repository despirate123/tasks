import { CopyValue } from "@/components/copy-value";
import {
  resolveTrackingUrl,
  trackingHasPlaceholder,
} from "@/lib/tracking-url";

export function OfferLinksBlock({
  promoCode,
  trackingUrl,
  clickId,
}: {
  promoCode?: string | null;
  trackingUrl?: string | null;
  clickId?: string | null;
}) {
  const uniqueUrl =
    trackingUrl && clickId ? resolveTrackingUrl(trackingUrl, clickId) : null;
  const rawUrl =
    trackingUrl && !clickId && !trackingHasPlaceholder(trackingUrl)
      ? trackingUrl
      : null;

  if (!promoCode && !uniqueUrl && !rawUrl && !trackingUrl) return null;

  return (
    <div className="space-y-2.5">
      {promoCode ? (
        <CopyValue
          label="Промокод"
          value={promoCode}
          hint="Вставьте при регистрации или заказе — без кода зачёт могут не принять."
        />
      ) : null}

      {uniqueUrl ? (
        <CopyValue
          label="Ваша уникальная ссылка"
          value={uniqueUrl}
          href={uniqueUrl}
          hint="Переход только по ней. Иначе сеть не засчитает выполнение."
          mono
        />
      ) : trackingUrl && !clickId ? (
        rawUrl ? (
          <CopyValue
            label="Ссылка задания"
            value={rawUrl}
            href={rawUrl}
            hint="После того как возьмёте задание, здесь появится ваша уникальная ссылка с личным кодом."
            mono
          />
        ) : (
          <div className="rounded-2xl bg-surface-overlay p-3 ring-1 ring-inset ring-border-subtle">
            <p className="text-[11px] text-content-muted">Уникальная ссылка</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-content-secondary">
              Появится сразу после того, как возьмёте задание. Переход только по
              ней — иначе зачёт у рекламодателя не пройдёт.
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}

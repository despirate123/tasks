import Link from "next/link";
import { Clock, Pencil } from "lucide-react";
import { listAdminOffers } from "@/server/modules/offers";
import { formatEta, formatMoney, formatPercent } from "@/lib/format";
import { VALUE_SOURCE } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { DifficultyBadge, OfferAvatar } from "@/components/domain";
import { cn } from "@/lib/utils";

const STATUS_TONE = {
  ACTIVE: "money",
  DRAFT: "neutral",
  PAUSED: "warn",
  ARCHIVED: "neutral",
} as const;

const STATUS_LABEL = {
  ACTIVE: "Активен",
  DRAFT: "Черновик",
  PAUSED: "Пауза",
  ARCHIVED: "Архив",
} as const;

export default async function AdminOffersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const offers = await listAdminOffers({
    status: params.status as "ACTIVE" | "DRAFT" | "PAUSED" | "ARCHIVED" | undefined,
    search: params.q,
  });

  return (
    <div className="motion-page space-y-5">
      <div>
        <h1 className="text-[24px] leading-tight font-bold">Офферы</h1>
        <p className="mt-1 text-[13px] leading-relaxed text-content-secondary">
          Сложность и время одобрения можно задать вручную — синхронизация из
          партнёрских сетей такие значения не перезаписывает.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["", "ACTIVE", "DRAFT", "PAUSED", "ARCHIVED"] as const).map((status) => (
          <Link
            key={status || "all"}
            href={status ? `/admin/offers?status=${status}` : "/admin/offers"}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-medium ring-1 ring-inset transition-[background,color,box-shadow,transform] duration-300 ease-soft active:scale-[0.97]",
              (params.status ?? "") === status
                ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
                : "bg-surface-raised/70 text-content-secondary ring-border-subtle",
            )}
          >
            {status ? STATUS_LABEL[status] : "Все"}
          </Link>
        ))}
      </div>

      {offers.length === 0 ? (
        <EmptyState
          title="Офферов нет"
          description="Добавьте задание вручную или запустите синхронизацию с партнёрской сетью."
        />
      ) : (
        <div className="space-y-2.5">
          {offers.map((offer) => {
            const total = offer.approvedCount + offer.rejectedCount;
            const rate = total > 0 ? (offer.approvedCount / total) * 100 : null;
            const etaMismatch =
              offer.actualEtaMinutes &&
              offer.actualEtaMinutes > offer.approvalEtaMinutes * 2;

            return (
              <Card key={offer.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <OfferAvatar
                    title={offer.brandName ?? offer.title}
                    iconUrl={offer.iconUrl}
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/offers/${offer.id}`}
                        className="text-[15px] leading-snug font-semibold hover:text-brand-300"
                      >
                        {offer.title}
                      </Link>
                      <Badge tone={STATUS_TONE[offer.status]}>
                        {STATUS_LABEL[offer.status]}
                      </Badge>
                      <Badge tone="neutral">{offer.source.name}</Badge>
                    </div>

                    <p className="mt-1 text-[12px] text-content-muted">
                      {offer.brandName ? `${offer.brandName} · ` : ""}
                      {offer.category?.name ?? "без категории"} · {offer._count.steps}{" "}
                      шагов · /{offer.slug}
                    </p>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1">
                        <DifficultyBadge difficulty={offer.difficulty} />
                        <SourceTag source={offer.difficultySource} />
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Badge tone={etaMismatch ? "warn" : "neutral"}>
                          <Clock className="size-3" />
                          {formatEta(offer.approvalEtaMinutes)}
                        </Badge>
                        <SourceTag source={offer.approvalEtaSource} />
                      </span>
                      {offer.actualEtaMinutes ? (
                        <Badge tone={etaMismatch ? "danger" : "neutral"}>
                          факт {formatEta(offer.actualEtaMinutes)}
                        </Badge>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <p className="tabular text-[16px] leading-none font-bold text-money-400">
                      {formatMoney(offer.rewardAmount)}
                    </p>
                    {offer.networkPayout ? (
                      <p className="tabular text-[11px] text-content-muted">
                        сеть платит {formatMoney(offer.networkPayout)}
                      </p>
                    ) : null}
                    <p className="tabular text-[11px] text-content-muted">
                      взято {offer.takenCount} · одобрено {offer.approvedCount}
                      {rate != null ? ` · ${formatPercent(rate)}` : ""}
                    </p>
                    <Link
                      href={`/admin/offers/${offer.id}`}
                      className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-surface-overlay px-3 py-1.5 text-[12px] font-medium text-content-secondary ring-1 ring-inset ring-border-strong transition-[background,color,transform] duration-300 ease-soft hover:bg-white/5 hover:text-content-primary active:scale-[0.98]"
                    >
                      <Pencil className="size-3" />
                      Редактировать
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SourceTag({ source }: { source: "AUTO" | "NETWORK" | "MANUAL" }) {
  if (source === "AUTO") return null;
  return (
    <span
      title={VALUE_SOURCE[source].hint}
      className={cn(
        "rounded-pill px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
        source === "MANUAL"
          ? "bg-brand-500/14 text-brand-300 ring-brand-500/28"
          : "bg-surface-overlay text-content-muted ring-border-strong",
      )}
    >
      {VALUE_SOURCE[source].label}
    </span>
  );
}

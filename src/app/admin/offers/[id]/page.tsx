import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/db";
import { requireRole } from "@/server/auth";
import { formatDateTime, formatEta, formatMoney } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailRow, SectionTitle } from "@/components/ui/misc";
import { DifficultyBadge, OfferAvatar } from "@/components/domain";
import { OfferControls } from "./offer-controls";

export default async function AdminOfferPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("MODERATOR");
  const { id } = await params;

  const offer = await db.offer.findUnique({
    where: { id },
    include: {
      category: true,
      source: true,
      steps: { orderBy: { order: "asc" } },
      _count: { select: { submissions: true } },
    },
  });
  if (!offer) notFound();

  const auditLogs = await db.auditLog.findMany({
    where: { entityType: "offer", entityId: id },
    include: { actor: { select: { firstName: true, username: true } } },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return (
    <div className="motion-page space-y-5">
      <Link
        href="/admin/offers"
        className="back-nav"
      >
        <ArrowLeft className="size-4" />
        Все офферы
      </Link>

      <div className="flex flex-wrap items-start gap-4">
        <OfferAvatar
          title={offer.brandName ?? offer.title}
          iconUrl={offer.iconUrl}
          size="lg"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-[22px] leading-tight font-bold">{offer.title}</h1>
          <p className="mt-1 text-[12.5px] text-content-muted">
            {offer.source.name}
            {offer.externalId ? ` · ID в сети: ${offer.externalId}` : ""} · /{offer.slug}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <DifficultyBadge difficulty={offer.difficulty} size="md" />
            <Badge tone="neutral" size="md">
              {formatEta(offer.approvalEtaMinutes)}
            </Badge>
            <Badge tone="money" size="md">
              {formatMoney(offer.rewardAmount)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <OfferControls
            offerId={offer.id}
            difficulty={offer.difficulty}
            difficultySource={offer.difficultySource}
            approvalEtaMinutes={offer.approvalEtaMinutes}
            approvalEtaSource={offer.approvalEtaSource}
            actualEtaMinutes={offer.actualEtaMinutes}
            status={offer.status}
          />

          <div className="space-y-2.5">
            <SectionTitle>Описание и шаги</SectionTitle>
            <Card className="p-4">
              <p className="text-[13px] leading-relaxed whitespace-pre-line text-content-secondary">
                {offer.description}
              </p>
              {offer.steps.length > 0 ? (
                <ol className="mt-4 space-y-3 border-t border-border-subtle pt-4">
                  {offer.steps.map((step) => (
                    <li key={step.id} className="flex gap-3">
                      <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-500/16 text-[12px] font-bold text-brand-300">
                        {step.order}
                      </span>
                      <div>
                        <p className="text-[13.5px] font-medium">{step.title}</p>
                        {step.description ? (
                          <p className="mt-0.5 text-[12.5px] leading-relaxed text-content-secondary">
                            {step.description}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Card>
          </div>

          {auditLogs.length > 0 ? (
            <div className="space-y-2.5">
              <SectionTitle>Журнал изменений</SectionTitle>
              <Card className="divide-y divide-border-subtle">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{log.action}</Badge>
                      <span className="text-[12px] text-content-secondary">
                        {log.actor?.firstName ??
                          (log.actor?.username ? `@${log.actor.username}` : "система")}
                      </span>
                      <span className="ml-auto text-[11px] text-content-muted">
                        {formatDateTime(log.createdAt)}
                      </span>
                    </div>
                    {log.before || log.after ? (
                      <p className="mt-1.5 font-mono text-[11px] break-all text-content-muted">
                        {log.before ? `${JSON.stringify(log.before)} → ` : ""}
                        {JSON.stringify(log.after)}
                      </p>
                    ) : null}
                  </div>
                ))}
              </Card>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="space-y-2.5">
            <SectionTitle>Статистика</SectionTitle>
            <Card className="divide-y divide-border-subtle px-4 py-1">
              <DetailRow label="Взято" value={offer.takenCount} />
              <DetailRow label="Одобрено" value={offer.approvedCount} />
              <DetailRow label="Отклонено" value={offer.rejectedCount} />
              <DetailRow label="Всего выполнений" value={offer._count.submissions} />
              <DetailRow
                label="Факт. время модерации"
                value={
                  offer.actualEtaMinutes ? formatEta(offer.actualEtaMinutes) : "мало данных"
                }
              />
            </Card>
          </div>

          <div className="space-y-2.5">
            <SectionTitle>Экономика</SectionTitle>
            <Card className="divide-y divide-border-subtle px-4 py-1">
              <DetailRow
                label="Пользователю"
                value={formatMoney(offer.rewardAmount)}
              />
              <DetailRow
                label="Платит сеть"
                value={offer.networkPayout ? formatMoney(offer.networkPayout) : "—"}
              />
              <DetailRow
                label="Маржа"
                value={
                  offer.networkPayout
                    ? formatMoney(
                        Number(offer.networkPayout) - Number(offer.rewardAmount),
                      )
                    : "—"
                }
              />
              <DetailRow label="Холд" value={`${offer.holdHours} ч`} />
            </Card>
          </div>

          <div className="space-y-2.5">
            <SectionTitle>Требования и лимиты</SectionTitle>
            <Card className="divide-y divide-border-subtle px-4 py-1">
              <DetailRow
                label="Фото"
                value={
                  offer.requirePhoto
                    ? `${offer.minPhotos}–${offer.maxPhotos}`
                    : "не требуется"
                }
              />
              <DetailRow
                label="Видео"
                value={offer.requireVideo ? "обязательно" : "не требуется"}
              />
              <DetailRow
                label="Комментарий"
                value={offer.requireComment ? "обязателен" : "не требуется"}
              />
              <DetailRow label="Попыток на пользователя" value={offer.perUserLimit} />
              <DetailRow label="Общий лимит" value={offer.totalLimit ?? "без лимита"} />
              <DetailRow label="Дневной лимит" value={offer.dailyLimit ?? "без лимита"} />
              <DetailRow
                label="Срок выполнения"
                value={formatEta(offer.completionTtlMins).replace("≈ ", "")}
              />
              <DetailRow label="Гео" value={offer.geo.join(", ") || "любое"} />
              <DetailRow
                label="Автоодобрение"
                value={offer.autoApprove ? "включено" : "выключено"}
              />
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

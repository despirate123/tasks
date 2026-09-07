import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  Hourglass,
  Users,
  Video,
} from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { getOfferBySlug } from "@/server/modules/offers";
import { checkEligibility } from "@/server/modules/submissions";
import { db } from "@/server/db";
import { formatEta, formatMoney, formatPercent } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DetailRow, SectionTitle, Separator } from "@/components/ui/misc";
import { DifficultyBadge, OfferAvatar } from "@/components/domain";
import { TakeOfferButton } from "./take-button";
import { OfferLinksBlock } from "@/components/offer-links";
import { HOLD_EXPLAINER } from "@/lib/notification-settings";

export default async function TaskPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const offer = await getOfferBySlug(slug);
  if (!offer) notFound();

  const user = await getCurrentUser();
  const eligibility = user
    ? await checkEligibility(user, offer)
    : { ok: false as const, reason: "Откройте приложение через Telegram" };

  const activeSubmission =
    user && !eligibility.ok && "submissionId" in eligibility
      ? await db.taskSubmission.findUnique({
          where: { id: eligibility.submissionId as string },
          select: { id: true, status: true, clickId: true, publicCode: true },
        })
      : null;

  const proofRequirements = [
    offer.requirePhoto
      ? {
          icon: <Camera />,
          label:
            offer.minPhotos > 1
              ? `Фото — минимум ${offer.minPhotos}`
              : "Фото-подтверждение",
        }
      : null,
    offer.requireVideo ? { icon: <Video />, label: "Видео-подтверждение" } : null,
    offer.requireComment
      ? { icon: <FileText />, label: "Комментарий с описанием" }
      : null,
  ].filter(Boolean) as { icon: React.ReactNode; label: string }[];

  const remaining =
    offer.totalLimit != null ? Math.max(offer.totalLimit - offer.takenCount, 0) : null;

  return (
    <div className="space-y-4">
      <Link
        href="/"
        className="back-nav"
      >
        <ArrowLeft className="size-4" />
        Все задания
      </Link>

      <Card className="p-4">
        <div className="flex gap-3.5">
          <OfferAvatar
            title={offer.brandName ?? offer.title}
            iconUrl={offer.iconUrl}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-[19px] leading-tight font-bold">{offer.title}</h1>
            {offer.brandName ? (
              <p className="mt-1 text-[13px] text-content-muted">
                {offer.brandName}
                {offer.category ? ` · ${offer.category.name}` : ""}
              </p>
            ) : null}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <DifficultyBadge difficulty={offer.difficulty} size="md" />
              <Badge tone="neutral" size="md">
                <Clock className="size-3" />
                {formatEta(offer.approvalEtaMinutes)}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between rounded-2xl bg-money-500/8 p-3.5 ring-1 ring-inset ring-money-500/20">
          <div>
            <p className="text-[11px] tracking-wide text-content-muted uppercase">
              Вознаграждение
            </p>
            <p className="tabular mt-0.5 text-2xl leading-none font-bold text-money-400">
              {formatMoney(offer.rewardAmount)}
            </p>
          </div>
          <div className="text-right text-[11.5px] text-content-muted">
            <p>Одобрение {formatEta(offer.approvalEtaMinutes)}</p>
            {offer.holdHours > 0 ? (
              <p className="mt-0.5">Проверка до зачисления · {offer.holdHours} ч</p>
            ) : null}
          </div>
        </div>
      </Card>

      {offer.subtitle ? (
        <Card className="p-4">
          <p className="text-[14px] leading-relaxed text-content-secondary">
            {offer.subtitle}
          </p>
        </Card>
      ) : null}

      {offer.promoCode || offer.trackingUrl ? (
        <OfferLinksBlock
          promoCode={offer.promoCode}
          trackingUrl={offer.trackingUrl}
          clickId={activeSubmission?.clickId ?? activeSubmission?.publicCode}
        />
      ) : null}

      <div className="space-y-2.5">
        <SectionTitle>Что нужно сделать</SectionTitle>
        <Card className="p-4">
          <p className="text-[13.5px] leading-relaxed whitespace-pre-line text-content-secondary">
            {offer.description}
          </p>

          {offer.steps.length > 0 ? (
            <>
              <Separator className="my-4" />
              <ol className="motion-list space-y-3.5">
                {offer.steps.map((step) => (
                  <li key={step.id} className="flex gap-3">
                    <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-500/16 text-[12px] font-bold text-brand-300">
                      {step.order}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] leading-snug font-medium">
                        {step.title}
                      </p>
                      {step.description ? (
                        <p className="mt-1 text-[12.5px] leading-relaxed text-content-secondary">
                          {step.description}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </>
          ) : null}

        </Card>
      </div>

      <div className="space-y-2.5">
        <SectionTitle>Доказательства</SectionTitle>
        <Card className="p-4">
          <ul className="motion-list space-y-2.5">
            {proofRequirements.map((req) => (
              <li key={req.label} className="flex items-center gap-2.5">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-content-secondary [&_svg]:size-4">
                  {req.icon}
                </span>
                <span className="text-[13.5px]">{req.label}</span>
              </li>
            ))}
          </ul>
          {offer.proofHint ? (
            <div className="mt-3.5 flex gap-2.5 rounded-2xl bg-info/8 p-3 ring-1 ring-inset ring-info/20">
              <AlertTriangle className="size-4 shrink-0 text-info" />
              <p className="text-[12.5px] leading-relaxed text-content-secondary">
                {offer.proofHint}
              </p>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="space-y-2.5">
        <SectionTitle>Условия</SectionTitle>
        <Card className="divide-y divide-border-subtle px-4 py-1">
          <DetailRow label="Сложность" value={<DifficultyBadge difficulty={offer.difficulty} />} />
          <DetailRow
            label="Примерное время одобрения"
            value={formatEta(offer.approvalEtaMinutes)}
          />
          <DetailRow
            label="Срок на выполнение"
            value={formatEta(offer.completionTtlMins).replace("≈ ", "")}
          />
          {offer.holdHours > 0 ? (
            <DetailRow
              label="Проверка до зачисления"
              value={`${offer.holdHours} ч`}
            />
          ) : null}
          <DetailRow label="Попыток на участника" value={offer.perUserLimit} />
          {remaining != null ? (
            <DetailRow label="Осталось мест" value={remaining} />
          ) : null}
          {offer.approvedCount + offer.rejectedCount >= 5 ? (
            <DetailRow
              label="Процент одобрения"
              value={formatPercent(
                (offer.approvedCount / (offer.approvedCount + offer.rejectedCount)) * 100,
              )}
            />
          ) : null}
          <DetailRow
            label="Гео"
            value={offer.geo.join(", ") || "Любое"}
          />
        </Card>
        <p className="px-1 text-[12px] leading-relaxed text-content-muted">
          {HOLD_EXPLAINER}
        </p>
      </div>

      <div className="flex items-center gap-4 px-1 text-[12px] text-content-muted">
        <span className="inline-flex items-center gap-1.5">
          <Users className="size-3.5" />
          Взяли {offer.takenCount}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5" />
          Одобрено {offer.approvedCount}
        </span>
        {offer.actualEtaMinutes ? (
          <span className="inline-flex items-center gap-1.5">
            <Hourglass className="size-3.5" />
            Факт {formatEta(offer.actualEtaMinutes)}
          </span>
        ) : null}
      </div>

      {activeSubmission ? (
        <Button variant="secondary" size="lg" block asChild>
          <Link href={`/submissions/${activeSubmission.id}`}>
            Продолжить выполнение
          </Link>
        </Button>
      ) : eligibility.ok ? (
        <TakeOfferButton
          offerId={offer.id}
          reward={formatMoney(offer.rewardAmount)}
        />
      ) : (
        <div className="space-y-2">
          <Button variant="secondary" size="lg" block disabled>
            Недоступно
          </Button>
          <p className="text-center text-[12px] text-content-muted">
            {eligibility.reason}
          </p>
        </div>
      )}
    </div>
  );
}

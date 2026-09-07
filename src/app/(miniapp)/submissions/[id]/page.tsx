import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock } from "lucide-react";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { checkEligibility, validateProofs } from "@/server/modules/submissions";
import { listSimilarOffers } from "@/server/modules/offers";
import { formatCountdown, formatDateTime, formatMoney } from "@/lib/format";
import { SUBMISSION_STATUS } from "@/lib/labels";
import { HOLD_EXPLAINER } from "@/lib/notification-settings";
import { submissionClickId } from "@/lib/tracking-url";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle, Separator } from "@/components/ui/misc";
import { OfferAvatar, OfferCard, SubmissionStatusBadge } from "@/components/domain";
import { OfferLinksBlock } from "@/components/offer-links";
import { CancelSubmissionButton } from "@/components/cancel-submission-button";
import { ProofForm } from "./proof-form";
import { TakeOfferButton } from "@/app/(miniapp)/tasks/[slug]/take-button";
import { resolveOfferAccent } from "@/server/offer-accent";
import { CatalogHomeLink } from "@/components/catalog-home-link";

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const submission = await db.taskSubmission.findFirst({
    where: { id, userId: user.id },
    include: {
      offer: { include: { steps: { orderBy: { order: "asc" } }, category: true } },
      proofs: { include: { media: true }, orderBy: { order: "asc" } },
      events: { orderBy: { createdAt: "desc" } },
      rejectionReason: true,
    },
  });
  if (!submission) notFound();

  const statusMeta = SUBMISSION_STATUS[submission.status];
  const editable = ["DRAFT", "NEEDS_REVISION"].includes(submission.status);
  const validation = validateProofs(
    submission.offer,
    submission.proofs,
    submission.comment,
  );

  const mediaProofs = submission.proofs.filter((p) => p.kind !== "TEXT");
  // «Взято в работу» — служебная запись для аудита. Участнику она не нужна:
  // статус черновика и подсказка уже есть в шапке карточки.
  const timeline = submission.events.filter(
    (event) => !(event.toStatus === "DRAFT" && event.fromStatus == null),
  );

  const canRetake =
    submission.status === "REJECTED" && user
      ? await checkEligibility(user, submission.offer)
      : null;
  const similar =
    submission.status === "REJECTED"
      ? await listSimilarOffers(submission.offerId, submission.offer.categoryId, 4)
      : [];
  const similarAccents = await Promise.all(
    similar.map((offer) =>
      resolveOfferAccent(offer.iconUrl, offer.brandName ?? offer.title),
    ),
  );

  return (
    <div className="space-y-4">
      <Link
        href="/my-tasks"
        className="back-nav"
      >
        <ArrowLeft className="size-4" />
        Мои задания
      </Link>

      <Card className="p-4">
        <div className="flex gap-3">
          <OfferAvatar
            title={submission.offer.brandName ?? submission.offer.title}
            iconUrl={submission.offer.iconUrl}
          />
          <div className="min-w-0 flex-1">
            <Link href={`/tasks/${submission.offer.slug}`} className="block">
              <p className="text-[15px] leading-snug font-semibold">
                {submission.offer.title}
              </p>
            </Link>
            <p className="mt-0.5 font-mono text-[11px] text-content-muted">
              {submission.publicCode}
            </p>
          </div>
          <p className="tabular shrink-0 text-[15px] font-bold text-money-400">
            {formatMoney(submission.rewardAmount)}
          </p>
        </div>

        <Separator className="my-3.5" />

        <div className="flex items-start gap-3">
          <SubmissionStatusBadge status={submission.status} />
          <p className="flex-1 text-[12.5px] leading-relaxed text-content-secondary">
            {statusMeta.hint}
          </p>
        </div>

        {submission.status === "DRAFT" && submission.expiresAt ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-medium/8 p-3 ring-1 ring-inset ring-medium/20">
            <Clock className="size-4 shrink-0 text-medium" />
            <p className="text-[12.5px] text-content-secondary">
              На выполнение осталось{" "}
              <span className="font-semibold text-medium">
                {formatCountdown(submission.expiresAt)}
              </span>
            </p>
          </div>
        ) : null}

        {submission.status === "PENDING_REVIEW" && submission.reviewDeadlineAt ? (
          <div className="mt-3 flex items-center gap-2 rounded-2xl bg-info/8 p-3 ring-1 ring-inset ring-info/20">
            <Clock className="size-4 shrink-0 text-info" />
            <p className="text-[12.5px] text-content-secondary">
              Проверим до{" "}
              <span className="font-semibold text-info">
                {formatDateTime(submission.reviewDeadlineAt)}
              </span>
            </p>
          </div>
        ) : null}

        {submission.status === "PENDING_PAYOUT" && submission.payoutAvailableAt ? (
          <div className="mt-3 space-y-2 rounded-2xl bg-brand-500/8 p-3 ring-1 ring-inset ring-brand-500/20">
            <div className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-brand-300" />
              <p className="text-[12.5px] text-content-secondary">
                Проверка до{" "}
                <span className="font-semibold text-brand-300">
                  {formatCountdown(submission.payoutAvailableAt)}
                </span>
              </p>
            </div>
            <p className="text-[12px] leading-relaxed text-content-muted">
              {HOLD_EXPLAINER}
            </p>
          </div>
        ) : null}

        {submission.status === "NEEDS_REVISION" ? (
          <div className="mt-3 rounded-2xl bg-medium/8 p-3 ring-1 ring-inset ring-medium/20">
            <p className="text-[13px] font-semibold text-medium">Что исправить</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-content-secondary">
              {submission.rejectionReason?.title
                ? `${submission.rejectionReason.title}. `
                : ""}
              {submission.reviewComment ??
                "Дозагрузите или замените доказательства по замечанию модератора."}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-content-muted">
              Уже загруженное можно оставить или удалить и заменить. Отправьте снова,
              когда всё будет готово.
            </p>
          </div>
        ) : submission.rejectionReason || submission.reviewComment ? (
          <div
            className={`mt-3 rounded-2xl p-3 ring-1 ring-inset ${
              submission.status === "REJECTED"
                ? "bg-hard/8 ring-hard/20"
                : "bg-medium/8 ring-medium/20"
            }`}
          >
            {submission.rejectionReason ? (
              <p
                className={`text-[13px] font-semibold ${
                  submission.status === "REJECTED" ? "text-hard" : "text-medium"
                }`}
              >
                {submission.rejectionReason.title}
              </p>
            ) : null}
            {submission.reviewComment ? (
              <p className="mt-1 text-[12.5px] leading-relaxed text-content-secondary">
                {submission.reviewComment}
              </p>
            ) : null}
          </div>
        ) : null}

        {editable ? (
          <div className="mt-3">
            <CancelSubmissionButton submissionId={submission.id} />
          </div>
        ) : null}
      </Card>

      {submission.offer.promoCode || submission.offer.trackingUrl ? (
        <OfferLinksBlock
          promoCode={submission.offer.promoCode}
          trackingUrl={submission.offer.trackingUrl}
          clickId={submissionClickId(submission)}
        />
      ) : null}

      {editable ? (
        <>
          <div className="space-y-2.5">
            <SectionTitle>Инструкция</SectionTitle>
            <Card className="p-4">
              {submission.offer.steps.length > 0 ? (
                <ol className="space-y-3">
                  {submission.offer.steps.map((step) => (
                    <li key={step.id} className="flex gap-3">
                      <span className="tabular mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-brand-500/16 text-[12px] font-bold text-brand-300">
                        {step.order}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[13.5px] leading-snug font-medium">
                          {step.title}
                        </p>
                        {step.description ? (
                          <p className="mt-0.5 text-[12.5px] leading-relaxed text-content-secondary">
                            {step.description}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] leading-relaxed whitespace-pre-line text-content-secondary">
                  {submission.offer.description}
                </p>
              )}

            </Card>
          </div>

          <ProofForm
            submissionId={submission.id}
            comment={submission.comment ?? ""}
            proofs={mediaProofs.map((p) => ({
              id: p.id,
              kind: p.kind as "PHOTO" | "VIDEO",
              url: p.mediaId ? `/api/media/${p.mediaId}` : null,
              mimeType: p.media?.mimeType ?? "",
            }))}
            requirements={{
              requirePhoto: submission.offer.requirePhoto,
              requireVideo: submission.offer.requireVideo,
              requireComment: submission.offer.requireComment,
              minPhotos: submission.offer.minPhotos,
              maxPhotos: submission.offer.maxPhotos,
              hint: submission.offer.proofHint,
            }}
            missing={validation.ok ? [] : validation.missing}
            isRevision={submission.status === "NEEDS_REVISION"}
          />
        </>
      ) : mediaProofs.length > 0 || submission.comment ? (
        <div className="space-y-2.5">
          <SectionTitle>Отправленные доказательства</SectionTitle>
          <Card className="p-4">
            {mediaProofs.length > 0 ? (
              <div className="grid grid-cols-3 gap-2">
                {mediaProofs.map((proof) => (
                  <a
                    key={proof.id}
                    href={`/api/media/${proof.mediaId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="relative aspect-square overflow-hidden rounded-xl bg-surface-overlay ring-1 ring-border-subtle"
                  >
                    {proof.kind === "PHOTO" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/media/${proof.mediaId}`}
                        alt="Доказательство"
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="flex size-full items-center justify-center text-[11px] text-content-muted">
                        Видео
                      </span>
                    )}
                  </a>
                ))}
              </div>
            ) : null}
            {submission.comment ? (
              <p className="mt-3 text-[13px] leading-relaxed text-content-secondary">
                {submission.comment}
              </p>
            ) : null}
          </Card>
        </div>
      ) : null}

      {submission.status === "REJECTED" ? (
        <div className="space-y-3">
          {canRetake?.ok ? (
            <TakeOfferButton
              offerId={submission.offerId}
              reward={formatMoney(submission.rewardAmount)}
            />
          ) : (
            <Button variant="secondary" size="lg" block asChild>
              <CatalogHomeLink>Другие задания</CatalogHomeLink>
            </Button>
          )}
          {similar.length > 0 ? (
            <div className="space-y-2.5">
              <SectionTitle>Похожие задания</SectionTitle>
              <div className="grid grid-cols-2 items-start gap-2">
                {similar.map((offer, index) => (
                  <OfferCard
                    key={offer.id}
                    offer={offer}
                    accent={similarAccents[index]?.color}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {timeline.length > 0 ? (
        <div className="space-y-2.5">
          <SectionTitle>История</SectionTitle>
          <Card className="p-4">
            <ol className="motion-list space-y-4">
              {timeline.map((event, index) => (
                <li key={event.id} className="relative flex gap-3">
                  <span className="relative flex flex-col items-center">
                    <span
                      className={`mt-1 size-2.5 shrink-0 rounded-full ${
                        index === 0 ? "bg-brand-400" : "bg-border-strong"
                      }`}
                    />
                    {index < timeline.length - 1 ? (
                      <span className="absolute top-4 h-full w-px bg-border-subtle" />
                    ) : null}
                  </span>
                  <div className="min-w-0 flex-1 pb-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {event.toStatus ? (
                        <SubmissionStatusBadge status={event.toStatus} />
                      ) : null}
                      <Badge tone="neutral">
                        {event.actorType === "USER"
                          ? "вы"
                          : event.actorType === "MODERATOR"
                            ? "модератор"
                            : event.actorType === "SYSTEM"
                              ? "система"
                              : event.actorType.toLowerCase()}
                      </Badge>
                    </div>
                    {event.comment ? (
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-content-secondary">
                        {event.comment}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-content-muted">
                      {formatDateTime(event.createdAt)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

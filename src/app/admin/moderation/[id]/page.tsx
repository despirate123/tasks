import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, X } from "lucide-react";
import { db } from "@/server/db";
import { displayName, requireRole } from "@/server/auth";
import { getModerationQueue } from "@/server/modules/submissions";
import {
  formatCountdown,
  formatDate,
  formatDateTime,
  formatEta,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { DetailRow, SectionTitle } from "@/components/ui/misc";
import { DifficultyBadge, OfferAvatar, RiskBadge } from "@/components/domain";
import { ReviewPanel } from "./review-panel";

export default async function ModerationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("MODERATOR");
  const { id } = await params;

  const submission = await db.taskSubmission.findUnique({
    where: { id },
    include: {
      offer: { include: { steps: { orderBy: { order: "asc" } } } },
      user: {
        include: {
          stats: true,
          devices: { orderBy: { lastSeenAt: "desc" }, take: 3 },
        },
      },
      proofs: { include: { media: true }, orderBy: { order: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 10 },
      fraudFlags: { include: { rule: true } },
      reviewer: { select: { firstName: true, username: true } },
    },
  });
  if (!submission) notFound();

  const [reasons, queue, previousAttempts] = await Promise.all([
    db.rejectionReason.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    }),
    getModerationQueue({ take: 30 }),
    db.taskSubmission.findMany({
      where: {
        userId: submission.userId,
        offerId: submission.offerId,
        id: { not: submission.id },
      },
      include: { rejectionReason: true },
      orderBy: { startedAt: "desc" },
      take: 4,
    }),
  ]);

  const nextId = (() => {
    const index = queue.findIndex((item) => item.id === submission.id);
    if (index >= 0 && index + 1 < queue.length) return queue[index + 1].id;
    return queue.find((item) => item.id !== submission.id)?.id ?? null;
  })();

  const overdue = submission.reviewDeadlineAt
    ? submission.reviewDeadlineAt < new Date()
    : false;

  const mediaProofs = submission.proofs.filter((p) => p.kind !== "TEXT");
  const stats = submission.user.stats;
  const decided = (stats?.tasksApproved ?? 0) + (stats?.tasksRejected ?? 0);

  const requirements = [
    submission.offer.requirePhoto
      ? {
          label:
            submission.offer.minPhotos > 1
              ? `Фото — минимум ${submission.offer.minPhotos}`
              : "Фото-подтверждение",
          met:
            mediaProofs.filter((p) => p.kind === "PHOTO").length >=
            submission.offer.minPhotos,
        }
      : null,
    submission.offer.requireVideo
      ? {
          label: "Видео-подтверждение",
          met: mediaProofs.some((p) => p.kind === "VIDEO"),
        }
      : null,
    submission.offer.requireComment
      ? {
          label: "Комментарий",
          met: Boolean(submission.comment && submission.comment.trim().length >= 10),
        }
      : null,
  ].filter(Boolean) as { label: string; met: boolean }[];

  return (
    <div className="motion-page space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/moderation"
          className="back-nav"
        >
          <ArrowLeft className="size-4" />
          Очередь ({queue.length})
        </Link>
        <div className="flex items-center gap-2">
          {overdue ? (
            <Badge tone="danger" size="md">
              <AlertTriangle className="size-3" />
              SLA нарушен
            </Badge>
          ) : submission.reviewDeadlineAt ? (
            <Badge tone="neutral" size="md">
              осталось {formatCountdown(submission.reviewDeadlineAt)}
            </Badge>
          ) : null}
          <RiskBadge score={submission.riskScore} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <div className="space-y-5">
          <Card className="p-4">
            <div className="flex flex-wrap items-start gap-3">
              <OfferAvatar
                title={submission.offer.brandName ?? submission.offer.title}
                iconUrl={submission.offer.iconUrl}
              />
              <div className="min-w-[12rem] flex-1">
                <Link
                  href={`/admin/offers/${submission.offerId}`}
                  className="text-[16px] leading-snug font-semibold hover:text-brand-300"
                >
                  {submission.offer.title}
                </Link>
                <p className="mt-1 font-mono text-[11.5px] text-content-muted">
                  {submission.publicCode}
                  {submission.revisionCount > 0
                    ? ` · доработка №${submission.revisionCount}`
                    : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <DifficultyBadge difficulty={submission.offer.difficulty} />
                  <Badge tone="neutral">
                    заявлено {formatEta(submission.offer.approvalEtaMinutes)}
                  </Badge>
                </div>
              </div>
              <p className="tabular shrink-0 text-[20px] leading-none font-bold text-money-400">
                {formatMoney(submission.rewardAmount)}
              </p>
            </div>
          </Card>

          <div className="space-y-2.5">
            <SectionTitle>Доказательства</SectionTitle>
            <Card className="space-y-3.5 p-4">
              {mediaProofs.length > 0 ? (
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {mediaProofs.map((proof) => (
                    <a
                      key={proof.id}
                      href={`/api/media/${proof.mediaId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-surface-overlay ring-1 ring-border-subtle"
                    >
                      {proof.kind === "PHOTO" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`/api/media/${proof.mediaId}`}
                          alt="Доказательство"
                          className="size-full object-cover transition group-hover:scale-[1.03]"
                        />
                      ) : (
                        <span className="flex size-full items-center justify-center text-[12px] text-content-muted">
                          Видео · открыть
                        </span>
                      )}
                      {proof.media ? (
                        <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5 text-[10px] text-white/80">
                          {Math.round(proof.media.sizeBytes / 1024)} КБ ·{" "}
                          {proof.media.mimeType.split("/")[1]}
                        </span>
                      ) : null}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-[13px] text-content-secondary">
                  Медиа-доказательств нет.
                </p>
              )}

              {submission.comment ? (
                <div className="rounded-2xl bg-surface-input/70 p-3.5">
                  <p className="text-[11px] tracking-wide text-content-muted uppercase">
                    Комментарий участника
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-line">
                    {submission.comment}
                  </p>
                </div>
              ) : null}
            </Card>
          </div>

          <div className="space-y-2.5">
            <SectionTitle>Требования оффера</SectionTitle>
            <Card className="p-4">
              <ul className="space-y-2">
                {requirements.map((req) => (
                  <li key={req.label} className="flex items-center gap-2.5">
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-md ${
                        req.met
                          ? "bg-money-500/14 text-money-400"
                          : "bg-hard/14 text-hard"
                      }`}
                    >
                      {req.met ? <Check className="size-3" /> : <X className="size-3" />}
                    </span>
                    <span className="text-[13px]">{req.label}</span>
                  </li>
                ))}
              </ul>

              {submission.offer.steps.length > 0 ? (
                <ol className="mt-4 space-y-2 border-t border-border-subtle pt-4">
                  {submission.offer.steps.map((step) => (
                    <li key={step.id} className="flex gap-2.5 text-[12.5px]">
                      <span className="tabular shrink-0 text-content-muted">
                        {step.order}.
                      </span>
                      <span className="text-content-secondary">{step.title}</span>
                    </li>
                  ))}
                </ol>
              ) : null}

              {submission.offer.promoCode ? (
                <p className="mt-3 border-t border-border-subtle pt-3 text-[12.5px] text-content-secondary">
                  Ожидаемый промокод:{" "}
                  <span className="font-mono font-semibold text-content-primary">
                    {submission.offer.promoCode}
                  </span>
                </p>
              ) : null}
            </Card>
          </div>

          {submission.fraudFlags.length > 0 ? (
            <div className="space-y-2.5">
              <SectionTitle>Флаги антифрода</SectionTitle>
              <Card className="divide-y divide-border-subtle">
                {submission.fraudFlags.map((flag) => (
                  <div key={flag.id} className="p-3.5">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="size-4 shrink-0 text-medium" />
                      <p className="text-[13px] font-medium">{flag.rule.name}</p>
                      <Badge tone="warn" className="ml-auto">
                        +{flag.points}
                      </Badge>
                    </div>
                    {flag.rule.description ? (
                      <p className="mt-1 text-[12px] leading-relaxed text-content-secondary">
                        {flag.rule.description}
                      </p>
                    ) : null}
                  </div>
                ))}
              </Card>
            </div>
          ) : null}

          {previousAttempts.length > 0 ? (
            <div className="space-y-2.5">
              <SectionTitle>Предыдущие попытки по этому офферу</SectionTitle>
              <Card className="divide-y divide-border-subtle">
                {previousAttempts.map((attempt) => (
                  <div key={attempt.id} className="flex items-center gap-3 p-3.5">
                    <Badge tone={attempt.status === "REJECTED" ? "danger" : "neutral"}>
                      {attempt.status}
                    </Badge>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-content-secondary">
                      {attempt.rejectionReason?.title ?? attempt.reviewComment ?? "—"}
                    </span>
                    <span className="shrink-0 text-[11px] text-content-muted">
                      {formatDate(attempt.startedAt)}
                    </span>
                  </div>
                ))}
              </Card>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <ReviewPanel
            submissionId={submission.id}
            nextId={nextId}
            reasons={reasons.map((r) => ({
              id: r.id,
              title: r.title,
              allowsRevision: r.allowsRevision,
            }))}
            lockedBy={
              submission.status === "IN_REVIEW" && submission.reviewer
                ? (submission.reviewer.firstName ??
                  submission.reviewer.username ??
                  "другой модератор")
                : null
            }
          />

          <div className="space-y-2.5">
            <SectionTitle>Участник</SectionTitle>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <OfferAvatar
                  title={displayName(submission.user)}
                  iconUrl={submission.user.photoUrl}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/admin/users?q=${submission.user.telegramId}`}
                    className="block truncate text-[13.5px] font-semibold hover:text-brand-300"
                  >
                    {displayName(submission.user)}
                  </Link>
                  <p className="text-[11px] text-content-muted">
                    ID {submission.user.telegramId.toString()}
                  </p>
                </div>
              </div>

              <div className="mt-3 divide-y divide-border-subtle border-t border-border-subtle pt-1">
                <DetailRow
                  label="Регистрация"
                  value={formatDate(submission.user.createdAt)}
                />
                <DetailRow label="Одобрено" value={stats?.tasksApproved ?? 0} />
                <DetailRow label="Отклонено" value={stats?.tasksRejected ?? 0} />
                <DetailRow
                  label="Процент одобрения"
                  value={
                    decided > 0
                      ? formatPercent(
                          ((stats?.tasksApproved ?? 0) / decided) * 100,
                        )
                      : "нет данных"
                  }
                />
                <DetailRow
                  label="Риск-скор"
                  value={
                    <span
                      className={
                        submission.user.riskScore >= 50
                          ? "text-hard"
                          : submission.user.riskScore >= 20
                            ? "text-medium"
                            : ""
                      }
                    >
                      {submission.user.riskScore}
                    </span>
                  }
                />
                <DetailRow
                  label="Заработано"
                  value={formatMoney(stats?.totalEarned ?? 0)}
                />
              </div>
            </Card>
          </div>

          <div className="space-y-2.5">
            <SectionTitle>Хронология</SectionTitle>
            <Card className="divide-y divide-border-subtle px-4 py-1">
              <DetailRow
                label="Взято"
                value={formatDateTime(submission.startedAt)}
              />
              {submission.submittedAt ? (
                <DetailRow
                  label="Отправлено"
                  value={formatDateTime(submission.submittedAt)}
                />
              ) : null}
              {submission.submittedAt ? (
                <DetailRow
                  label="Время выполнения"
                  value={`${Math.max(
                    1,
                    Math.round(
                      (submission.submittedAt.getTime() -
                        submission.startedAt.getTime()) /
                        60_000,
                    ),
                  )} мин`}
                />
              ) : null}
              {submission.reviewDeadlineAt ? (
                <DetailRow
                  label="Дедлайн проверки"
                  value={formatDateTime(submission.reviewDeadlineAt)}
                />
              ) : null}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

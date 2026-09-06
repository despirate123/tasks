import Link from "next/link";
import {
  ArrowUpRight,
  Clock,
  Coins,
  ShieldAlert,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { Difficulty, SubmissionStatus, WithdrawalStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatEta, formatMoney } from "@/lib/format";
import { DIFFICULTY, SUBMISSION_STATUS, WITHDRAWAL_STATUS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

export function DifficultyBadge({
  difficulty,
  className,
  size = "sm",
}: {
  difficulty: Difficulty;
  className?: string;
  size?: "sm" | "md";
}) {
  const meta = DIFFICULTY[difficulty];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-pill font-medium ring-1 ring-inset whitespace-nowrap",
        meta.className,
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export function SubmissionStatusBadge({
  status,
  className,
}: {
  status: SubmissionStatus;
  className?: string;
}) {
  const meta = SUBMISSION_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function WithdrawalStatusBadge({ status }: { status: WithdrawalStatus }) {
  const meta = WITHDRAWAL_STATUS[status];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset whitespace-nowrap",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function OfferAvatar({
  title,
  iconUrl,
  size = "md",
}: {
  title: string;
  iconUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const dims = { sm: "size-9 text-sm", md: "size-12 text-base", lg: "size-16 text-xl" }[
    size
  ];
  // Стабильный цвет из названия — узнаваемость без загрузки картинок.
  const hue = [...title].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;

  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        className={cn(dims, "shrink-0 rounded-2xl object-cover ring-1 ring-border-subtle")}
      />
    );
  }

  return (
    <div
      className={cn(
        dims,
        "flex shrink-0 items-center justify-center rounded-2xl font-bold text-white/90 ring-1 ring-white/10",
      )}
      style={{
        background: `linear-gradient(140deg, hsl(${hue} 62% 46%), hsl(${(hue + 42) % 360} 58% 32%))`,
      }}
    >
      {title.slice(0, 2).toUpperCase()}
    </div>
  );
}

type OfferCardData = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  brandName: string | null;
  iconUrl: string | null;
  difficulty: Difficulty;
  approvalEtaMinutes: number;
  rewardAmount: unknown;
  isHot: boolean;
  isFeatured: boolean;
  category?: { name: string; icon: string | null } | null;
};

export function OfferCard({
  offer,
  mine,
}: {
  offer: OfferCardData;
  /** Состояние собственного выполнения участника по этому офферу, если оно есть. */
  mine?: "active" | "done" | null;
}) {
  return (
    <Link href={`/tasks/${offer.slug}`} className="block">
      <Card interactive className="p-3.5">
        <div className="flex gap-3">
          <OfferAvatar title={offer.brandName ?? offer.title} iconUrl={offer.iconUrl} />

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[15px] leading-snug font-semibold">
                  {offer.title}
                </p>
                {offer.brandName ? (
                  <p className="mt-0.5 truncate text-[12px] text-content-muted">
                    {offer.brandName}
                    {offer.category ? ` · ${offer.category.name}` : ""}
                  </p>
                ) : null}
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular text-[15px] leading-none font-bold text-money-400">
                  {formatMoney(offer.rewardAmount as number)}
                </p>
              </div>
            </div>

            {offer.subtitle ? (
              <p className="mt-2 line-clamp-2 text-[12.5px] leading-relaxed text-content-secondary">
                {offer.subtitle}
              </p>
            ) : null}

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <DifficultyBadge difficulty={offer.difficulty} />
              <Badge tone="neutral">
                <Clock className="size-3" />
                {formatEta(offer.approvalEtaMinutes)}
              </Badge>
              {offer.isHot ? (
                <Badge tone="danger">
                  <TrendingUp className="size-3" />
                  Хит
                </Badge>
              ) : null}
              {offer.isFeatured && !offer.isHot ? (
                <Badge tone="brand">
                  <Sparkles className="size-3" />
                  Топ
                </Badge>
              ) : null}
              {mine === "active" ? <Badge tone="info">В работе</Badge> : null}
              {mine === "done" ? <Badge tone="money">Выполнено</Badge> : null}
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}

export function OfferCardSkeleton() {
  return (
    <Card className="p-3.5">
      <div className="flex gap-3">
        <div className="shimmer size-12 shrink-0 rounded-2xl bg-surface-overlay/60" />
        <div className="flex-1 space-y-2">
          <div className="shimmer h-4 w-2/3 rounded bg-surface-overlay/60" />
          <div className="shimmer h-3 w-1/3 rounded bg-surface-overlay/60" />
          <div className="shimmer h-3 w-full rounded bg-surface-overlay/60" />
          <div className="flex gap-2">
            <div className="shimmer h-5 w-16 rounded-pill bg-surface-overlay/60" />
            <div className="shimmer h-5 w-20 rounded-pill bg-surface-overlay/60" />
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Баланс в шапке профиля — три состояния денег раздельно и явно. */
export function BalanceCard({
  available,
  pending,
  hold,
}: {
  available: unknown;
  pending: unknown;
  hold: unknown;
}) {
  const hasFrozen = Number(pending) > 0 || Number(hold) > 0;

  return (
    <div className="relative overflow-hidden rounded-card glass p-5 ring-1 ring-inset ring-[var(--acid)]/25">
      <div className="absolute -top-16 -right-10 size-44 rounded-full bg-[var(--acid)]/18 blur-2xl" />
      <div className="relative">
        <p className="text-[12px] font-medium tracking-wide text-content-secondary uppercase">
          Доступно к выводу
        </p>
        <p className="tabular mt-1.5 text-[34px] leading-none font-bold text-[var(--acid)]">
          {formatMoney(available as number)}
        </p>

        {hasFrozen ? (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
            {Number(pending) > 0 ? (
              <div>
                <p className="text-white/60">В обработке</p>
                <p className="tabular font-semibold text-white">
                  {formatMoney(pending as number)}
                </p>
              </div>
            ) : null}
            {Number(hold) > 0 ? (
              <div>
                <p className="text-white/60">В выводе</p>
                <p className="tabular font-semibold text-white">
                  {formatMoney(hold as number)}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function RiskBadge({ score }: { score: number }) {
  if (score <= 0) return null;
  const tone = score >= 50 ? "danger" : score >= 20 ? "warn" : "neutral";
  return (
    <Badge tone={tone}>
      <ShieldAlert className="size-3" />
      Риск {score}
    </Badge>
  );
}

export function MoneyDelta({
  amount,
  direction,
}: {
  amount: unknown;
  direction: "CREDIT" | "DEBIT";
}) {
  const isCredit = direction === "CREDIT";
  return (
    <span
      className={cn(
        "tabular text-[14px] font-semibold",
        isCredit ? "text-money-400" : "text-content-secondary",
      )}
    >
      {isCredit ? "+" : "−"}
      {formatMoney(amount as number)}
    </span>
  );
}

export function LinkRow({
  href,
  icon,
  title,
  subtitle,
  right,
}: {
  href: string;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-surface-overlay/50 active:bg-surface-overlay"
    >
      {icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-content-secondary [&_svg]:size-4">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{title}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[12px] text-content-muted">
            {subtitle}
          </span>
        ) : null}
      </span>
      {right ?? <ArrowUpRight className="size-4 shrink-0 text-content-muted" />}
    </Link>
  );
}

export function RewardPill({ amount }: { amount: unknown }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill bg-money-500/12 px-3 py-1.5 text-sm font-bold text-money-400 ring-1 ring-inset ring-money-500/25">
      <Coins className="size-3.5" />
      <span className="tabular">{formatMoney(amount as number)}</span>
    </span>
  );
}

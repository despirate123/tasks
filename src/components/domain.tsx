import Link from "next/link";
import {
  ArrowUpRight,
  Clock,
  Coins,
  ShieldAlert,
} from "lucide-react";
import type { Difficulty, SubmissionStatus, WithdrawalStatus } from "@/generated/prisma";
import { cn } from "@/lib/utils";
import { formatEta, formatMoney } from "@/lib/format";
import { accentFromTitle, offerHue } from "@/lib/offer-accent";
import { DIFFICULTY, SUBMISSION_STATUS, WITHDRAWAL_STATUS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { TintedOfferCard } from "@/components/logo-accent";

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
  shape = "rounded",
  className,
}: {
  title: string;
  iconUrl?: string | null;
  size?: "sm" | "md" | "lg";
  shape?: "rounded" | "circle";
  className?: string;
}) {
  const dims = { sm: "size-9 text-sm", md: "size-12 text-base", lg: "size-16 text-xl" }[
    size
  ];
  const radius = shape === "circle" ? "rounded-full" : "rounded-2xl";
  const hue = offerHue(title);

  if (iconUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={iconUrl}
        alt=""
        className={cn(
          dims,
          radius,
          "shrink-0 bg-surface-raised object-cover ring-1 ring-white/14",
          className,
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        dims,
        radius,
        "flex shrink-0 items-center justify-center font-bold text-white/90 ring-1 ring-white/10",
        className,
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
  takenCount?: number;
  category?: { name: string; icon: string | null } | null;
};

function offerMeta(offer: OfferCardData, mine?: "active" | "done" | null) {
  const brand = offer.brandName ?? offer.category?.name ?? "Задание";
  if (mine === "active") return `${brand} · в работе`;
  if (mine === "done") return `${brand} · выполнено`;
  return brand;
}

function OfferMark({
  title,
  iconUrl,
  size = "lg",
}: {
  title: string;
  iconUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  return (
    <span className="clip-frame clip-soft relative shrink-0 overflow-hidden rounded-2xl">
      <OfferAvatar
        title={title}
        iconUrl={iconUrl}
        size={size}
        className="relative ring-white/16"
      />
    </span>
  );
}

function HighlightBadge({ kind }: { kind: "hot" | "featured" }) {
  if (kind === "hot") {
    return (
      <span className="inline-flex items-center rounded-pill bg-[var(--acid)] px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--ink)] uppercase">
        Хит
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-pill bg-brand-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[var(--ink)] uppercase">
      Топ
    </span>
  );
}

export function OfferCard({
  offer,
  mine,
  layout = "tile",
  accent,
}: {
  offer: OfferCardData;
  /** Состояние собственного выполнения участника по этому офферу, если оно есть. */
  mine?: "active" | "done" | null;
  layout?: "tile" | "wide";
  /** Цвет, уже снятый с логотипа на сервере. Клиент уточнит его по пикселям. */
  accent?: string;
}) {
  const difficulty = DIFFICULTY[offer.difficulty];
  const brandTitle = offer.brandName ?? offer.title;
  const fallback = accent ?? accentFromTitle(brandTitle);
  const highlight = offer.isHot ? "hot" : offer.isFeatured ? "featured" : null;

  if (layout === "wide") {
    return (
      <Link href={`/tasks/${offer.slug}`} className="block min-w-0">
        <TintedOfferCard
          iconUrl={offer.iconUrl}
          fallback={fallback}
          className={cn(
            "offer-card flex items-center gap-3.5 rounded-card p-3.5 ring-1 ring-inset transition-[box-shadow] duration-300 ease-soft active:scale-[0.99]",
            offer.isHot
              ? "offer-card-featured ring-white/12"
              : "offer-card-featured ring-[var(--acid)]/22",
            mine === "done" && "opacity-75",
          )}
        >
          <OfferMark title={brandTitle} iconUrl={offer.iconUrl} />
          <div className="min-w-0 flex-1">
            {highlight ? (
              <p className="mb-1.5">
                <HighlightBadge kind={highlight} />
              </p>
            ) : null}
            <p className="line-clamp-2 text-[15px] leading-snug font-semibold tracking-[-0.015em]">
              {offer.title}
            </p>
            <p className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-content-muted">
              <span className={cn("size-1.5 shrink-0 rounded-full", difficulty.dot)} />
              <span className="truncate">{offerMeta(offer, mine)}</span>
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-black/25 px-2.5 py-2 text-right ring-1 ring-inset ring-white/[0.06]">
            <p className="tabular text-[16px] leading-none font-bold text-content-primary">
              {formatMoney(offer.rewardAmount as number)}
            </p>
            <p className="mt-1.5 flex items-center justify-end gap-1 text-[10.5px] text-content-muted">
              <Clock className="size-3" />
              {formatEta(offer.approvalEtaMinutes)}
            </p>
          </div>
        </TintedOfferCard>
      </Link>
    );
  }

  return (
    <Link href={`/tasks/${offer.slug}`} className="block min-w-0">
      <TintedOfferCard
        iconUrl={offer.iconUrl}
        fallback={fallback}
        className={cn(
          "offer-card flex aspect-square w-full flex-col rounded-card p-3 ring-1 ring-inset transition-[box-shadow] duration-300 ease-soft active:scale-[0.99]",
          offer.isHot
            ? "offer-card-featured ring-white/12"
            : offer.isFeatured
              ? "offer-card-featured ring-[var(--acid)]/22"
              : "ring-white/10",
          mine === "done" && "opacity-75",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <OfferMark title={brandTitle} iconUrl={offer.iconUrl} />
          <span
            className={cn(
              "rounded-pill px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
              difficulty.className,
            )}
          >
            {difficulty.label}
          </span>
        </div>
        <p className="mt-3 line-clamp-2 text-[13.5px] leading-snug font-semibold tracking-[-0.015em]">
          {offer.title}
        </p>
        <p className="mt-1 truncate text-[11.5px] text-content-muted">
          {offerMeta(offer, mine)}
        </p>
        <p className="tabular mt-auto border-t border-white/[0.06] pt-2.5 text-[16px] leading-none font-bold text-content-primary">
          {formatMoney(offer.rewardAmount as number)}
        </p>
      </TintedOfferCard>
    </Link>
  );
}

export function OfferCardSkeleton() {
  return (
    <div className="offer-card flex aspect-square flex-col rounded-card p-3 ring-1 ring-inset ring-white/[0.07]">
      <div className="shimmer size-16 shrink-0 rounded-2xl bg-surface-overlay/60" />
      <div className="shimmer mt-3 h-3.5 w-full rounded bg-surface-overlay/60" />
      <div className="shimmer mt-1.5 h-3 w-1/2 rounded bg-surface-overlay/60" />
      <div className="shimmer mt-auto h-4 w-14 rounded bg-surface-overlay/60" />
    </div>
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
    <div className="clip-frame relative overflow-hidden rounded-card bg-surface-raised p-5 ring-1 ring-inset ring-[var(--acid)]/25">
      <div aria-hidden className="corner-wash" />
      <div className="relative">
        <p className="text-[12px] font-medium tracking-wide text-content-secondary uppercase">
          Доступно к выводу
        </p>
        <p className="tabular mt-1.5 text-[34px] leading-none font-bold text-content-primary">
          {formatMoney(available as number)}
        </p>

        {hasFrozen ? (
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[12px]">
            {Number(pending) > 0 ? (
              <div>
                <p className="text-white/60">На проверке</p>
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
        {Number(pending) > 0 ? (
          <p className="relative mt-3 text-[11.5px] leading-relaxed text-white/55">
            Ещё проверяет рекламодатель. Обычно часы или дни, у части офферов —
            до 60 дней. После проверки сумма станет доступна к выводу.
          </p>
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
      className="group flex items-center gap-3 px-4 py-3.5 transition-colors duration-300 ease-soft hover:bg-surface-overlay/50 active:bg-surface-overlay"
    >
      {icon ? (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-overlay text-content-secondary transition-transform duration-300 ease-soft group-hover:scale-105 [&_svg]:size-4">
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
      {right ?? (
        <ArrowUpRight className="size-4 shrink-0 text-content-muted transition-transform duration-300 ease-soft group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
      )}
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

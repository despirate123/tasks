import * as React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("shimmer rounded-xl bg-surface-overlay/60", className)}
      {...props}
    />
  );
}

export function Separator({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="separator"
      className={cn("h-px w-full bg-border-subtle", className)}
      {...props}
    />
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card glass-thin px-6 py-12 text-center ring-1 ring-inset ring-white/[0.07]",
        className,
      )}
    >
      {icon ? (
        <div className="flex size-14 items-center justify-center rounded-2xl bg-surface-overlay text-content-muted [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <p className="text-[15px] font-semibold">{title}</p>
        {description ? (
          <p className="mx-auto max-w-[24rem] text-[13px] leading-relaxed text-content-secondary">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

const STAT_TONE = {
  default: {
    value: "text-content-primary",
    ring: "ring-white/10",
    glow: "transparent",
  },
  money: {
    value: "text-content-primary",
    ring: "ring-white/12",
    glow: "transparent",
  },
  brand: {
    value: "text-content-primary",
    ring: "ring-brand-500/22",
    glow: "rgb(212 232 246 / 0.14)",
  },
  warn: {
    value: "text-content-primary",
    ring: "ring-medium/22",
    glow: "transparent",
  },
} as const;

export function StatTile({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: keyof typeof STAT_TONE;
  className?: string;
}) {
  const meta = STAT_TONE[tone];

  return (
    <div
      className={cn(
        "stat-tile rounded-card p-3.5 ring-1 ring-inset transition-[transform,box-shadow] duration-300 ease-soft",
        meta.ring,
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-8 size-24 rounded-full blur-2xl"
        style={{ background: meta.glow }}
      />
      <p className="relative text-[11px] font-medium tracking-wide text-content-muted uppercase">
        {label}
      </p>
      <p
        className={cn(
          "tabular relative mt-1.5 text-lg leading-none font-bold",
          meta.value,
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className="relative mt-1 text-[11px] text-content-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/** Строка «ключ — значение», основной строительный блок деталей. */
export function DetailRow({
  label,
  value,
  className,
}: {
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-2.5", className)}>
      <span className="text-[13px] text-content-secondary">{label}</span>
      <span className="tabular text-right text-[13px] font-medium">{value}</span>
    </div>
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3", className)}>
      <h2 className="text-[13px] font-semibold tracking-wide text-content-muted uppercase">
        {children}
      </h2>
      {action}
    </div>
  );
}

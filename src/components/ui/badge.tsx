import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill font-medium ring-1 ring-inset whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral:
          "bg-surface-overlay text-content-secondary ring-border-strong",
        brand: "bg-brand-500/14 text-brand-300 ring-brand-500/28",
        money: "bg-money-500/12 text-money-400 ring-money-500/25",
        warn: "bg-medium/12 text-medium ring-medium/25",
        danger: "bg-hard/12 text-hard ring-hard/25",
        info: "bg-info/12 text-info ring-info/25",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

function Badge({
  className,
  tone,
  size,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ tone, size }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

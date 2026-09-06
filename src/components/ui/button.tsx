import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background,box-shadow,transform,color] duration-300 ease-soft outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:pointer-events-none disabled:opacity-45 hover:scale-[1.015] active:scale-[0.98] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--acid)] text-[var(--ink)] shadow-[0_8px_24px_-8px_rgba(247,241,106,0.45)] hover:bg-brand-50",
        money:
          "bg-[var(--acid)] text-[var(--ink)] shadow-[0_8px_24px_-8px_rgba(247,241,106,0.45)] hover:bg-brand-50",
        secondary:
          "glass-thin text-content-primary ring-1 ring-inset ring-white/12 hover:bg-white/10",
        outline:
          "bg-transparent text-content-primary ring-1 ring-inset ring-white/14 hover:bg-white/6",
        ghost: "bg-transparent text-content-secondary hover:bg-surface-raised hover:text-content-primary",
        danger:
          "bg-hard/14 text-hard ring-1 ring-inset ring-hard/30 hover:bg-hard/22",
        success:
          "bg-brand-500/14 text-brand-300 ring-1 ring-inset ring-brand-500/30 hover:bg-brand-500/22",
        support:
          "bg-brand-50 text-[var(--ink)] shadow-[0_8px_24px_-8px_rgba(251,248,228,0.45)] hover:bg-white",
      },
      size: {
        sm: "h-9 rounded-xl px-3 text-[13px] [&_svg]:size-4",
        md: "h-11 rounded-2xl px-4 text-sm [&_svg]:size-4",
        lg: "h-13 rounded-2xl px-5 text-[15px] [&_svg]:size-5",
        icon: "size-10 rounded-xl [&_svg]:size-4",
        pill: "h-8 rounded-pill px-3 text-[13px] [&_svg]:size-3.5",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

function Button({
  className,
  variant,
  size,
  block,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, block }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background,box-shadow,transform] duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 disabled:pointer-events-none disabled:opacity-45 active:scale-[0.985] [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-[0_6px_20px_-6px_rgba(108,108,245,0.7)] hover:from-brand-400 hover:to-brand-500",
        money:
          "bg-gradient-to-b from-money-500 to-money-600 text-[#04140c] shadow-[0_6px_20px_-6px_rgba(34,201,126,0.6)] hover:from-money-400 hover:to-money-500",
        secondary:
          "bg-surface-overlay text-content-primary ring-1 ring-inset ring-border-strong hover:bg-surface-overlay/70",
        outline:
          "bg-transparent text-content-primary ring-1 ring-inset ring-border-strong hover:bg-surface-raised",
        ghost: "bg-transparent text-content-secondary hover:bg-surface-raised hover:text-content-primary",
        danger:
          "bg-hard/14 text-hard ring-1 ring-inset ring-hard/30 hover:bg-hard/22",
        success:
          "bg-money-500/14 text-money-400 ring-1 ring-inset ring-money-500/30 hover:bg-money-500/22",
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

import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "h-11 w-full rounded-2xl glass-thin px-3.5 text-sm text-content-primary ring-1 ring-inset ring-white/12 outline-none transition-[box-shadow,background,transform] duration-300 ease-soft placeholder:text-content-muted focus-visible:ring-2 focus-visible:ring-[var(--acid)]/70 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "min-h-24 w-full resize-none rounded-2xl glass-thin p-3.5 text-sm leading-relaxed text-content-primary ring-1 ring-inset ring-white/12 outline-none transition-[box-shadow,background] duration-300 ease-soft placeholder:text-content-muted focus-visible:ring-2 focus-visible:ring-[var(--acid)]/70 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "block text-[13px] font-medium text-content-secondary",
        className,
      )}
      {...props}
    />
  );
}

function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label ? <Label>{label}</Label> : null}
      {children}
      {error ? (
        <p className="animate-fade-up text-[12px] text-hard">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-content-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export { Input, Textarea, Label, Field };

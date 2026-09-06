import { cn } from "@/lib/utils";

const chipBase =
  "inline-flex shrink-0 items-center gap-1.5 rounded-pill px-3.5 py-[7px] text-[12.5px] font-medium tracking-[-0.02em] transition-[color,background,box-shadow,transform] duration-300 ease-soft hover:scale-[1.03] active:scale-[0.97]";

const chipOff =
  "glass-thin text-content-secondary ring-1 ring-inset ring-white/[0.07]";

const chipOn =
  "bg-[var(--acid)]/22 text-[var(--acid)] ring-2 ring-inset ring-[var(--acid)]";

export function chipClass(active: boolean, extra?: string) {
  return cn(chipBase, active ? chipOn : chipOff, extra);
}

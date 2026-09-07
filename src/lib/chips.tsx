import { cn } from "@/lib/utils";

const chipBase =
  "clip-frame clip-pill liquid-glass inline-flex shrink-0 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-pill px-3.5 py-[7px] text-[12.5px] font-medium tracking-[-0.02em] transition-[color,background,box-shadow] duration-300 ease-soft active:scale-[0.97]";

const chipOff =
  "glass-thin text-content-secondary";

const chipOn =
  "glass-thin text-[var(--acid)]";

export function chipClass(active: boolean, extra?: string) {
  return cn(chipBase, active ? chipOn : chipOff, extra);
}

export function ChipDot() {
  return (
    <span
      className="size-1.5 shrink-0 rounded-full bg-[var(--acid)]"
      aria-hidden
    />
  );
}

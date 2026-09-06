import { cn } from "@/lib/utils";

/**
 * Липкая кнопка над нижней навигацией.
 * Фон только у карточки — полупрозрачный glass на всю ширину экрана
 * больше не просвечивает условия задания.
 */
export function StickyActionBar({
  children,
  className,
  spacerClassName = "h-32",
}: {
  children: React.ReactNode;
  className?: string;
  spacerClassName?: string;
}) {
  return (
    <>
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4"
        style={{
          paddingBottom: "calc(var(--nav-height) + 0.75rem)",
          paddingLeft: "max(1rem, var(--safe-left))",
          paddingRight: "max(1rem, var(--safe-right))",
        }}
      >
        <div className="pointer-events-none relative mx-auto max-w-[var(--app-max-width)]">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-[-1rem] bottom-full h-14 bg-gradient-to-t from-black via-black/80 to-transparent"
          />
          <div
            className={cn(
              "pointer-events-auto rounded-[22px] border border-white/10 bg-black/94 px-3 py-3 shadow-[0_-18px_48px_rgba(0,0,0,0.72)] backdrop-blur-xl",
              className,
            )}
          >
            {children}
          </div>
        </div>
      </div>
      <div className={cn(spacerClassName)} aria-hidden />
    </>
  );
}

import { cn } from "@/lib/utils";

/**
 * Липкая кнопка над нижней навигацией.
 * Без второй «коробки»: сама кнопка — акцент, снизу только мягкое затемнение.
 * Нельзя класть внутрь элемента с transform — fixed тогда
 * привязывается к карточке, а не к экрану.
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
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40">
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0"
          style={{
            height: "calc(var(--nav-height) + 6.25rem)",
            background:
              "linear-gradient(to top, #000 0, #000 calc(var(--nav-height) + 0.4rem), rgb(0 0 0 / 0.88) calc(var(--nav-height) + 4.25rem), transparent)",
          }}
        />
        <div
          className={cn(
            "pointer-events-auto relative mx-auto w-full max-w-[var(--app-max-width)]",
            className,
          )}
          style={{
            paddingBottom: "calc(var(--nav-height) + 0.75rem)",
            paddingLeft: "max(1rem, var(--safe-left))",
            paddingRight: "max(1rem, var(--safe-right))",
          }}
        >
          {children}
        </div>
      </div>
      <div aria-hidden className={cn(spacerClassName)} />
    </>
  );
}

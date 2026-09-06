/**
 * Нижний док. Сейчас три вкладки: каталог, рефералы, профиль.
 *
 * Как было (четвёртая вкладка «Мои») — вернуть пункт ниже и
 * `grid-cols-4` в `BottomNav`:
 *
 *   {
 *     href: "/my-tasks",
 *     label: "Мои",
 *     match: (path) =>
 *       path.startsWith("/my-tasks") || path.startsWith("/submissions"),
 *   }
 *
 * Полный список выполнений по-прежнему живёт на /my-tasks.
 */
export const APP_TABS = [
  {
    href: "/",
    label: "Задания",
    match: (path: string) =>
      path === "/" ||
      path.startsWith("/tasks") ||
      path.startsWith("/my-tasks") ||
      path.startsWith("/submissions"),
  },
  {
    href: "/referrals",
    label: "Друзья",
    match: (path: string) => path.startsWith("/referrals"),
  },
  {
    href: "/profile",
    label: "Профиль",
    match: (path: string) => path.startsWith("/profile"),
  },
] as const;

export function appTabIndex(pathname: string) {
  return APP_TABS.findIndex((tab) => tab.match(pathname));
}

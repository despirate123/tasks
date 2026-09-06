export const APP_TABS = [
  {
    href: "/",
    label: "Задания",
    match: (path: string) => path === "/" || path.startsWith("/tasks"),
  },
  {
    href: "/my-tasks",
    label: "Мои",
    match: (path: string) =>
      path.startsWith("/my-tasks") || path.startsWith("/submissions"),
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

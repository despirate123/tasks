/**
 * Чинит локальную копию на Windows: выключает демо-Алексея и
 * вшивает fullscreen-boot в layout.tsx. Запуск:
 *   node scripts/apply-pc-fix.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const layout = `import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "ProfiBux — задания за вознаграждение",
  description:
    "Выполняйте рекламные задания, загружайте доказательства и получайте вознаграждение на карту или в USDT.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0b0f1a",
};

const telegramBoot = \`
(function () {
  function apply() {
    var app = window.Telegram && window.Telegram.WebApp;
    if (!app) return false;
    try { app.ready(); } catch (e) {}
    try { app.expand(); } catch (e) {}
    try { if (app.requestFullscreen) app.requestFullscreen(); } catch (e) {}
    try { if (app.disableVerticalSwipes) app.disableVerticalSwipes(); } catch (e) {}
    try {
      if (app.setHeaderColor) app.setHeaderColor("#0b0f1a");
      if (app.setBackgroundColor) app.setBackgroundColor("#0b0f1a");
    } catch (e) {}
    return true;
  }
  if (apply()) return;
  var n = 0;
  var t = setInterval(function () {
    if (apply() || ++n > 40) clearInterval(t);
  }, 25);
})();
\`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={geist.variable}>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <script dangerouslySetInnerHTML={{ __html: telegramBoot }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
`;

writeFileSync(path.join(root, "src/app/layout.tsx"), layout, "utf8");

const envPath = path.join(root, ".env");
let env = readFileSync(envPath, "utf8");
if (/^DEV_AUTH_BYPASS=/m.test(env)) {
  env = env.replace(/^DEV_AUTH_BYPASS=.*$/m, "DEV_AUTH_BYPASS=false");
} else {
  env += "\nDEV_AUTH_BYPASS=false\n";
}
writeFileSync(envPath, env, "utf8");

console.log("Готово: layout.tsx обновлён, DEV_AUTH_BYPASS=false");
console.log("Дальше: закрой все окна npm и запусти npm run build && npm run start");

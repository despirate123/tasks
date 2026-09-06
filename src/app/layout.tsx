import type { Metadata, Viewport } from "next";
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
  viewportFit: "cover",
  themeColor: "#000000",
};

const telegramBoot = `
(function () {
  function apply() {
    var app = window.Telegram && window.Telegram.WebApp;
    if (!app) return false;
    try { app.ready(); } catch (e) {}
    try { app.expand(); } catch (e) {}
    try { if (app.requestFullscreen) app.requestFullscreen(); } catch (e) {}
    try { if (app.disableVerticalSwipes) app.disableVerticalSwipes(); } catch (e) {}
    try {
      if (app.setHeaderColor) app.setHeaderColor("#000000");
      if (app.setBackgroundColor) app.setBackgroundColor("#000000");
    } catch (e) {}
    try {
      var s = app.safeAreaInset || {};
      var c = app.contentSafeAreaInset || {};
      var r = document.documentElement;
      function n(o, k) { var v = Number(o[k]); return v > 0 ? v : 0; }
      function set(name, v) { if (v > 0) r.style.setProperty(name, v + "px"); }
      set("--tg-safe-area-inset-top", n(s, "top"));
      set("--tg-safe-area-inset-bottom", n(s, "bottom"));
      set("--tg-content-safe-area-inset-top", n(c, "top"));
      set("--safe-top", n(s, "top") + n(c, "top"));
      set("--safe-bottom", n(s, "bottom") + n(c, "bottom"));
    } catch (e) {}
    return true;
  }
  if (apply()) return;
  var n = 0;
  var t = setInterval(function () {
    if (apply() || ++n > 40) clearInterval(t);
  }, 25);
})();
`;

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

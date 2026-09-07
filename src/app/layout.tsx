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
  themeColor: "#121212",
};

const telegramBoot = `
(function () {
  function apply() {
    var app = window.Telegram && window.Telegram.WebApp;
    if (!app) return false;
    function atLeast(v) {
      try { return app.isVersionAtLeast && app.isVersionAtLeast(v); } catch (e) { return false; }
    }
    try { app.ready(); } catch (e) {}
    try { app.expand(); } catch (e) {}
    try { if (atLeast("8.0") && app.requestFullscreen) app.requestFullscreen(); } catch (e) {}
    try { if (atLeast("7.7") && app.disableVerticalSwipes) app.disableVerticalSwipes(); } catch (e) {}
    try {
      if (atLeast("6.1") && app.setHeaderColor) app.setHeaderColor("#121212");
      if (atLeast("6.1") && app.setBackgroundColor) app.setBackgroundColor("#121212");
    } catch (e) {}
    try {
      var s = app.safeAreaInset || {};
      var c = app.contentSafeAreaInset || {};
      var r = document.documentElement;
      var platform = "";
      try { platform = String(app.platform || "").toLowerCase(); } catch (e) {}
      if (platform) r.setAttribute("data-tg-platform", platform);
      function n(o, k) { var v = Number(o[k]); return v > 0 ? v : 0; }
      function set(name, v) { if (v > 0) r.style.setProperty(name, v + "px"); }
      set("--tg-safe-area-inset-top", n(s, "top"));
      set("--tg-safe-area-inset-bottom", n(s, "bottom"));
      set("--tg-content-safe-area-inset-top", n(c, "top"));
      set("--safe-top", n(s, "top") + n(c, "top"));
      // Android Telegram часто отдаёт большой contentSafeAreaInset.bottom,
      // хотя вебвью уже над системной панелью — док улетает вверх.
      var bottom = platform === "android" ? n(s, "bottom") : n(s, "bottom") + n(c, "bottom");
      if (platform === "android") r.style.setProperty("--safe-bottom", bottom + "px");
      else set("--safe-bottom", bottom);
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
    <html lang="ru" className={geist.variable} suppressHydrationWarning>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <script dangerouslySetInnerHTML={{ __html: telegramBoot }} />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}

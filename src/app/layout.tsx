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
  themeColor: "#0b0f1a",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={geist.variable}>
      <head>
        {/* SDK с CDN Telegram — телефон качает его напрямую, не через туннель. */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {/* expand + requestFullscreen до первого кадра, иначе iOS оставляет sheet. */}
        <Script src="/tg-boot.js" strategy="beforeInteractive" />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

import type { NextConfig } from "next";

const miniappHost = (() => {
  try {
    return new URL(process.env.MINIAPP_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  // Фильтры каталога — часть URL. Кэш на 30 с показывал бы прошлую выборку.
  experimental: {
    staleTimes: {
      dynamic: 0,
      static: 180,
    },
  },
  // Индикатор Next.js сидит в углу и на телефоне выглядит как четвёртая
  // иконка дока. В проде его нет, в dev тоже не нужен рядом с Mini App.
  devIndicators: false,
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    miniappHost,
    "*.ngrok-free.dev",
    "*.ngrok.app",
  ].filter(Boolean),
};

export default nextConfig;

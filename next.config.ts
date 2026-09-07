import type { NextConfig } from "next";

const miniappHost = (() => {
  try {
    return new URL(process.env.MINIAPP_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  // standalone — удобный артефакт для сервера (node .next/standalone).
  output: "standalone",
  experimental: {
    // Клиентский кэш App Router. Ключ — полный URL, поэтому
    // `/?reward=to150` не подменяет `/`. Prefetch дока без этого бесполезен.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
    optimizePackageImports: ["lucide-react"],
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

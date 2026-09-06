import type { NextConfig } from "next";

const miniappHost = (() => {
  try {
    return new URL(process.env.MINIAPP_URL ?? "").hostname;
  } catch {
    return "";
  }
})();

const nextConfig: NextConfig = {
  // Вкладки мини-приложения не должны каждый раз ждать сервер заново.
  // 30 с для обычного перехода, 3 мин если ссылку уже предзагрузили.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    miniappHost,
    "*.ngrok-free.dev",
    "*.ngrok.app",
  ].filter(Boolean),
};

export default nextConfig;

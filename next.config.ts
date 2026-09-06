import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Вкладки мини-приложения не должны каждый раз ждать сервер заново.
  // 30 с для обычного перехода, 3 мин если ссылку уже предзагрузили.
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;

import type { Difficulty, DeviceRequirement, OfferSourceCode } from "@/generated/prisma";
import { db } from "@/server/db";
import { slugify } from "@/lib/utils";
import { classifyDifficulty, upsertOfferFromNetwork } from "@/server/modules/offers";
import { getSetting } from "@/server/modules/settings";

/**
 * Единый внутренний контракт для всех партнёрских сетей.
 *
 * Каждый адаптер приводит свой формат к NormalizedOffer, и дальше домен
 * не знает, откуда пришёл оффер. Добавление четвёртой сети — это новый
 * адаптер, а не правки в бизнес-логике.
 */
export type NormalizedOffer = {
  externalId: string;
  title: string;
  description: string;
  subtitle?: string;
  brandName?: string;
  iconUrl?: string;
  categoryHint?: string;
  /** Сколько платит сеть нам. Награда участнику считается от этого значения. */
  networkPayout: number;
  currency: string;
  geo: string[];
  device: DeviceRequirement;
  trackingUrl: string;
  steps: { title: string; description?: string }[];
  suggestedDifficulty?: Difficulty;
  suggestedEtaMinutes?: number;
  requirePhoto?: boolean;
  requireVideo?: boolean;
  /** Сырой ответ сети — для разбора спорных конверсий. */
  raw: unknown;
};

export interface NetworkAdapter {
  code: OfferSourceCode;
  fetchOffers(config: NetworkConfig): Promise<NormalizedOffer[]>;
}

export type NetworkConfig = {
  baseUrl?: string;
  apiKey?: string;
  [key: string]: unknown;
};

class NetworkError extends Error {
  constructor(
    public source: OfferSourceCode,
    message: string,
  ) {
    super(`[${source}] ${message}`);
    this.name = "NetworkError";
  }
}

async function fetchJson<T>(
  source: OfferSourceCode,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new NetworkError(source, `HTTP ${response.status} на ${url}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * GetBlogger.
 *
 * Точные схемы ответов у сетей отличаются и меняются, поэтому маппинг
 * вынесен в отдельный метод: при изменении формата правится одно место,
 * а домен и синхронизатор остаются нетронутыми.
 */
export const getBloggerAdapter: NetworkAdapter = {
  code: "GETBLOGGER",
  async fetchOffers(config) {
    if (!config.apiKey) throw new NetworkError("GETBLOGGER", "API-ключ не задан");

    const base = config.baseUrl ?? "https://api.getblogger.ru/v1";
    const data = await fetchJson<{ items?: RawGetBlogger[] }>(
      "GETBLOGGER",
      `${base}/offers?limit=200&status=active`,
      { headers: { Authorization: `Bearer ${config.apiKey}` } },
    );

    return (data.items ?? []).map((item) => ({
      externalId: String(item.id),
      title: item.name,
      description: item.description ?? "",
      brandName: item.advertiser,
      iconUrl: item.logo,
      categoryHint: item.category,
      networkPayout: Number(item.payout ?? 0),
      currency: item.currency ?? "RUB",
      geo: item.geo ?? ["RU"],
      device: mapDevice(item.platform),
      trackingUrl: item.tracking_link ?? "",
      steps: (item.conditions ?? []).map((title) => ({ title })),
      suggestedEtaMinutes: item.hold_hours ? item.hold_hours * 60 : undefined,
      raw: item,
    }));
  },
};

type RawGetBlogger = {
  id: number | string;
  name: string;
  description?: string;
  advertiser?: string;
  logo?: string;
  category?: string;
  payout?: number | string;
  currency?: string;
  geo?: string[];
  platform?: string;
  tracking_link?: string;
  conditions?: string[];
  hold_hours?: number;
};

/** Leadgid — финансовая вертикаль: банки, кредиты, страховые продукты. */
export const leadgidAdapter: NetworkAdapter = {
  code: "LEADGID",
  async fetchOffers(config) {
    if (!config.apiKey) throw new NetworkError("LEADGID", "API-ключ не задан");

    const base = config.baseUrl ?? "https://api.leadgid.ru/v2";
    const data = await fetchJson<{ data?: RawLeadgid[] }>(
      "LEADGID",
      `${base}/offers`,
      { headers: { "X-Api-Key": config.apiKey } },
    );

    return (data.data ?? []).map((item) => ({
      externalId: String(item.offer_id),
      title: item.title,
      description: item.terms ?? item.title,
      brandName: item.brand,
      iconUrl: item.image_url,
      categoryHint: item.vertical ?? "finance",
      networkPayout: Number(item.max_payout ?? item.payout ?? 0),
      currency: "RUB",
      geo: item.countries ?? ["RU"],
      device: mapDevice(item.devices?.[0]),
      trackingUrl: item.url ?? "",
      steps: (item.flow ?? []).map((step) => ({
        title: step.name,
        description: step.hint,
      })),
      // Финансовые офферы объективно сложнее: верификация, документы, ожидание банка.
      suggestedDifficulty: "MEDIUM",
      suggestedEtaMinutes: item.approve_time_hours
        ? item.approve_time_hours * 60
        : 2880,
      requirePhoto: true,
      raw: item,
    }));
  },
};

type RawLeadgid = {
  offer_id: number | string;
  title: string;
  terms?: string;
  brand?: string;
  image_url?: string;
  vertical?: string;
  payout?: number | string;
  max_payout?: number | string;
  countries?: string[];
  devices?: string[];
  url?: string;
  flow?: { name: string; hint?: string }[];
  approve_time_hours?: number;
};

/** Rafinad — мобильные приложения, игры, подписки. */
export const rafinadAdapter: NetworkAdapter = {
  code: "RAFINAD",
  async fetchOffers(config) {
    if (!config.apiKey) throw new NetworkError("RAFINAD", "API-ключ не задан");

    const base = config.baseUrl ?? "https://api.rafinad.io/v1";
    const data = await fetchJson<{ offers?: RawRafinad[] }>(
      "RAFINAD",
      `${base}/campaigns?state=running`,
      { headers: { Authorization: config.apiKey } },
    );

    return (data.offers ?? []).map((item) => ({
      externalId: String(item.campaign_id),
      title: item.campaign_name,
      description: item.requirements ?? item.campaign_name,
      brandName: item.app_name,
      iconUrl: item.icon,
      categoryHint: item.vertical ?? "apps",
      networkPayout: Number(item.revenue ?? 0),
      currency: item.currency ?? "RUB",
      geo: item.countries ?? ["RU"],
      device: mapDevice(item.os),
      trackingUrl: item.click_url ?? "",
      steps: (item.steps ?? []).map((title) => ({ title })),
      suggestedDifficulty: "EASY",
      suggestedEtaMinutes: 720,
      raw: item,
    }));
  },
};

type RawRafinad = {
  campaign_id: number | string;
  campaign_name: string;
  requirements?: string;
  app_name?: string;
  icon?: string;
  vertical?: string;
  revenue?: number | string;
  currency?: string;
  countries?: string[];
  os?: string;
  click_url?: string;
  steps?: string[];
};

function mapDevice(value?: string): DeviceRequirement {
  const normalized = value?.toLowerCase() ?? "";
  if (normalized.includes("ios")) return "IOS";
  if (normalized.includes("android")) return "ANDROID";
  if (normalized.includes("desktop") || normalized.includes("web")) return "DESKTOP";
  return "ANY";
}

const ADAPTERS: Partial<Record<OfferSourceCode, NetworkAdapter>> = {
  GETBLOGGER: getBloggerAdapter,
  LEADGID: leadgidAdapter,
  RAFINAD: rafinadAdapter,
};

/**
 * Прогон синхронизации по одному источнику.
 *
 * Инварианты:
 *  1. Поля с *Source = MANUAL не перезаписываются никогда (см. upsertOfferFromNetwork).
 *  2. Награда участнику считается от выплаты сети по правилу маржи, но новые
 *     офферы приходят в DRAFT и публикуются вручную — цена для участника
 *     не должна меняться без решения человека.
 *  3. Исчезнувший из выдачи оффер переводится в PAUSED, а не удаляется:
 *     на него есть история выполнений и денежные записи.
 */
export async function syncSource(sourceId: string) {
  const source = await db.offerSource.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("SOURCE_NOT_FOUND");
  if (!source.enabled) throw new Error("SOURCE_DISABLED");

  const adapter = ADAPTERS[source.code];
  if (!adapter) throw new Error("ADAPTER_NOT_IMPLEMENTED");

  const run = await db.offerSyncRun.create({
    data: { sourceId, status: "RUNNING" },
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const marginPercent = Number(await getSetting("offer.margin.percent", 40));
    const offers = await adapter.fetchOffers(source.config as NetworkConfig);
    const seenIds = new Set<string>();

    for (const normalized of offers) {
      try {
        if (normalized.networkPayout <= 0 || !normalized.trackingUrl) {
          skipped += 1;
          continue;
        }

        seenIds.add(normalized.externalId);

        const existing = await db.offer.findUnique({
          where: {
            sourceId_externalId: {
              sourceId,
              externalId: normalized.externalId,
            },
          },
        });

        const rewardAmount =
          Math.floor(
            (normalized.networkPayout * (100 - marginPercent)) / 100 / 10,
          ) * 10;

        await upsertOfferFromNetwork(sourceId, {
          externalId: normalized.externalId,
          slug: `${source.code.toLowerCase()}-${slugify(normalized.title)}-${normalized.externalId}`,
          title: normalized.title,
          description: normalized.description,
          brandName: normalized.brandName,
          networkPayout: normalized.networkPayout,
          rewardAmount,
          suggestedDifficulty:
            normalized.suggestedDifficulty ??
            classifyDifficulty({
              requireVideo: normalized.requireVideo ?? false,
              requirePhoto: normalized.requirePhoto ?? true,
              minPhotos: 1,
              rewardAmount: rewardAmount as unknown as never,
              completionTtlMins: 1440,
              stepCount: normalized.steps.length,
            }),
          suggestedEtaMinutes: normalized.suggestedEtaMinutes,
          trackingUrl: normalized.trackingUrl,
          raw: normalized.raw,
        });

        if (existing) updated += 1;
        else created += 1;
      } catch {
        failed += 1;
      }
    }

    // Пропавшие из выдачи — на паузу, но только активные:
    // черновики и архив трогать не надо.
    if (seenIds.size > 0) {
      const paused = await db.offer.updateMany({
        where: {
          sourceId,
          status: "ACTIVE",
          externalId: { notIn: [...seenIds] },
        },
        data: { status: "PAUSED" },
      });
      skipped += paused.count;
    }

    await db.offerSyncRun.update({
      where: { id: run.id },
      data: {
        status: failed > 0 ? "PARTIAL" : "SUCCESS",
        created,
        updated,
        skipped,
        failed,
        finishedAt: new Date(),
      },
    });

    await db.offerSource.update({
      where: { id: sourceId },
      data: { lastSyncAt: new Date() },
    });

    return { created, updated, skipped, failed };
  } catch (error) {
    await db.offerSyncRun.update({
      where: { id: run.id },
      data: {
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        created,
        updated,
        skipped,
        failed,
        finishedAt: new Date(),
      },
    });
    throw error;
  }
}

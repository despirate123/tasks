/**
 * Цвет атмосферы карточки. Для своих иконок берём краску с макета,
 * иначе стабильный оттенок из названия — так сетка не выглядит одной серой кашей.
 */
const ICON_ACCENTS: Record<string, string> = {
  "/offers/wildberries.svg": "#CB11AB",
  "/offers/tbank.svg": "#FFDD2D",
  "/offers/yandex-eda.svg": "#F53D3D",
  "/offers/ozon.svg": "#005BFF",
  "/offers/alfa.svg": "#EF3124",
  "/offers/samokat.svg": "#FF5A00",
  "/offers/fitpro.svg": "#16A34A",
  "/offers/invest.svg": "#3D9B6E",
  "/offers/researchlab.svg": "#2A8A9A",
  "/offers/strahdom.svg": "#2563EB",
  "/offers/empire-rush.svg": "#E85D04",
  "/offers/vk-music.svg": "#FF6A00",
  "/offers/neobank.svg": "#6366F1",
};

export function offerHue(title: string): number {
  return [...title].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
}

export function offerAccent(iconUrl?: string | null, title?: string | null): string {
  if (iconUrl && ICON_ACCENTS[iconUrl]) return ICON_ACCENTS[iconUrl];
  const hue = offerHue(title ?? "Задание");
  return `hsl(${hue} 58% 46%)`;
}

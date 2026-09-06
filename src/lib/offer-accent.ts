/**
 * Цвет атмосферы карточки берётся с логотипа.
 * Нет картинки или не удалось прочитать — стабильный оттенок из названия.
 */

export function offerHue(title: string): number {
  return [...title].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360;
}

export function accentFromTitle(title?: string | null): string {
  const hue = offerHue(title ?? "Задание");
  return `hsl(${hue} 58% 46%)`;
}

export function rgbToHex(r: number, g: number, b: number): string {
  const hex = [r, g, b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("");
  return `#${hex}`;
}

export function parseCssColor(input: string): [number, number, number] | null {
  const value = input.trim().toLowerCase();
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = hex
        .slice(0, 3)
        .split("")
        .map((ch) => ch + ch)
        .join("");
    } else if (hex.length === 8) {
      hex = hex.slice(0, 6);
    }
    if (hex.length !== 6 || /[^0-9a-f]/.test(hex)) return null;
    return [
      Number.parseInt(hex.slice(0, 2), 16),
      Number.parseInt(hex.slice(2, 4), 16),
      Number.parseInt(hex.slice(4, 6), 16),
    ];
  }

  const rgb = value.match(
    /^rgba?\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)\s*[,\s]\s*([\d.]+)/,
  );
  if (rgb) {
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }

  const hsl = value.match(
    /^hsla?\(\s*([\d.]+)(?:deg)?\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%/,
  );
  if (hsl) return hslToRgb(Number(hsl[1]), Number(hsl[2]) / 100, Number(hsl[3]) / 100);
  return null;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = ((h % 360) + 360) % 360 / 360;
  if (s === 0) {
    const v = l * 255;
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let tone = t;
    if (tone < 0) tone += 1;
    if (tone > 1) tone -= 1;
    if (tone < 1 / 6) return p + (q - p) * 6 * tone;
    if (tone < 1 / 2) return q;
    if (tone < 2 / 3) return p + (q - p) * (2 / 3 - tone) * 6;
    return p;
  };
  return [channel(hue + 1 / 3) * 255, channel(hue) * 255, channel(hue - 1 / 3) * 255];
}

/** Поднимаем тёмные фирменные цвета, чтобы размытие на карточке было видно. */
export function normalizeAccentRgb(
  r: number,
  g: number,
  b: number,
): [number, number, number] | null {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const sat = max === 0 ? 0 : (max - min) / max;
  if (max < 18) return null;
  if (lum > 0.93 && sat < 0.18) return null;
  if (max < 130) {
    const lift = 150 / max;
    return [Math.min(255, r * lift), Math.min(255, g * lift), Math.min(255, b * lift)];
  }
  return [r, g, b];
}

export function colorScore(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const sat = max === 0 ? 0 : (max - min) / max;
  if (sat < 0.08 && lum < 0.22) return 0;
  if (sat < 0.08 && lum > 0.88) return 0;
  return sat * 2.1 + (1 - Math.abs(lum - 0.46)) * 0.55;
}

export function accentFromSvg(svg: string): string | null {
  const colors: [number, number, number][] = [];
  const attr = /(?:fill|stop-color)\s*=\s*["']([^"']+)["']/gi;
  const css = /(?:fill|stop-color)\s*:\s*([^;"']+)/gi;
  let match: RegExpExecArray | null;
  while ((match = attr.exec(svg))) {
    const parsed = parsePaint(match[1]);
    if (parsed) colors.push(parsed);
  }
  while ((match = css.exec(svg))) {
    const parsed = parsePaint(match[1]);
    if (parsed) colors.push(parsed);
  }

  let bestHex: string | null = null;
  let bestScore = -1;
  for (const [index, rgb] of colors.entries()) {
    const lifted = normalizeAccentRgb(rgb[0], rgb[1], rgb[2]);
    if (!lifted) continue;
    const score =
      colorScore(lifted[0], lifted[1], lifted[2]) + Math.max(0, 0.18 - index * 0.02);
    if (score > bestScore) {
      bestScore = score;
      bestHex = rgbToHex(lifted[0], lifted[1], lifted[2]);
    }
  }
  return bestHex;
}

function parsePaint(raw: string): [number, number, number] | null {
  const value = raw.trim();
  if (!value || value === "none" || value === "transparent" || value.startsWith("url(")) {
    return null;
  }
  return parseCssColor(value);
}

export function accentFromImageData(data: Uint8ClampedArray): string | null {
  const buckets = new Map<string, { r: number; g: number; b: number; weight: number }>();

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    const lifted = normalizeAccentRgb(data[i], data[i + 1], data[i + 2]);
    if (!lifted) continue;
    const [r, g, b] = lifted;
    const score = colorScore(r, g, b);
    if (score <= 0) continue;
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const bucket = buckets.get(key) ?? { r: 0, g: 0, b: 0, weight: 0 };
    bucket.r += r * score;
    bucket.g += g * score;
    bucket.b += b * score;
    bucket.weight += score;
    buckets.set(key, bucket);
  }

  let best: { r: number; g: number; b: number; weight: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.weight > best.weight) best = bucket;
  }
  if (!best || best.weight <= 0) return null;
  return rgbToHex(best.r / best.weight, best.g / best.weight, best.b / best.weight);
}

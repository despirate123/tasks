import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";

/**
 * Генератор PNG-заглушек для демо-доказательств.
 *
 * Нужен, чтобы после сидов очередь модерации показывала настоящую галерею
 * с превью, а не подписи «0 фото»: экран модератора — ключевая часть
 * продукта, и оценивать его по пустым плейсхолдерам бессмысленно.
 *
 * Пишем PNG вручную, без графических зависимостей: картинка синтетическая,
 * тянуть в проект sharp или canvas ради сидов не стоит.
 */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/**
 * Рисует «скриншот»: тёмный фон в фирменных цветах, светлый блок-карточка
 * и полосы, имитирующие строки текста. Детерминирован по seed — один и тот
 * же оффер всегда даёт одну и ту же картинку, а разные офферы разные,
 * поэтому дедупликация по checksum на демо-данных не срабатывает ложно.
 */
export function renderProofPng(seed: string, width = 480, height = 640): Buffer {
  const hash = createHash("sha256").update(seed).digest();
  const hue = hash[0] / 255;

  const raw = Buffer.alloc((width * 3 + 1) * height);

  const cardTop = Math.round(height * 0.16);
  const cardBottom = Math.round(height * 0.74);
  const cardLeft = Math.round(width * 0.08);
  const cardRight = width - cardLeft;

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 3 + 1);
    raw[rowStart] = 0; // фильтр строки: none

    for (let x = 0; x < width; x += 1) {
      const i = rowStart + 1 + x * 3;

      const inCard =
        y > cardTop && y < cardBottom && x > cardLeft && x < cardRight;

      if (inCard) {
        // Светлая карточка с «строками текста».
        const localY = y - cardTop;
        const lineIndex = Math.floor(localY / 34);
        const inLine = localY % 34 < 12 && lineIndex > 1 && lineIndex < 12;
        const lineWidth = 0.35 + ((hash[(lineIndex + 3) % 32] / 255) * 0.5);
        const inLineWidth = x - cardLeft < (cardRight - cardLeft) * lineWidth;

        if (inLine && inLineWidth) {
          const tone = lineIndex === 2 ? 40 : 150;
          raw[i] = tone;
          raw[i + 1] = tone;
          raw[i + 2] = tone + 10;
        } else {
          raw[i] = 246;
          raw[i + 1] = 247;
          raw[i + 2] = 250;
        }

        // Акцентная плашка — «сумма» или «статус».
        if (localY > 34 * 12 && localY < 34 * 12 + 60) {
          const accentWidth = (cardRight - cardLeft) * 0.55;
          if (x - cardLeft < accentWidth) {
            raw[i] = Math.round(34 + hue * 60);
            raw[i + 1] = 201;
            raw[i + 2] = 126;
          }
        }
      } else {
        // Фон: вертикальный градиент в тёмно-синих тонах интерфейса.
        const t = y / height;
        raw[i] = Math.round(11 + t * 12 + hue * 24);
        raw[i + 1] = Math.round(15 + t * 16);
        raw[i + 2] = Math.round(26 + t * 30 + hue * 18);
      }
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 2; // truecolor RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export type WrittenMedia = {
  storageKey: string;
  checksum: string;
  sizeBytes: number;
  mimeType: string;
  width: number;
  height: number;
};

export async function writeProofFile(
  uploadDir: string,
  submissionId: string,
  seed: string,
): Promise<WrittenMedia> {
  const width = 480;
  const height = 640;
  const png = renderProofPng(seed, width, height);
  const checksum = createHash("sha256").update(png).digest("hex");
  const storageKey = `proofs/${submissionId}/${checksum.slice(0, 16)}.png`;

  await mkdir(path.join(uploadDir, path.dirname(storageKey)), { recursive: true });
  await writeFile(path.join(uploadDir, storageKey), png);

  return {
    storageKey,
    checksum,
    sizeBytes: png.length,
    mimeType: "image/png",
    width,
    height,
  };
}

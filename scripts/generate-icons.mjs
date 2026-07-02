/**
 * Genera los íconos PNG de la PWA sin dependencias: fondo azul (#2563EB)
 * con una "P" blanca dibujada geométricamente (barra vertical + anillo).
 * Uso: node scripts/generate-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const BG = [0x25, 0x63, 0xeb];
const FG = [0xff, 0xff, 0xff];

function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256).map((_, n) => {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      return c;
    });
  }
  let crc = -1;
  for (const byte of buf) crc = (crc >>> 8) ^ table[(crc ^ byte) & 0xff];
  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** true si el pixel (relativo 0..1) cae dentro de la "P". */
function inGlyph(x, y) {
  // Barra vertical
  if (x >= 0.34 && x <= 0.46 && y >= 0.26 && y <= 0.76) return true;
  // Anillo (cabeza de la P)
  const cx = 0.53;
  const cy = 0.4;
  const dx = x - cx;
  const dy = (y - cy) * 1.0;
  const dist = Math.sqrt(dx * dx + dy * dy);
  return dist >= 0.075 && dist <= 0.155 && x >= 0.4;
}

function makePng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filtro none
    for (let x = 0; x < size; x++) {
      // Supersampling 2x2 para suavizar bordes
      let coverage = 0;
      for (const [ox, oy] of [
        [0.25, 0.25],
        [0.75, 0.25],
        [0.25, 0.75],
        [0.75, 0.75],
      ]) {
        if (inGlyph((x + ox) / size, (y + oy) / size)) coverage += 0.25;
      }
      const px = rowStart + 1 + x * 4;
      for (let c = 0; c < 3; c++) {
        raw[px + c] = Math.round(BG[c] + (FG[c] - BG[c]) * coverage);
      }
      raw[px + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

for (const [name, size] of [
  ["icon-192.png", 192],
  ["icon-512.png", 512],
  ["apple-touch-icon.png", 180],
]) {
  writeFileSync(join(outDir, name), makePng(size));
  console.log(`✓ ${name} (${size}x${size})`);
}

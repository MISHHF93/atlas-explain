// Rasterises the ATLAS Explain mark (src/brand/logo.svg) into toolbar icons.
// Pure Node: 4x4 supersampled signed-distance shapes, written as RGBA PNG.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "extension", "public", "icons");
mkdirSync(dir, { recursive: true });

const TEAL_A = [15, 125, 110];
const TEAL_B = [10, 90, 79];
const PAPER = [255, 253, 248];
const DOT = [61, 190, 168];

for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(dir, `icon-${size}.png`), png(size, render(size)));
}
console.log(`icons written to ${dir}`);

function render(size) {
  const px = new Uint8Array(size * size * 4);
  const ss = 4;
  // Small sizes get thicker strokes so the peak stays legible at 16px.
  const boost = size <= 16 ? 1.45 : size <= 32 ? 1.2 : 1;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const u = ((x + (sx + 0.5) / ss) / size) * 64;
          const v = ((y + (sy + 0.5) / ss) / size) * 64;
          const c = sample(u, v, boost);
          if (!c) continue;
          r += c[0]; g += c[1]; b += c[2]; a += 1;
        }
      }
      const i = (y * size + x) * 4;
      const n = ss * ss;
      if (a > 0) {
        px[i] = Math.round(r / a);
        px[i + 1] = Math.round(g / a);
        px[i + 2] = Math.round(b / a);
      }
      px[i + 3] = Math.round((a / n) * 255);
    }
  }
  return px;
}

function sample(u, v, boost) {
  if (!inRoundedRect(u, v, 64, 64, 16)) return null;
  const dot = Math.hypot(u - 49, v - 15);
  if (dot <= 5.5 * boost) return DOT;
  if (dot <= (5.5 + 2.5) * boost) return PAPER;
  const half = 2.75 * boost;
  if (segment(u, v, 14, 49, 32, 16) <= half || segment(u, v, 32, 16, 50, 49) <= half) return PAPER;
  if (segment(u, v, 23.5, 38.5, 40.5, 38.5) <= 2.5 * boost) return PAPER;
  const t = Math.min(1, Math.max(0, (u + v) / 128));
  return TEAL_A.map((c, k) => c + (TEAL_B[k] - c) * t);
}

function inRoundedRect(u, v, w, h, rad) {
  const dx = Math.max(rad - u, 0, u - (w - rad));
  const dy = Math.max(rad - v, 0, v - (h - rad));
  return dx * dx + dy * dy <= rad * rad;
}

function segment(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function png(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc(body), 8 + data.length);
  return out;
}

function crc(buf) {
  let c = 0xffffffff;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

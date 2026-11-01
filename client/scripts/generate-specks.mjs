// PROTOTYPE (branch prototype/noise): speck textures modelled on the five strips in the user's
// reference, assets/noise/noise_samples.png (print-style dust and scuffs, not even grain).
// Writes assets/noise/speck-<n>@3x.png (1200px = 400pt tiles, so specks don't visibly repeat) and a
// small speck-<n>.png that only exists so Jest can resolve the require.
// Usage (from client/): node scripts/generate-specks.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

// Counts are per 1200x1200 tile. Sizes are radii in device pixels (3 per point).
const STYLES = [
  { n: 1, color: 255, dots: [[180, 0.8, 2.8]], scratches: 6 },
  { n: 2, color: 0, dots: [[150, 1.0, 4.2]], scratches: 2 },
  { n: 3, color: 255, dots: [[650, 0.7, 3.0]], scratches: 14 },
  { n: 4, color: 0, dots: [[7000, 0.5, 1.2], [600, 1.0, 2.6], [24, 2.6, 5.5]], scratches: 70 },
  { n: 5, color: 255, dots: [[22000, 0.5, 1.2], [1500, 0.8, 2.0]], scratches: 260, scratchAlpha: 0.5 },
];

function render(style, size) {
  const scale = size / 1200;
  const alpha = new Float32Array(size * size);
  // Plot with wrap-around, so the tile repeats seamlessly.
  const plot = (x, y, a) => {
    const xi = ((Math.round(x) % size) + size) % size;
    const yi = ((Math.round(y) % size) + size) % size;
    const i = yi * size + xi;
    alpha[i] = Math.max(alpha[i], a);
  };
  const disc = (cx, cy, r, a) => {
    const R = Math.ceil(r + 1);
    for (let dy = -R; dy <= R; dy++)
      for (let dx = -R; dx <= R; dx++) {
        const d = Math.hypot(dx, dy);
        if (d <= r + 0.5) plot(cx + dx, cy + dy, a * Math.min(1, r + 0.5 - d + 0.3));
      }
  };
  for (const [count, rMin, rMax] of style.dots) {
    for (let k = 0; k < Math.round(count * scale * scale); k++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      // Skewed towards small; bigger specks are irregular clumps of two or three.
      const r = (rMin + (rMax - rMin) * Math.random() ** 2.2) * scale;
      const a = 0.65 + Math.random() * 0.35;
      disc(x, y, r, a);
      if (r > 1.6 * scale) {
        for (let c = 0; c < 2; c++) disc(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r * 1.6, r * 0.6, a);
      }
    }
  }
  // Scratches and fibres: short wandering 1px lines.
  for (let k = 0; k < Math.round(style.scratches * scale * scale); k++) {
    let x = Math.random() * size;
    let y = Math.random() * size;
    let angle = Math.random() * Math.PI * 2;
    const length = (4 + Math.random() * 22) * scale;
    const a = (style.scratchAlpha ?? 0.8) * (0.5 + Math.random() * 0.5);
    for (let s = 0; s < length; s += 0.5) {
      angle += (Math.random() - 0.5) * 0.25;
      x += Math.cos(angle) * 0.5;
      y += Math.sin(angle) * 0.5;
      plot(x, y, a);
    }
  }
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    for (let x = 0; x < size; x++) {
      const i = row + 1 + x * 4;
      raw[i] = raw[i + 1] = raw[i + 2] = style.color;
      raw[i + 3] = Math.round(alpha[y * size + x] * 255);
    }
  }
  return png(size, raw);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
};
function png(size, raw) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const style of STYLES) {
  for (const [file, size] of [[`speck-${style.n}@3x.png`, 1200], [`speck-${style.n}.png`, 400]]) {
    const data = render(style, size);
    writeFileSync(new URL(`../assets/noise/${file}`, import.meta.url), data);
    console.log(`assets/noise/${file}: ${size}px, ${Math.round(data.length / 1024)} KB`);
  }
}

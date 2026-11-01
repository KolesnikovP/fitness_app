// PROTOTYPE (branch prototype/noise): writes the grain tile the app repeats behind its screens.
// Each pixel is a white or black speck with a random strength, so the grain averages out instead of
// greying the colour under it. The app sets the overall strength with opacity.
// Usage (from client/): node scripts/generate-noise.mjs
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';


// Roughly normal noise from three uniform draws.
const gauss = () => (Math.random() + Math.random() + Math.random()) / 1.5 - 1;

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

function grainPng(SIZE) {
  const raw = Buffer.alloc((SIZE * 4 + 1) * SIZE);
  for (let y = 0; y < SIZE; y++) {
    const row = y * (SIZE * 4 + 1);
    raw[row] = 0; // PNG filter: none
    for (let x = 0; x < SIZE; x++) {
      const v = gauss();
      const i = row + 1 + x * 4;
      const shade = v > 0 ? 255 : 0;
      raw[i] = raw[i + 1] = raw[i + 2] = shade;
      raw[i + 3] = Math.min(255, Math.round(Math.abs(v) * 255));
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(SIZE, 0);
  header.writeUInt32BE(SIZE, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return png;
}

// grain.png for 1x screens (and Jest, which doesn't resolve scale suffixes); grain@2x.png is what a
// phone uses: one grain per two device pixels on a 3x screen, fine but visible.
for (const [file, size] of [['grain.png', 128], ['grain@2x.png', 256]]) {
  const png = grainPng(size);
  writeFileSync(new URL(`../assets/noise/${file}`, import.meta.url), png);
  console.log(`assets/noise/${file}: ${size}x${size}, ${png.length} bytes`);
}

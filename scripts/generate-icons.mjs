// Generates public/icons/icon{16,48,128}.png without any image dependency.
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type), data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      raw.set([r, g, b, a], y * (size * 4 + 1) + 1 + x * 4);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const distToSegment = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax,
    dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

const pixel = (u, v) => {
  // Rounded square background.
  const r = 0.22,
    cx = Math.abs(u - 0.5),
    cy = Math.abs(v - 0.5);
  const qx = Math.max(cx - (0.5 - r), 0),
    qy = Math.max(cy - (0.5 - r), 0);
  if (Math.hypot(qx, qy) > r) return [0, 0, 0, 0];
  // White check mark.
  const d = Math.min(
    distToSegment(u, v, 0.27, 0.53, 0.44, 0.69),
    distToSegment(u, v, 0.44, 0.69, 0.74, 0.34),
  );
  return d < 0.055 ? [255, 255, 255, 255] : [26, 115, 232, 255];
};

mkdirSync("public/icons", { recursive: true });
for (const size of [16, 48, 128]) {
  writeFileSync(`public/icons/icon${size}.png`, png(size, pixel));
}
console.log("Icons written to public/icons");

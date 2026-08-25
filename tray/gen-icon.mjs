#!/usr/bin/env node
// 把 favicon.png 解码成原始 RGBA，生成 tray/src/icon.rs（供 Rust 用 include 常量内嵌图标）。
// 用法：node tray/gen-icon.mjs [png路径]
import { inflateSync } from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pngPath = path.resolve(process.argv[2] || path.join(ROOT, 'favicon.png'));
const outPath = path.join(ROOT, 'tray', 'src', 'icon.rs');

const buf = fs.readFileSync(pngPath);
if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('不是有效的 PNG 文件');

let pos = 8;
let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
const idat = [];
while (pos < buf.length) {
  const len = buf.readUInt32BE(pos);
  const type = buf.toString('ascii', pos + 4, pos + 8);
  const data = buf.subarray(pos + 8, pos + 8 + len);
  if (type === 'IHDR') {
    width = data.readUInt32BE(0);
    height = data.readUInt32BE(4);
    bitDepth = data[8];
    colorType = data[9];
    interlace = data[12];
  } else if (type === 'IDAT') {
    idat.push(data);
  } else if (type === 'IEND') {
    break;
  }
  pos += 12 + len;
}

if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
  throw new Error(`仅支持 8-bit RGBA 非隔行 PNG。当前 bitDepth=${bitDepth} colorType=${colorType} interlace=${interlace}`);
}

const raw = inflateSync(Buffer.concat(idat));
const bpp = 4; // RGBA
const stride = width * bpp;
const out = Buffer.alloc(height * stride);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

for (let y = 0; y < height; y++) {
  const filter = raw[y * (stride + 1)];
  const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
  const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
  const cur = out.subarray(y * stride, (y + 1) * stride);
  for (let x = 0; x < stride; x++) {
    const a = x >= bpp ? cur[x - bpp] : 0;
    const b = prev ? prev[x] : 0;
    const c = x >= bpp && prev ? prev[x - bpp] : 0;
    let v = row[x];
    if (filter === 1) v = (v + a) & 0xff;
    else if (filter === 2) v = (v + b) & 0xff;
    else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
    else if (filter === 4) v = (v + paeth(a, b, c)) & 0xff;
    else if (filter !== 0) throw new Error('未知 filter: ' + filter);
    cur[x] = v;
  }
}

const bytes = Array.from(out).join(',');
const rs = `// 本文件由 tray/gen-icon.mjs 自动生成，勿手改。来源 favicon.png（${width}x${height} RGBA）
pub const ICON_RGBA: [u8; ${out.length}] = [${bytes}];
pub const ICON_SIZE: u32 = ${width};
`;
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, rs);
console.log(`已生成 ${path.relative(ROOT, outPath)}（${width}x${height}, ${out.length} 字节 RGBA）`);

// 同时生成 .ico（PNG 内嵌的单图 ICO，供 winres 嵌入 exe 图标；Vista+ 支持）
const icoPath = path.join(ROOT, 'tray', 'icon.ico');
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type = 1 (icon)
header.writeUInt16LE(1, 4); // count = 1
const entry = Buffer.alloc(16);
entry.writeUInt8(width >= 256 ? 0 : width, 0); // width（256 记 0）
entry.writeUInt8(height >= 256 ? 0 : height, 1); // height
entry.writeUInt8(0, 2); // colorCount
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // planes
entry.writeUInt16LE(32, 6); // bitCount
entry.writeUInt32LE(buf.length, 8); // bytesInRes
entry.writeUInt32LE(22, 12); // imageOffset
fs.writeFileSync(icoPath, Buffer.concat([header, entry, buf]));
console.log(`已生成 ${path.relative(ROOT, icoPath)}（${width}x${height} PNG-in-ICO）`);

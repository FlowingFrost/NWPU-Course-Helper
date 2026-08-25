#!/usr/bin/env node
// 给 Windows 可执行文件（pkg 产出的 CourseHelper.exe）写入图标与版本信息。
//
// 纯 JS 实现（resedit + zlib），不依赖 rcedit，也不要求在 Windows 上运行：
// - 把 CourseHelper.png 解码 → 缩放到 256/48/32/16 → 重编码为 PNG → 合成多尺寸 ICO
// - 用 resedit 写入 RT_ICON / RT_ICON_GROUP 与 VS_VERSIONINFO
// - resedit 会保留 PE 的 overlay（pkg 把虚拟文件系统塞在 overlay 里），不破坏可执行文件。
//
// 作为库被 scripts/pack.mjs 调用；也可单独运行：
//   node scripts/winres.mjs <exe路径> <png路径> [版本号]
import fs from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';
import { NtExecutable, NtExecutableResource, Resource, Data } from 'resedit';

// ---------- PNG 解码（仅支持 8-bit RGBA 非隔行，CourseHelper.png 满足） ----------
function decodePng(buf) {
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
  const bpp = 4;
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
  return { width, height, rgba: out };
}

// ---------- 面积平均（box）缩放，仅用于缩小 ----------
function resizeRgba(rgba, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const y0 = Math.floor((dy * sh) / dh);
    const y1 = Math.max(y0 + 1, Math.ceil(((dy + 1) * sh) / dh));
    for (let dx = 0; dx < dw; dx++) {
      const x0 = Math.floor((dx * sw) / dw);
      const x1 = Math.max(x0 + 1, Math.ceil(((dx + 1) * sw) / dw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * sw + x) * 4;
          r += rgba[i];
          g += rgba[i + 1];
          b += rgba[i + 2];
          a += rgba[i + 3];
          n++;
        }
      }
      const o = (dy * dw + dx) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

// ---------- PNG 编码（RGBA 8-bit 非隔行，filter 0） ----------
let crcTable = null;
function crc32(buf) {
  if (!crcTable) {
    crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bitDepth
  ihdr[9] = 6;  // colorType = RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- 多尺寸 ICO（PNG 内嵌，Vista+ 支持） ----------
function pngsToIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const png of pngs) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(png.width >= 256 ? 0 : png.width, 0);
    entry.writeUInt8(png.height >= 256 ? 0 : png.height, 1);
    entry.writeUInt8(0, 2); // colors
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bitCount
    entry.writeUInt32LE(png.data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    offset += png.data.length;
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

function buildIcoFromPng(pngPath) {
  const { width, height, rgba } = decodePng(fs.readFileSync(pngPath));
  const sizes = [256, 48, 32, 16];
  const pngs = sizes.map((s) => {
    const data = encodePng(resizeRgba(rgba, width, height, s, s), s, s);
    return { width: s, height: s, data };
  });
  return pngsToIco(pngs);
}

// ---------- 版本号解析："v0.5.0alpha" → [0,5,0,0] ----------
function parseVersion(v) {
  const parts = String(v).replace(/^v/i, '').match(/\d+/g)?.map(Number) ?? [];
  const out = [0, 0, 0, 0];
  for (let i = 0; i < 4 && i < parts.length; i++) out[i] = parts[i];
  return out;
}

/**
 * 向 exe 写入图标 + 版本信息。
 * @param {string} exePath 目标 .exe
 * @param {object} opts { version, iconPngPath }
 */
export function embedWinResources(exePath, opts) {
  const version = String(opts.version || '0.1.0');
  const [major, minor, micro, revision] = parseVersion(version);
  const verString = `${major}.${minor}.${micro}.${revision}`;

  const ico = buildIcoFromPng(opts.iconPngPath);
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
  const res = NtExecutableResource.from(exe);

  // 图标：先清掉已有的图标资源，再写入新图标组（id=1, lang=0）
  for (const entry of [...res.entries]) {
    if (entry.type === 3 || entry.type === 14) res.removeResourceEntry(entry.type, entry.id, entry.lang);
  }
  const iconFile = Data.IconFile.from(ico);
  Resource.IconGroupEntry.replaceIconsForResource(
    res.entries,
    1,
    0,
    iconFile.icons.map((item) => item.data),
  );

  // 版本信息
  const vi = Resource.VersionInfo.createEmpty();
  vi.lang = 1033;
  vi.fixedInfo.fileOS = Resource.VersionFileOS.NT_Windows32;
  vi.fixedInfo.fileType = Resource.VersionFileType.App;
  vi.fixedInfo.fileFlagsMask = 0x3f;
  vi.setFileVersion(major, minor, micro, revision, 1033);
  vi.setProductVersion(major, minor, micro, revision, 1033);
  vi.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      FileDescription: '选课助手',
      ProductName: '选课助手 CourseHelper',
      FileVersion: verString,
      ProductVersion: verString,
      CompanyName: 'CourseHelper',
      LegalCopyright: 'CourseHelper',
      OriginalFilename: 'CourseHelper.exe',
    },
  );
  vi.outputToResourceEntries(res.entries);

  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
  return { iconSizes: [256, 48, 32, 16], version: verString };
}

// 独立运行：node scripts/winres.mjs <exe> <png> [version]
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const [exe, png, version] = process.argv.slice(2);
  if (!exe || !png) {
    console.error('用法: node scripts/winres.mjs <exe路径> <png路径> [版本号]');
    process.exit(1);
  }
  const r = embedWinResources(exe, { version: version || '0.1.0', iconPngPath: png });
  console.log(`已写入图标(${r.iconSizes.join('/')}px)与版本 ${r.version} → ${exe}`);
}

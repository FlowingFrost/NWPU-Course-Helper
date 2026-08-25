import { build } from 'esbuild';
import { mkdirSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 以本文件所在目录（extension/）为基准，保证从任意 cwd 运行都能正确找到源文件
const HERE = path.dirname(fileURLToPath(import.meta.url));

const entries = [
  ['src/background.ts', 'background.js'],
  ['src/content.ts', 'content.js'],
  ['src/popup.ts', 'popup.js'],
  ['src/options.ts', 'options.js'],
];

const dist = path.join(HERE, 'dist');
mkdirSync(dist, { recursive: true });

for (const [entry, outfile] of entries) {
  await build({
    entryPoints: [path.join(HERE, entry)],
    outfile: path.join(dist, outfile),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['chrome100'],
    logLevel: 'info',
  });
}

copyFileSync(path.join(HERE, 'manifest.json'), path.join(dist, 'manifest.json'));
copyFileSync(path.join(HERE, 'src/popup.html'), path.join(dist, 'popup.html'));
copyFileSync(path.join(HERE, 'src/options.html'), path.join(dist, 'options.html'));

console.log('构建完成 → extension/dist/');

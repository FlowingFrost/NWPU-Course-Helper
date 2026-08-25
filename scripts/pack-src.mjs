#!/usr/bin/env node
// 一键打包「源码版」：把项目源码（排除 node_modules / dist / data 等产物与个人数据）
// 打包成压缩包，供装有 Node.js 的人解压后 `npm install && npm run dev` 使用。
// 使用说明见包内 README.md。
//
// 会把 --version 写进源码包内的 package.json（version/name），让解压后
// 直接在源码目录里执行 `npm run pack:win -- --version ...` 之外的操作时，
// 默认版本号也对得上（否则会回退到旧的 0.1.0）。
//
// 用法（在项目根目录）：
//   npm run pack:src                    # 版本号默认读 package.json
//   npm run pack:src -- --version v1.0alpha
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(ROOT);

const pkgJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const args = process.argv.slice(2);
function opt(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const version = opt('--version', 'v' + pkgJson.version);

const name = `src-${version}`;
const stageDir = path.join('releases', name);
const zipPath = path.join('releases', `${name}.zip`);

// 源码包排除项（按目录名/文件名匹配）
const EXCLUDE_DIRS = new Set([
  'node_modules', 'dist', 'data', '.npm-cache', '.pack', 'pack', 'releases', 'release', '.git',
  'test',    // 单元测试（extension/test 及其 fixtures）
  'docs',    // 参考文档与示例（非运行所需）
  'target',  // Rust 构建产物（tray/target）
]);
const EXCLUDE_FILES = new Set(['DESIGN.md', '开发说明.md']); // 设计/开发文档（非运行所需）

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      copyTree(s, d);
    } else if (entry.isFile()) {
      if (EXCLUDE_FILES.has(entry.name)) continue;
      if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.log') || entry.name === '.DS_Store') continue;
      fs.copyFileSync(s, d);
    }
  }
}

function run(cmd) {
  console.log('\n$ ' + cmd);
  execSync(cmd, { stdio: 'inherit', shell: true });
}

console.log(`\n========== 打包源码版 ${name} ==========\n`);

fs.rmSync(stageDir, { recursive: true, force: true });
copyTree('.', stageDir);

// 把 --version 写进源码包的 package.json，保证解压后在源码目录里执行
// `npm run pack:win` 等读 package.json 版本的操作时，默认版本号也对得上
// （否则解压后 version 仍是 0.1.0，会回退到旧的默认版本）。
// 只更新 version / name 两个字段，其余内容保持原样。
const stagedPkgJsonPath = path.join(stageDir, 'package.json');
const stagedPkgJson = JSON.parse(fs.readFileSync(stagedPkgJsonPath, 'utf8'));
// 去掉开头的 "v"，version 字段按 npm 语义化版本约定不带 v（pack.mjs 读取时会自己加回 v）
stagedPkgJson.version = version.replace(/^v/i, '');
stagedPkgJson.name = name; // 形如 src-v0.4.0alpha
fs.writeFileSync(stagedPkgJsonPath, JSON.stringify(stagedPkgJson, null, 2) + '\n');

if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
if (process.platform === 'win32') {
  run(`powershell -NoProfile -Command "Compress-Archive -Path '${stageDir}' -DestinationPath '${zipPath}' -Force"`);
} else {
  try {
    run(`cd releases && zip -rq '${name}.zip' '${name}'`);
  } catch {
    run(`cd releases && tar -czf '${name}.tar.gz' '${name}'`);
  }
}

console.log('\n========== 完成 ==========');
console.log('源码目录:', stageDir);
console.log('压缩包:', fs.existsSync(zipPath) ? zipPath : zipPath + '.tar.gz');
console.log('使用说明：解压后打开 README.md');

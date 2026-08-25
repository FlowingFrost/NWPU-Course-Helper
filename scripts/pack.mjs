#!/usr/bin/env node
// 一键打包脚本：构建前端 + 浏览器插件 + 后端，打成可执行文件，
// 组装到 releases/<平台>-<架构>-<版本>/，并压缩成 zip。
//
// 用法（在项目根目录）：
//   npm run pack             # 打包成「当前操作系统」的可执行文件
//   npm run pack:win         # 强制打包成 windows-amd64（Linux 上会交叉编译，需联网下载基础二进制）
//   npm run pack:linux       # 强制打包成 linux-amd64
//   npm run pack -- --version v1.0alpha   # 自定义版本号（默认读 package.json 的 version）
import { exec as pkgExec } from '@yao-pkg/pkg';
import { build as esbuildBuild } from 'esbuild';
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

// 目标平台/架构（pkg 的 target 语法，如 win-x64 / linux-x64 / win-arm64）
const target = opt('--target', process.platform === 'win32' ? 'win-x64' : 'linux-x64');
const version = opt('--version', 'v' + pkgJson.version);

const [plat, arch] = target.split('-');
const PLAT = { win: 'windows', linux: 'linux', macos: 'macos', alpine: 'alpine' }[plat] || plat;
const ARCH = { x64: 'amd64', arm64: 'arm64', x86: 'i386' }[arch] || arch;
const name = `${PLAT}-${ARCH}-${version}`;
const exeExt = plat === 'win' ? '.exe' : '';
const releaseDir = path.join('releases', name);
const exeRel = path.join(releaseDir, `CourseHelper${exeExt}`);
const zipPath = path.join('releases', `${name}.zip`);

function run(cmd) {
  console.log('\n$ ' + cmd);
  execSync(cmd, { stdio: 'inherit', shell: true });
}

function cp(src, dst) {
  fs.cpSync(src, dst, { recursive: true });
}

console.log(`\n========== 打包 ${name}（target=${target}）==========\n`);

// 1) 前端（tsc 类型检查 + vite build → dist/）
run('npm run build');

// 2) 浏览器插件（→ extension/dist/）
run('npm run build:ext');

// 3) 后端 TS → 单文件 CJS（express/cors 保持 external，交给 pkg 收进可执行文件）
fs.mkdirSync('.pack', { recursive: true });
console.log('\n$ esbuild server/index.ts → .pack/server.cjs');
await esbuildBuild({
  entryPoints: ['server/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: '.pack/server.cjs',
  logLevel: 'info',
});

// 4) pkg → 可执行文件
fs.mkdirSync(releaseDir, { recursive: true });
console.log(`\n$ pkg .pack/server.cjs --targets ${target} --output ${exeRel}`);
// --public + --public-packages '*'：跨平台（如 Linux 打 Windows）时字节码会因 host/target
// V8 不一致被拒绝（报 "V8 rejected the bytecode cache"），改用明文源码代替字节码规避。
await pkgExec(['.pack/server.cjs', '--targets', target, '--output', exeRel, '--public', '--public-packages', '*']);

// 5) 组装发布目录：可执行文件 + 网页 dist/ + 浏览器插件 extension/（+ 托盘壳，若已构建）
cp('dist', path.join(releaseDir, 'dist'));
cp('extension/dist', path.join(releaseDir, 'extension'));

const trayExe = path.join('tray', 'course-helper-tray.exe');
const hasTray = process.platform === 'win32' && fs.existsSync(trayExe);
if (hasTray) {
  cp(trayExe, path.join(releaseDir, 'CourseHelperTray.exe'));
}

fs.writeFileSync(
  path.join(releaseDir, 'README.txt'),
  [
    `选课助手 CourseHelper ${version}`,
    '',
    '【网页版】',
    ...(hasTray
      ? ['1. 双击 CourseHelperTray.exe（常驻托盘，自动打开网页）', '   · 右键托盘图标可「打开网站 / 退出」']
      : [`1. 双击 CourseHelper${exeExt}`]),
    '2. 浏览器打开 http://localhost:3001',
    '   （首次运行会在本文件夹生成 data/ 保存数据）',
    '',
    '【浏览器插件】',
    '1. Chrome 打开 chrome://extensions',
    '2. 开启右上角「开发者模式」',
    '3. 「加载已解压的扩展程序」→ 选择本文件夹的 extension 目录',
    '4. 插件会把教务数据导入 http://localhost:3001',
    '',
  ].join('\n'),
);

// 6) 压缩整个发布目录
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);
if (process.platform === 'win32') {
  run(`powershell -NoProfile -Command "Compress-Archive -Path '${releaseDir}' -DestinationPath '${zipPath}' -Force"`);
} else {
  try {
    run(`cd releases && zip -rq '${name}.zip' '${name}'`);
  } catch {
    run(`cd releases && tar -czf '${name}.tar.gz' '${name}'`);
  }
}

console.log('\n========== 完成 ==========');
console.log('发布目录:', releaseDir);
console.log('压缩包:', fs.existsSync(zipPath) ? zipPath : zipPath + '.tar.gz');

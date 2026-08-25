#!/usr/bin/env node
// 构建 Windows 托盘壳：重新生成 icon.rs → cargo build --release → 拷贝到 tray/course-helper-tray.exe
// 需在 Windows 上运行（本程序用了 std::os::windows），且已安装 Rust（rustup，MSVC 工具链）。
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
process.chdir(HERE);

// 1) 用 favicon.png 重新生成图标常量
execSync('node gen-icon.mjs', { stdio: 'inherit', shell: true });

// 1.5) 用 splash.png 重新生成启动小窗底图常量
execSync('node gen-splash.mjs', { stdio: 'inherit', shell: true });

// 2) cargo 构建
execSync('cargo build --release', { stdio: 'inherit', shell: true });

// 3) 拷贝产物到固定位置
const src = path.join(HERE, 'target', 'release', 'course-helper-tray.exe');
if (!fs.existsSync(src)) {
  console.error('未找到 ' + src);
  process.exit(1);
}
fs.copyFileSync(src, path.join(HERE, 'course-helper-tray.exe'));
console.log('构建完成 → tray/course-helper-tray.exe');

# 选课助手 · Windows 托盘壳

托盘小程序：后台启动 `CourseHelper.exe`（隐藏窗口）→ 默认打开一次网页 → 常驻系统托盘，右键菜单「打开网站 / 退出」。这样就不需要弹出一个终端窗口占着任务栏。

## 构建（需 Windows + Rust）

1. 安装 Rust（MSVC 工具链）：<https://rustup.rs/>
2. 在本目录运行：

   ```powershell
   node build.mjs
   ```

   产出 `tray/course-helper-tray.exe`。

> 说明：本程序用了 `std::os::windows`，只能在 Windows 上编译（Linux/macOS 编译会失败）。图标来自项目根目录的 `favicon.png`，由 `gen-icon.mjs` 解码后生成 `src/icon.rs` 内嵌进二进制。

## 运行与分发

托盘壳 `CourseHelperTray.exe` 需要和 `CourseHelper.exe`、`dist/` 放在**同一目录**：

```
CourseHelperTray.exe   ← 双击这个（托盘图标）
CourseHelper.exe       ← 后端（被托盘壳隐藏启动）
dist/                  ← 网页
```

- 启动后会自动用默认浏览器打开一次网页；之后点托盘图标「右键 → 打开网站」可再次打开。
- 「退出」会同时结束后端进程。

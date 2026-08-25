# 选课助手（CourseHelper）

本地选课 / 排课助手：网页端 + 浏览器插件（教务数据捕获）。

> 功能说明、算法、架构与扩展开发见 **[开发说明.md](开发说明.md)**。

## 如何启动

### 环境要求

- Node.js ≥ 18（推荐 20 LTS）

### 1. 安装依赖

```bash
cd CourseHelper
npm install
```

### 2. 启动网页端

```bash
npm run dev
```

打开 **http://localhost:5173**（前端界面；API 在 3001，已自动代理）。

生产模式（单端口）：

```bash
npm run build
npm start
```

打开 **http://localhost:3001**。

### 3. 安装浏览器插件（可选）

```bash
npm run build:ext     # 打包到 extension/dist/
```

1. Chrome 打开 `chrome://extensions`（Edge 为 `edge://extensions`）。
2. 打开右上角「开发者模式」。
3. 点「加载已解压的扩展程序」，选择本项目的 **`extension/dist`** 目录。
4. 先确保网页端服务已启动，插件才能把数据写入本机。

## 更多

- **开发文档（面向 AI / 新开发者，代码地图 + 扩展手册）：[docs/开发指南.md](docs/开发指南.md)**
- 功能与使用说明、意愿值/评分算法、插件开发、FAQ：[开发说明.md](开发说明.md)
- AI / 外部工具接口：[docs/AI接口协议.md](docs/AI接口协议.md)
- 完整设计稿：[DESIGN.md](DESIGN.md)

创建分发
```bash
npm run pack:src -- --version v0.2.5alpha
npm run pack:win
```
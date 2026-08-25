import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 默认只允许 http(s)://localhost 等来源，chrome-extension:// 会被拒绝并导致预检失败。
    // 改为 true 允许所有来源，插件直连 Vite 开发服务器（/api 代理到后端）时才不会 CORS 报错。
    cors: true,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});

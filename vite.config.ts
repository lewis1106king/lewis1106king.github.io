import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // lewis1106king.github.io 사용자 사이트는 도메인 루트에서 제공된다.
  base: '/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    strictPort: true,
    allowedHosts: ['.manus.computer'],
  },
});

import tailwindcss from '@tailwindcss/postcss';

import { tanstackRouter } from '@tanstack/router-plugin/vite';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  css: { postcss: { plugins: [tailwindcss()] } },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': { target: 'http://localhost:8788', changeOrigin: false },
    },
  },
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), viteReact()],
});

export default config;

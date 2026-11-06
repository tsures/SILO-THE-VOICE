import { defineConfig } from 'vite';
export default defineConfig({
  server: { middlewareMode: true },
  build: { target: 'es2022', sourcemap: false },
  clearScreen: false
});

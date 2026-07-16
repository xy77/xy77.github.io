import { resolve } from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  plugins: [tailwindcss()],
  build: {
    outDir: '.build/app',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, 'index.html'),
        auth: resolve(import.meta.dirname, 'auth.html'),
        preview: resolve(import.meta.dirname, 'preview.html')
      }
    }
  }
});

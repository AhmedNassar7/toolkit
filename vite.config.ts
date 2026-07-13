import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '/toolkit/',
  plugins: [react()],
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  test: {
    // pako (a pdf-lib-with-encrypt dependency) assigns its exports dynamically
    // via Object.assign, which Node's native CJS/ESM interop can't statically
    // detect. Inlining it forces Vitest to run it through Vite's bundler-based
    // interop instead, matching how the real browser build already handles it.
    server: {
      deps: {
        inline: ['pako', 'pdf-lib-with-encrypt'],
      },
    },
  },
});

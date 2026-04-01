import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@webgpu-editor/core': path.resolve(__dirname, '../../packages/core/src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: false
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext'
  },
  esbuild: {
    target: 'esnext'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext'
    }
  }
});

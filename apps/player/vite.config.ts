import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@webgpu-editor/core': path.resolve(__dirname, '../../packages/core/src')
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});

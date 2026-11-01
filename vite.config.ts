import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});

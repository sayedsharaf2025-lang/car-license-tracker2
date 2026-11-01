import { defineConfig } from 'vite';

export default defineConfig({
  // 'extern-wasm' = do not embed the 15 MB .wasm in the JS bundle; the app loads it from /ort/ (copied by scripts/copy-ort.mjs)
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm'] },
  optimizeDeps: { exclude: ['onnxruntime-web', 'onnxruntime-web/wasm'] },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});

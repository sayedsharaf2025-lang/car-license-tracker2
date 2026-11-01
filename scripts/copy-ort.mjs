// Copies the onnxruntime-web WASM runtime into public/ort so the app works offline.
// Only the plain CPU build (about 15 MB) is copied: the GPU/JSEP/asyncify variants are never used here.
import { cpSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
const from = 'node_modules/onnxruntime-web/dist';
const to = 'public/ort';
if (!existsSync(from)) { console.warn('onnxruntime-web not installed yet, skipping'); process.exit(0); }
mkdirSync(to, { recursive: true });
for (const f of readdirSync(from)) {
  if (/^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f)) cpSync(`${from}/${f}`, `${to}/${f}`);
}
console.log('copied ORT runtime files to', to);

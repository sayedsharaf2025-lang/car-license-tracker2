import * as ort from 'onnxruntime-web';
import { MODEL_SIZE, resizeRGBABilinear, toTensorNCHW, postprocessMask, resizeMaskBilinear } from './maskMath.ts';

ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1; // multi-thread needs cross-origin isolation, not available in the WebView

let session: ort.InferenceSession | null = null;
const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);

async function loadSession(modelUrl: string): Promise<ort.InferenceSession> {
  if (session) return session;
  const res = await fetch(modelUrl);
  const buf = res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
  // In dev a missing file returns index.html, so also check the size.
  if (!buf || buf.byteLength < 1_000_000) throw Object.assign(new Error('model missing'), { code: 'model_missing' });
  session = await ort.InferenceSession.create(buf, { executionProviders: ['wasm'] });
  return session;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, modelUrl, rgba, w, h } = e.data as { id: number; modelUrl: string; rgba: Uint8ClampedArray; w: number; h: number };
  try {
    post({ id, progress: 'model' });
    const s = await loadSession(modelUrl);
    post({ id, progress: 'run' });
    const small = resizeRGBABilinear(rgba, w, h, MODEL_SIZE, MODEL_SIZE);
    const input = new ort.Tensor('float32', toTensorNCHW(small, MODEL_SIZE, MODEL_SIZE), [1, 3, MODEL_SIZE, MODEL_SIZE]);
    const out = await s.run({ [s.inputNames[0]]: input });
    const pred = out[s.outputNames[0]].data as Float32Array; // first output, 1x1x320x320
    const mask = resizeMaskBilinear(postprocessMask(pred), MODEL_SIZE, MODEL_SIZE, w, h);
    post({ id, mask }, [mask.buffer]);
  } catch (err) {
    const code = (err as { code?: string }).code ?? 'failed';
    post({ id, error: String(err), code });
  }
};

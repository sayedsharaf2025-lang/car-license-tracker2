// On-device object / text removal with MI-GAN (MIT licence, ONNX "pipeline" build from the authors).
// The model (~80 MB) is NOT in the APK: it downloads once on first use, is kept in the WebView cache, then works offline.
import { dilate, maskBBox, contextRegion, cropRGBA, cropMask, pasteHole, rgbaToPlanarRGB, planarRGBToRGBA, migMask } from './inpaintMath.ts';
import { resizeRGBABilinear, resizeMaskBilinear } from './maskMath.ts';

// Official file first (linked from the MI-GAN README), then two community mirrors of the same file.
export const MIGAN_URLS = [
  'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx',
  'https://huggingface.co/CardAnvilModels/MI-GAN-ONNX/resolve/main/migan_pipeline_v2.onnx',
  'https://huggingface.co/edgetools/migan/resolve/main/migan_pipeline_v2.onnx',
];
export const MIGAN_LOCAL = '/models/migan_pipeline_v2.onnx'; // optional: put the file here to bundle it instead of downloading
const CACHE = 'photo-editor-models-v1';
const MAX_SIDE = 1536; // larger context areas are shrunk for the model and the fill is scaled back up

export type MiganStage = { stage: 'download'; loaded: number; total: number } | { stage: 'init' } | { stage: 'run' };

export class MiganError extends Error {
  code: 'download_failed' | 'failed' | 'cancelled';
  constructor(code: 'download_failed' | 'failed' | 'cancelled', message: string) { super(message); this.code = code; }
}

/** 'ready' = model already on the phone (or bundled). 'download' = the first use will download it. */
export async function miganStatus(): Promise<'ready' | 'download'> {
  try {
    if (await (await caches.open(CACHE)).match(MIGAN_URLS[0])) return 'ready';
  } catch { /* no Cache API */ }
  return 'download';
}

let worker: Worker | null = null;
let seq = 0;
const killWorker = () => { worker?.terminate(); worker = null; };

function call<T>(msg: Record<string, unknown>, transfer: Transferable[], onStage: (s: MiganStage) => void) {
  if (!worker) worker = new Worker(new URL('./migan.worker.ts', import.meta.url), { type: 'module' });
  const w = worker, id = ++seq;
  let rejectFn: (e: MiganError) => void = () => {};
  const promise = new Promise<T>((resolve, reject) => {
    rejectFn = reject;
    w.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.id !== id) return;
      if (d.progress === 'download') return onStage({ stage: 'download', loaded: d.loaded, total: d.total });
      if (d.progress) return onStage({ stage: d.progress });
      if (d.error) return reject(new MiganError(d.code === 'download_failed' ? 'download_failed' : 'failed', d.error));
      resolve(d as T);
    };
    w.onerror = (e) => { killWorker(); reject(new MiganError('failed', e.message)); };
    w.postMessage({ id, urls: MIGAN_URLS, localUrl: MIGAN_LOCAL, ...msg }, transfer);
  });
  return { promise, cancel: () => { killWorker(); rejectFn(new MiganError('cancelled', 'cancelled')); } };
}

/** Downloads/loads the model without running it (so the first removal is fast). */
export function prepareMigan(onStage: (s: MiganStage) => void) {
  try { void navigator.storage?.persist?.(); } catch { /* ignore */ }
  const c = call<{ ready: true }>({ cmd: 'prepare' }, [], onStage);
  return { promise: c.promise.then(() => undefined), cancel: c.cancel };
}

/**
 * Fills the `hole` pixels (1 = hole) of an RGBA image. Only the area around the hole goes to the model;
 * the rest of the photo is returned untouched. Returns a new RGBA array of the same size.
 */
export function fillHoles(rgba: Uint8ClampedArray, w: number, h: number, hole: Uint8Array, onStage: (s: MiganStage) => void) {
  let inner: { cancel: () => void } | null = null, cancelled = false;
  const promise = (async () => {
    const grow = Math.max(2, Math.min(6, Math.round(Math.max(w, h) * 0.003)));
    const big = dilate(hole, w, h, grow); // also covers soft edges and shadows around the object
    const box = maskBBox(big, w, h);
    if (!box) return rgba;
    const r = contextRegion(box, w, h), cw = r.x1 - r.x0, ch = r.y1 - r.y0;
    const s = Math.min(1, MAX_SIDE / Math.max(cw, ch)), mw = Math.max(8, Math.round(cw * s)), mh = Math.max(8, Math.round(ch * s));
    let img = cropRGBA(rgba, w, r), msk = cropMask(big, w, r);
    if (mw !== cw || mh !== ch) {
      img = resizeRGBABilinear(img, cw, ch, mw, mh);
      const m255 = resizeMaskBilinear(msk.map((v) => (v ? 255 : 0)), cw, ch, mw, mh);
      msk = m255.map((v) => (v > 127 ? 1 : 0));
    }
    const c = call<{ out: Uint8Array }>({ cmd: 'run', rgb: rgbaToPlanarRGB(img, mw * mh), mask: migMask(msk), w: mw, h: mh }, [], onStage);
    inner = c;
    if (cancelled) c.cancel();
    const res = await c.promise;
    let patch = planarRGBToRGBA(res.out, mw * mh);
    if (mw !== cw || mh !== ch) patch = resizeRGBABilinear(patch, mw, mh, cw, ch);
    const out = rgba.slice();
    pasteHole(out, w, r, patch, big);
    return out;
  })();
  return { promise, cancel: () => { cancelled = true; inner?.cancel(); } };
}

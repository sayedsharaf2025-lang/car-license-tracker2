import type { Rect } from './ocrMath.ts';

// Keep one worker alive so ONNX models stay loaded between OCR actions.
// A fresh worker per button press repeatedly downloads/parses large models.
type OCRComparison = { engine: string; text: string }[];
type OCRResult = string | OCRComparison | { words: Rect[]; lines: Rect[] };
type Pending = { resolve: (value: OCRResult) => void; reject: (reason: Error) => void; mode: 'read' | 'compare' | 'detect'; timer: ReturnType<typeof setTimeout> };
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function failAll(error: Error) {
  for (const item of pending.values()) { clearTimeout(item.timer); item.reject(error); }
  pending.clear();
  worker?.terminate(); worker = null;
}
function getWorker(): Worker {
  if (worker) return worker;
  const instance = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' });
  worker = instance;
  instance.onmessage = (e: MessageEvent) => {
    const id = Number(e.data?.id), item = pending.get(id);
    if (!item) return;
    pending.delete(id); clearTimeout(item.timer);
    if (e.data?.error) item.reject(Object.assign(new Error(String(e.data.error)), { code: e.data.code ?? 'failed' }));
    else if (item.mode === 'read') item.resolve(String(e.data?.text ?? ''));
    else if (item.mode === 'compare') item.resolve(Array.isArray(e.data?.candidates) ? e.data.candidates : []);
    else item.resolve({ words: e.data?.words ?? [], lines: e.data?.lines ?? [] });
  };
  instance.onerror = (e) => failAll(Object.assign(new Error(e.message || 'OCR worker failed'), { code: 'failed' }));
  instance.onmessageerror = () => failAll(Object.assign(new Error('Invalid OCR worker response'), { code: 'failed' }));
  return instance;
}
function request(rgba: Uint8ClampedArray, w: number, h: number, mode: 'read' | 'compare' | 'detect') {
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1 || rgba.length !== w * h * 4) {
    return Promise.reject(new RangeError('OCR image dimensions do not match pixel buffer'));
  }
  const id = nextId++, pixels = rgba.slice();
  return new Promise<string | { words: Rect[]; lines: Rect[] }>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Object.assign(new Error('OCR timed out; try a smaller crop'), { code: 'timeout' }));
    }, 90000);
    pending.set(id, { resolve, reject, mode, timer });
    try { getWorker().postMessage({ id, rgba: pixels, w, h, mode }, [pixels.buffer]); }
    catch (err) { clearTimeout(timer); pending.delete(id); reject(err); }
  });
}

/** On-device OCR. The shared worker keeps the Arabic models warm for subsequent requests. */
export async function readText(rgba: Uint8ClampedArray, w: number, h: number): Promise<string> {
  return await request(rgba, w, h, 'read') as string;
}

/** Finds text areas without reading them. Shares the same warm worker and detector model. */
export async function detectText(rgba: Uint8ClampedArray, w: number, h: number): Promise<{ words: Rect[]; lines: Rect[] }> {
  return await request(rgba, w, h, 'detect') as { words: Rect[]; lines: Rect[] };
}

/** Compare preprocessing variants with the bundled Arabic PaddleOCR model. */
export async function compareText(rgba: Uint8ClampedArray, w: number, h: number): Promise<OCRComparison> {
  return await request(rgba, w, h, 'compare') as OCRComparison;
}

/** Release the cached model worker when leaving the editor or explicitly resetting OCR. */
export function disposeOCR() { failAll(new Error('OCR worker disposed')); }

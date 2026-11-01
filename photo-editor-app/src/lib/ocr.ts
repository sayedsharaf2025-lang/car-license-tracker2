import type { Rect } from './ocrMath.ts';
/** Reads text from an RGBA crop, on-device, in a worker. Rejects with code 'model_missing' when the OCR files are not in public/models. */
export function readText(rgba: Uint8ClampedArray, w: number, h: number): Promise<string> {
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      worker.terminate();
      if (e.data.error) reject(Object.assign(new Error(e.data.error), { code: e.data.code }));
      else resolve(e.data.text as string);
    };
    worker.onerror = (e) => { worker.terminate(); reject(Object.assign(new Error(e.message), { code: 'failed' })); };
    worker.postMessage({ id: 1, rgba: rgba.slice(), w, h, mode: 'read' });
  });
}

/** Finds text areas (word boxes and line boxes, in image pixels) without reading them. Needs only the detector file (ocr_det.onnx). */
export function detectText(rgba: Uint8ClampedArray, w: number, h: number): Promise<{ words: Rect[]; lines: Rect[] }> {
  const worker = new Worker(new URL('./ocr.worker.ts', import.meta.url), { type: 'module' });
  return new Promise((resolve, reject) => {
    worker.onmessage = (e: MessageEvent) => {
      worker.terminate();
      if (e.data.error) reject(Object.assign(new Error(e.data.error), { code: e.data.code }));
      else resolve({ words: e.data.words as Rect[], lines: e.data.lines as Rect[] });
    };
    worker.onerror = (e) => { worker.terminate(); reject(Object.assign(new Error(e.message), { code: 'failed' })); };
    worker.postMessage({ id: 1, rgba: rgba.slice(), w, h, mode: 'detect' });
  });
}

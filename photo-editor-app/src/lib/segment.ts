export const MODEL_URL = '/models/u2netp.onnx';

export class SegmentError extends Error {
  code: 'model_missing' | 'failed' | 'cancelled';
  constructor(code: 'model_missing' | 'failed' | 'cancelled', message: string) { super(message); this.code = code; }
}

/** Runs background segmentation in a Web Worker. Call cancel() to stop (terminates the worker). */
export function segment(rgba: Uint8ClampedArray, w: number, h: number, onStage: (s: 'model' | 'run') => void) {
  const worker = new Worker(new URL('./segment.worker.ts', import.meta.url), { type: 'module' });
  let rejectFn: (e: SegmentError) => void = () => {};
  const promise = new Promise<Uint8Array>((resolve, reject) => {
    rejectFn = reject;
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data;
      if (d.progress) return onStage(d.progress);
      worker.terminate();
      if (d.error) reject(new SegmentError(d.code === 'model_missing' ? 'model_missing' : 'failed', d.error));
      else resolve(d.mask as Uint8Array);
    };
    worker.onerror = (e) => { worker.terminate(); reject(new SegmentError('failed', e.message)); };
    worker.postMessage({ id: 1, modelUrl: MODEL_URL, rgba: rgba.slice(), w, h });
  });
  return {
    promise,
    cancel: () => { worker.terminate(); rejectFn(new SegmentError('cancelled', 'cancelled')); },
  };
}

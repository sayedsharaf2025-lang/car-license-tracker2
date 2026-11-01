import * as ort from 'onnxruntime-web/wasm';
import { detPreprocess, detBoxes, groupLines, recPreprocess, buildChars, ctcDecode, fixArabicOrder, REC_H, type Rect } from './ocrMath.ts';

ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1;
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
let det: ort.InferenceSession | null = null, rec: ort.InferenceSession | null = null, chars: string[] = [];

async function bytes(url: string, min: number): Promise<ArrayBuffer> {
  const r = await fetch(url);
  const b = r.ok ? await r.arrayBuffer() : null;
  if (!b || b.byteLength < min) throw Object.assign(new Error('model missing: ' + url), { code: 'model_missing' });
  return b;
}

self.onmessage = async (e: MessageEvent) => {
  const { id, rgba, w, h, mode } = e.data as { id: number; rgba: Uint8ClampedArray; w: number; h: number; mode?: 'read' | 'detect' };
  try {
    if (!det) det = await ort.InferenceSession.create(new Uint8Array(await bytes('/models/ocr_det.onnx', 100_000)), { executionProviders: ['wasm'] });
    if (mode === 'detect') {
      const d = detPreprocess(rgba, w, h);
      const dout = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', d.data, [1, 3, d.dh, d.dw]) });
      const words: Rect[] = detBoxes(dout[det.outputNames[0]].data as Float32Array, d.dw, d.dh)
        .map((r) => ({ x0: (r.x0 * w) / d.dw, x1: (r.x1 * w) / d.dw, y0: (r.y0 * h) / d.dh, y1: (r.y1 * h) / d.dh }));
      post({ id, words, lines: groupLines(words) });
      return;
    }
    if (!rec) rec = await ort.InferenceSession.create(new Uint8Array(await bytes('/models/ocr_rec.onnx', 100_000)), { executionProviders: ['wasm'] });
    if (!chars.length) chars = buildChars(new TextDecoder().decode(await bytes('/models/ocr_dict.txt', 500)));
    const d = detPreprocess(rgba, w, h);
    const dout = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', d.data, [1, 3, d.dh, d.dw]) });
    const prob = dout[det.outputNames[0]].data as Float32Array;
    let lines: Rect[] = groupLines(detBoxes(prob, d.dw, d.dh)).map((r) => ({ x0: (r.x0 * w) / d.dw, x1: (r.x1 * w) / d.dw, y0: (r.y0 * h) / d.dh, y1: (r.y1 * h) / d.dh }));
    if (!lines.length) lines = [{ x0: 0, y0: 0, x1: w, y1: h }]; // tight selection: treat it as one line
    const texts: string[] = [];
    for (const r of lines) {
      const p = recPreprocess(rgba, w, h, r);
      const o = await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', p.data, [1, 3, REC_H, p.rw]) });
      const t = o[rec.outputNames[0]], dims = t.dims as readonly number[];
      texts.push(fixArabicOrder(ctcDecode(t.data as Float32Array, dims[1], dims[2], chars)));
    }
    post({ id, text: texts.filter(Boolean).join('\n') });
  } catch (err) {
    post({ id, error: String(err), code: (err as { code?: string }).code ?? 'failed' });
  }
};

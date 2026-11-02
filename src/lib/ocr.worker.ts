import * as ort from 'onnxruntime-web/wasm';
import { detPreprocess, detBoxes, groupLines, recPreprocess, buildChars, ctcDecodeScored, fixArabicOrder, REC_H, type Rect } from './ocrMath.ts';

ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1;
const post = (m: unknown) => (self as unknown as Worker).postMessage(m);
let det: ort.InferenceSession | null = null, rec: ort.InferenceSession | null = null, chars: string[] = [];

async function bytes(path: string, min: number): Promise<ArrayBuffer> {
  const name = path.split('/').pop() ?? path;
  // Vite copies public/models into dist/models. Resolve relative to the bundled worker
  // first (works for Android assets and sub-path hosting), then try the app root.
  const candidates = [
    new URL('../models/' + name, import.meta.url).href,
    new URL('/models/' + name, self.location.href).href,
  ];
  let lastStatus = 'not found';
  for (const url of [...new Set(candidates)]) {
    try {
      const r = await fetch(url, { cache: 'force-cache' });
      if (!r.ok) { lastStatus = 'HTTP ' + r.status + ' at ' + url; continue; }
      const b = await r.arrayBuffer();
      if (b.byteLength >= min) return b;
      lastStatus = 'file too small (' + b.byteLength + ' bytes) at ' + url;
    } catch (err) { lastStatus = String(err); }
  }
  throw Object.assign(new Error('OCR model missing: ' + name + '. ' + lastStatus), { code: 'model_missing' });
}

const handleMessage = async (e: MessageEvent) => {
  const { id, rgba, w, h, mode } = e.data as { id: number; rgba: Uint8ClampedArray; w: number; h: number; mode?: 'read' | 'compare' | 'detect' };
  try {
    if (!det) det = await ort.InferenceSession.create(new Uint8Array(await bytes('/models/ocr_det.onnx', 100_000)), { executionProviders: ['wasm'] });
    if (mode === 'detect') {
      const d = detPreprocess(rgba, w, h, 1600);
      const dout = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', d.data, [1, 3, d.dh, d.dw]) });
      const words: Rect[] = detBoxes(dout[det.outputNames[0]].data as Float32Array, d.dw, d.dh)
        .map((r) => ({ x0: (r.x0 * w) / d.dw, x1: (r.x1 * w) / d.dw, y0: (r.y0 * h) / d.dh, y1: (r.y1 * h) / d.dh }));
      post({ id, words, lines: groupLines(words) });
      return;
    }
    if (!rec) rec = await ort.InferenceSession.create(new Uint8Array(await bytes('/models/ocr_rec.onnx', 100_000)), { executionProviders: ['wasm'] });
    if (!chars.length) chars = buildChars(new TextDecoder().decode(await bytes('/models/ocr_dict.txt', 500)));
    const d = detPreprocess(rgba, w, h, 1280);
    const dout = await det.run({ [det.inputNames[0]]: new ort.Tensor('float32', d.data, [1, 3, d.dh, d.dw]) });
    const prob = dout[det.outputNames[0]].data as Float32Array;
    let lines: Rect[] = groupLines(detBoxes(prob, d.dw, d.dh)).map((r) => ({ x0: (r.x0 * w) / d.dw, x1: (r.x1 * w) / d.dw, y0: (r.y0 * h) / d.dh, y1: (r.y1 * h) / d.dh }));
    if (!lines.length) lines = [{ x0: 0, y0: 0, x1: w, y1: h }]; // tight selection: treat it as one line
    const texts: string[] = [];
    const compareLines: {name:string;text:string;confidence:number}[][] = [];
    for (const r of lines) {
      const passes: { name: string; text: string; confidence: number }[] = [];
      const runPass = async (kind: 'original' | 'contrast' | 'binary', name: string) => {
        const input = recPreprocess(rgba, w, h, r, kind);
        const output = await rec.run({ [rec.inputNames[0]]: new ort.Tensor('float32', input.data, [1, 3, REC_H, input.rw]) });
        const tensor = output[rec.outputNames[0]], dims = tensor.dims as readonly number[];
        const decoded = ctcDecodeScored(tensor.data as Float32Array, dims[1], dims[2], chars);
        passes.push({ name, text: fixArabicOrder(decoded.text), confidence: decoded.confidence });
      };
      await runPass('original', 'الصورة الأصلية');
      if (mode === 'compare' || passes[0].confidence < 0.94) await runPass('contrast', 'تحسين التباين');
      if (mode === 'compare' || Math.max(...passes.map(x => x.confidence)) < 0.94) await runPass('binary', 'الأبيض والأسود');
      const best = passes.reduce((a, b) => b.confidence > a.confidence ? b : a);
      texts.push(best.text);
      if (mode === 'compare') {
        compareLines.push(passes);
      }
    }
    if (mode === 'compare') {
      const all = compareLines;
      const candidates = ['الصورة الأصلية','تحسين التباين','الأبيض والأسود'].map(name => ({
        engine: 'PaddleOCR عربي — ' + name,
        text: all.map(line => line.find(x => x.name === name)?.text ?? '').filter(Boolean).join('\\n')
      }));
      post({ id, candidates });
    } else post({ id, text: texts.filter(Boolean).join('\\n') });
  } catch (err) {
    post({ id, error: String(err), code: (err as { code?: string }).code ?? 'failed' });
  }
};

// ONNX sessions are shared; process one request at a time to avoid concurrent runs on the same session.
let requestQueue = Promise.resolve();
self.onmessage = (e: MessageEvent) => {
  requestQueue = requestQueue.then(() => handleMessage(e));
};

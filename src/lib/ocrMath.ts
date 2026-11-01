// PP-OCR style pipeline math (detection post-processing, line grouping, recognition input, CTC decoding). No DOM.
import { resizeRGBABilinear } from './maskMath.ts';

export interface Rect { x0: number; y0: number; x1: number; y1: number }
export const REC_H = 48;

/** Detection input: resize to multiples of 32 (long side <= maxSide), BGR, scale 1/255, ImageNet mean/std. */
export function detPreprocess(rgba: Uint8ClampedArray, w: number, h: number, maxSide = 960) {
  const s = Math.min(1, maxSide / Math.max(w, h));
  const dw = Math.max(32, Math.round((w * s) / 32) * 32), dh = Math.max(32, Math.round((h * s) / 32) * 32);
  const px = resizeRGBABilinear(rgba, w, h, dw, dh), plane = dw * dh, data = new Float32Array(3 * plane);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < plane; i++) for (let c = 0; c < 3; c++) data[c * plane + i] = (px[i * 4 + (2 - c)] / 255 - mean[c]) / std[c];
  return { data, dw, dh };
}

/** Connected regions of prob > thresh, each grown a little (the model predicts shrunken text areas). */
export function detBoxes(prob: Float32Array, w: number, h: number, thresh = 0.3, minScore = 0.5): Rect[] {
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h), out: Rect[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || prob[s] <= thresh) continue;
    let sp = 0, x0 = w, y0 = h, x1 = 0, y1 = 0, sum = 0, n = 0;
    stack[sp++] = s; seen[s] = 1;
    while (sp) {
      const i = stack[--sp], x = i % w, y = (i / w) | 0;
      sum += prob[i]; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      const push = (j: number) => { if (!seen[j] && prob[j] > thresh) { seen[j] = 1; stack[sp++] = j; } };
      if (x > 0) push(i - 1); if (x < w - 1) push(i + 1); if (y > 0) push(i - w); if (y < h - 1) push(i + w);
    }
    if (n < 12 || sum / n < minScore) continue;
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1, d = (bw * bh * 1.5) / (2 * (bw + bh));
    out.push({ x0: Math.max(0, x0 - d), y0: Math.max(0, y0 - d), x1: Math.min(w - 1, x1 + d), y1: Math.min(h - 1, y1 + d) });
  }
  return out;
}

/** Merges boxes that sit on the same text line (words -> lines), top to bottom. */
export function groupLines(boxes: Rect[]): Rect[] {
  const lines: Rect[] = [];
  for (const r of [...boxes].sort((a, b) => a.y0 - b.y0)) {
    const L = lines.find((l) => Math.min(l.y1, r.y1) - Math.max(l.y0, r.y0) > 0.5 * Math.min(l.y1 - l.y0, r.y1 - r.y0));
    if (L) { L.x0 = Math.min(L.x0, r.x0); L.x1 = Math.max(L.x1, r.x1); L.y0 = Math.min(L.y0, r.y0); L.y1 = Math.max(L.y1, r.y1); }
    else lines.push({ ...r });
  }
  return lines.sort((a, b) => a.y0 - b.y0);
}

/** Recognition input for one line: height 48, BGR, (v/255 - 0.5) / 0.5. */
export function recPreprocess(rgba: Uint8ClampedArray, w: number, h: number, r: Rect, variant: 'original' | 'contrast' = 'original') {
  // Add a small context margin: cropped dots and edge strokes are common OCR failure causes.
  const mx = Math.max(2, Math.round((r.x1 - r.x0) * 0.025)), my = Math.max(2, Math.round((r.y1 - r.y0) * 0.10));
  const x0 = Math.max(0, Math.floor(r.x0) - mx), y0 = Math.max(0, Math.floor(r.y0) - my);
  const x1 = Math.min(w, Math.ceil(r.x1) + mx), y1 = Math.min(h, Math.ceil(r.y1) + my);
  const cw = Math.max(1, x1 - x0), ch = Math.max(1, y1 - y0);
  const crop = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) crop.set(rgba.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + cw) * 4), y * cw * 4);
  const rw = Math.min(2048, Math.max(16, Math.round((REC_H * cw) / ch))), px = resizeRGBABilinear(crop, cw, ch, rw, REC_H);
  const plane = rw * REC_H, data = new Float32Array(3 * plane);
  let lo = 0, hi = 255;
  if (variant === 'contrast') {
    const hist = new Uint32Array(256);
    for (let i = 0; i < plane; i++) {
      const k = i * 4, gray = Math.round(0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2]);
      hist[gray]++;
    }
    const cut = Math.max(1, Math.floor(plane * 0.02));
    let sum = 0; for (let i = 0; i < 256; i++) { sum += hist[i]; if (sum >= cut) { lo = i; break; } }
    sum = 0; for (let i = 255; i >= 0; i--) { sum += hist[i]; if (sum >= cut) { hi = i; break; } }
    if (hi - lo < 32) { lo = 0; hi = 255; }
  }
  for (let i = 0; i < plane; i++) {
    const k = i * 4;
    if (variant === 'original') {
      for (let chn = 0; chn < 3; chn++) data[chn * plane + i] = (px[k + (2 - chn)] / 255 - 0.5) / 0.5;
    } else {
      const gray = 0.299 * px[k] + 0.587 * px[k + 1] + 0.114 * px[k + 2];
      const stretched = Math.max(0, Math.min(255, ((gray - lo) * 255) / (hi - lo)));
      const v = (stretched / 255 - 0.5) / 0.5;
      data[i] = v; data[plane + i] = v; data[2 * plane + i] = v;
    }
  }
  return { data, rw };
}

/** chars[0] is the CTC blank. Built from the dictionary file: blank + one char per line + space. */
export const buildChars = (dictText: string): string[] => {
  const lines = dictText.split('\n').map((l) => l.replace('\r', ''));
  if (lines[lines.length - 1] === '') lines.pop();
  return ['', ...lines, ' '];
};

export function ctcDecodeScored(logits: Float32Array, T: number, C: number, chars: string[]): { text: string; confidence: number } {
  let prev = -1, out = '', score = 0, count = 0;
  for (let t = 0; t < T; t++) {
    let best = 0, bv = -Infinity, maxLogit = -Infinity;
    for (let c = 0; c < C; c++) { const v = logits[t * C + c]; if (v > bv) { bv = v; best = c; } if (v > maxLogit) maxLogit = v; }
    let denom = 0;
    for (let c = 0; c < C; c++) denom += Math.exp(logits[t * C + c] - maxLogit);
    const confidence = denom ? Math.exp(bv - maxLogit) / denom : 0;
    score += confidence; count++;
    if (best !== 0 && best !== prev) out += chars[best] ?? '';
    prev = best;
  }
  return { text: out, confidence: count ? score / count : 0 };
}

export function ctcDecode(logits: Float32Array, T: number, C: number, chars: string[]): string {
  let prev = -1, out = '';
  for (let t = 0; t < T; t++) {
    let best = 0, bv = -Infinity;
    for (let c = 0; c < C; c++) if (logits[t * C + c] > bv) { bv = logits[t * C + c]; best = c; }
    if (best !== 0 && best !== prev) out += chars[best] ?? '';
    prev = best;
  }
  return out;
}

/** Arabic comes out in drawn (left-to-right) order: reverse it, then put Latin/number runs back. */
export function fixArabicOrder(s: string): string {
  if (!/[\u0600-\u06FF]/.test(s)) return s;
  return [...s].reverse().join('').replace(/[A-Za-z0-9][A-Za-z0-9.,:%/@-]*/g, (m) => [...m].reverse().join(''));
}

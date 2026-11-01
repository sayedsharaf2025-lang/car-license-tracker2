// Pure image/mask math. No DOM, so it runs in the worker, the UI and Node tests.

export const MODEL_SIZE = 320;
const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

export function fitSize(w: number, h: number, maxSide: number): { w: number; h: number } {
  const s = Math.min(1, maxSide / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

export function resizeRGBABilinear(
  src: Uint8ClampedArray, sw: number, sh: number, dw: number, dh: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dw * dh * 4);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, (y + 0.5) * yr - 0.5);
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, (x + 0.5) * xr - 0.5);
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), wx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const a = src[(y0 * sw + x0) * 4 + c], b = src[(y0 * sw + x1) * 4 + c];
        const d = src[(y1 * sw + x0) * 4 + c], e = src[(y1 * sw + x1) * 4 + c];
        out[(y * dw + x) * 4 + c] = (a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy;
      }
    }
  }
  return out;
}

export function resizeMaskBilinear(
  src: Uint8Array, sw: number, sh: number, dw: number, dh: number,
): Uint8Array {
  const out = new Uint8Array(dw * dh);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const fy = Math.max(0, (y + 0.5) * yr - 0.5);
    const y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), wy = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = Math.max(0, (x + 0.5) * xr - 0.5);
      const x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), wx = fx - x0;
      const a = src[y0 * sw + x0], b = src[y0 * sw + x1], d = src[y1 * sw + x0], e = src[y1 * sw + x1];
      out[y * dw + x] = Math.round((a * (1 - wx) + b * wx) * (1 - wy) + (d * (1 - wx) + e * wx) * wy);
    }
  }
  return out;
}

/** U2-Net style input: RGBA (already MODEL_SIZE square) -> float32 NCHW, scaled by max then mean/std. */
export function toTensorNCHW(rgba: Uint8ClampedArray, w: number, h: number): Float32Array {
  let max = 1e-6;
  for (let i = 0; i < w * h; i++) {
    max = Math.max(max, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  }
  const plane = w * h;
  const out = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) {
      out[c * plane + i] = (rgba[i * 4 + c] / max - MEAN[c]) / STD[c];
    }
  }
  return out;
}

/** Model output (first channel) -> 0..255 mask using min-max normalisation. */
export function postprocessMask(pred: Float32Array): Uint8Array {
  let mi = Infinity, ma = -Infinity;
  for (const v of pred) { if (v < mi) mi = v; if (v > ma) ma = v; }
  const range = ma - mi || 1;
  const out = new Uint8Array(pred.length);
  for (let i = 0; i < pred.length; i++) out[i] = Math.round(((pred[i] - mi) / range) * 255);
  return out;
}

/** Writes RGB from `rgba` and alpha from `mask` into `out` (same size). */
export function compositeCutout(rgba: Uint8ClampedArray, mask: Uint8Array, out: Uint8ClampedArray): void {
  for (let i = 0; i < mask.length; i++) {
    out[i * 4] = rgba[i * 4];
    out[i * 4 + 1] = rgba[i * 4 + 1];
    out[i * 4 + 2] = rgba[i * 4 + 2];
    out[i * 4 + 3] = Math.round((rgba[i * 4 + 3] * mask[i]) / 255);
  }
}

export type BrushMode = 'erase' | 'restore';

/** Soft round brush. hardness 0..1 (1 = hard edge). Returns the dirty rectangle. */
export function paintBrush(
  mask: Uint8Array, w: number, h: number, cx: number, cy: number,
  radius: number, hardness: number, mode: BrushMode,
): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = Math.max(0, Math.floor(cx - radius)), x1 = Math.min(w - 1, Math.ceil(cx + radius));
  const y0 = Math.max(0, Math.floor(cy - radius)), y1 = Math.min(h - 1, Math.ceil(cy + radius));
  const inner = radius * Math.min(1, Math.max(0, hardness));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d > radius) continue;
      const t = d <= inner ? 1 : radius === inner ? 0 : 1 - (d - inner) / (radius - inner);
      const i = y * w + x, m = mask[i];
      mask[i] = mode === 'erase' ? Math.round(m * (1 - t)) : Math.round(m + (255 - m) * t);
    }
  }
  return { x0, y0, x1, y1 };
}

/** Converts a confidence mask to a binary 0/255 selection at the chosen threshold. */
export function thresholdMask(mask: Uint8Array, threshold = 128): Uint8Array {
  const t = Math.max(0, Math.min(255, Math.round(threshold)));
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] >= t ? 255 : 0;
  return out;
}

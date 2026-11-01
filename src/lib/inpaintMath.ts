// Pure helpers around inpainting and text boxes (no DOM, so they run in Node tests).
import type { Rect } from './ocrMath.ts';

export interface IRect { x0: number; y0: number; x1: number; y1: number } // x1/y1 exclusive

/** Bounding box of the non-zero pixels (x1/y1 exclusive), or null if the mask is empty. */
export function maskBBox(m: Uint8Array, w: number, h: number): IRect | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1: x1 + 1, y1: y1 + 1 };
}

/** Grows a 0/1 mask by `r` pixels (square structuring element, separable, O(n)). */
export function dilate(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  if (r <= 0) return m.slice();
  const tmp = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    let last = -1e9;
    const row = y * w, near = new Int32Array(w);
    for (let x = 0; x < w; x++) { if (m[row + x]) last = x; near[x] = last; }
    let next = 1e9;
    for (let x = w - 1; x >= 0; x--) { if (m[row + x]) next = x; if (x - near[x] <= r || next - x <= r) tmp[row + x] = 1; }
  }
  for (let x = 0; x < w; x++) {
    let last = -1e9;
    const near = new Int32Array(h);
    for (let y = 0; y < h; y++) { if (tmp[y * w + x]) last = y; near[y] = last; }
    let next = 1e9;
    for (let y = h - 1; y >= 0; y--) { if (tmp[y * w + x]) next = y; if (y - near[y] <= r || next - y <= r) out[y * w + x] = 1; }
  }
  return out;
}

/** Area around the hole that the model gets to see: the hole box plus context on every side, clamped to the image. */
export function contextRegion(b: IRect, w: number, h: number, minMargin = 48, ratio = 0.6): IRect {
  const m = Math.max(minMargin, Math.round(ratio * Math.max(b.x1 - b.x0, b.y1 - b.y0)));
  return { x0: Math.max(0, b.x0 - m), y0: Math.max(0, b.y0 - m), x1: Math.min(w, b.x1 + m), y1: Math.min(h, b.y1 + m) };
}

export function cropRGBA(src: Uint8ClampedArray, w: number, r: IRect): Uint8ClampedArray {
  const cw = r.x1 - r.x0, ch = r.y1 - r.y0, out = new Uint8ClampedArray(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(src.subarray(((r.y0 + y) * w + r.x0) * 4, ((r.y0 + y) * w + r.x1) * 4), y * cw * 4);
  return out;
}

export function cropMask(src: Uint8Array, w: number, r: IRect): Uint8Array {
  const cw = r.x1 - r.x0, ch = r.y1 - r.y0, out = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) out.set(src.subarray((r.y0 + y) * w + r.x0, (r.y0 + y) * w + r.x1), y * cw);
  return out;
}

/** Copies `patch` (region-sized RGBA) into `dst` only where `hole` (full-size, 1 = hole) is set. */
export function pasteHole(dst: Uint8ClampedArray, w: number, r: IRect, patch: Uint8ClampedArray, hole: Uint8Array): void {
  const cw = r.x1 - r.x0;
  for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) {
    if (!hole[y * w + x]) continue;
    const s = ((y - r.y0) * cw + (x - r.x0)) * 4, d = (y * w + x) * 4;
    dst[d] = patch[s]; dst[d + 1] = patch[s + 1]; dst[d + 2] = patch[s + 2]; dst[d + 3] = 255;
  }
}

/** RGBA -> planar RGB uint8 (NCHW without the batch axis), what the MI-GAN pipeline wants. */
export function rgbaToPlanarRGB(rgba: Uint8ClampedArray, n: number): Uint8Array {
  const out = new Uint8Array(3 * n);
  for (let i = 0; i < n; i++) { out[i] = rgba[i * 4]; out[n + i] = rgba[i * 4 + 1]; out[2 * n + i] = rgba[i * 4 + 2]; }
  return out;
}

export function planarRGBToRGBA(p: Uint8Array, n: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { out[i * 4] = p[i]; out[i * 4 + 1] = p[n + i]; out[i * 4 + 2] = p[2 * n + i]; out[i * 4 + 3] = 255; }
  return out;
}

/** MI-GAN mask: 255 = keep, 0 = fill (from the model's README). `hole` is 1 where pixels must be filled. */
export function migMask(hole: Uint8Array): Uint8Array {
  const out = new Uint8Array(hole.length);
  for (let i = 0; i < hole.length; i++) out[i] = hole[i] ? 0 : 255;
  return out;
}

export function padRect(r: Rect, pad: number, w: number, h: number): IRect {
  return { x0: Math.max(0, Math.floor(r.x0 - pad)), y0: Math.max(0, Math.floor(r.y0 - pad)), x1: Math.min(w, Math.ceil(r.x1 + pad)), y1: Math.min(h, Math.ceil(r.y1 + pad)) };
}

/** Fills the rectangles into a 0/255 mask (the object-removal brush mask format). */
export function paintRects(mask: Uint8Array, w: number, h: number, rects: IRect[]): void {
  for (const r of rects) for (let y = Math.max(0, r.y0); y < Math.min(h, r.y1); y++) mask.fill(255, y * w + Math.max(0, r.x0), y * w + Math.min(w, r.x1));
}

/** Average colour (#rrggbb) of the "ink" pixels (1 in `ink`) of an RGBA crop. Falls back to black. */
export function inkColor(rgba: Uint8ClampedArray, ink: Uint8Array): string {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < ink.length; i++) if (ink[i]) { r += rgba[i * 4]; g += rgba[i * 4 + 1]; b += rgba[i * 4 + 2]; n++; }
  if (!n) return '#000000';
  const hx = (v: number) => Math.round(v / n).toString(16).padStart(2, '0');
  return `#${hx(r)}${hx(g)}${hx(b)}`;
}

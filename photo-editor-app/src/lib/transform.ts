// Crop (any shape) and resize applied to the whole project: original photo, working copy, cutout mask and text layers stay in step.
import { workingCopy } from './image.ts';
import { resizeMaskBilinear } from './maskMath.ts';
import { remapText, type CRect } from './geometry.ts';
import { shapeAlpha, type Shape, type Pt } from './shapes.ts';
import type { Project } from '../data/store.ts';

function snapshot(p: Project): void {
  p.prev = { bitmap: p.bitmap, w: p.w, h: p.h, rgba: p.rgba, mask: p.mask, texts: p.texts.map((t) => ({ ...t })) };
}

/** Puts back the state from before the last crop/resize. Returns false if there is nothing to undo. */
export function undoGeometry(p: Project): boolean {
  const s = p.prev;
  if (!s) return false;
  p.bitmap = s.bitmap; p.w = s.w; p.h = s.h; p.rgba = s.rgba; p.mask = s.mask; p.texts = s.texts; p.prev = null;
  return true;
}

/**
 * Crops to `c` (working-image pixels). Pixels come from the full-size original, so no quality is lost.
 * A non-rectangular shape becomes transparency (it is folded into the cutout mask), so the edges stay clean at export size.
 * `pts` is the freehand outline in working-image pixels (only for shape 'free').
 */
export async function cropProject(p: Project, c: CRect, shape: Shape, round: number, pts: Pt[]): Promise<void> {
  const W = p.w, H = p.h, kx = p.bitmap.width / W, ky = p.bitmap.height / H;
  const fx0 = Math.max(0, Math.round(c.x0 * kx)), fy0 = Math.max(0, Math.round(c.y0 * ky));
  const fw = Math.max(1, Math.min(p.bitmap.width - fx0, Math.round((c.x1 - c.x0) * kx)));
  const fh = Math.max(1, Math.min(p.bitmap.height - fy0, Math.round((c.y1 - c.y0) * ky)));
  const cv = document.createElement('canvas'); cv.width = fw; cv.height = fh;
  cv.getContext('2d')!.drawImage(p.bitmap, fx0, fy0, fw, fh, 0, 0, fw, fh);
  const bitmap = await createImageBitmap(cv);
  const wc = workingCopy(bitmap);

  const rx0 = Math.max(0, Math.round(c.x0)), ry0 = Math.max(0, Math.round(c.y0));
  const rw = Math.max(1, Math.min(W - rx0, Math.round(c.x1 - c.x0))), rh = Math.max(1, Math.min(H - ry0, Math.round(c.y1 - c.y0)));
  let mask: Uint8Array | null = null;
  if (p.mask) {
    const region = new Uint8Array(rw * rh);
    for (let y = 0; y < rh; y++) region.set(p.mask.subarray((ry0 + y) * W + rx0, (ry0 + y) * W + rx0 + rw), y * rw);
    mask = resizeMaskBilinear(region, rw, rh, wc.w, wc.h);
  }
  if (shape !== 'rect') {
    const sx = wc.w / (c.x1 - c.x0), sy = wc.h / (c.y1 - c.y0);
    const alpha = shapeAlpha(shape, wc.w, wc.h, round, pts.map((q) => ({ x: (q.x - c.x0) * sx, y: (q.y - c.y0) * sy })));
    if (mask) for (let i = 0; i < mask.length; i++) mask[i] = Math.round((mask[i] * alpha[i]) / 255);
    else mask = alpha;
  }
  snapshot(p);
  const texts = p.texts.map((t) => remapText(t, W, H, c));
  p.bitmap = bitmap; p.w = wc.w; p.h = wc.h; p.rgba = wc.rgba; p.mask = mask; p.texts = texts;
}

/** Scales the photo to nw x nh pixels (the ratio may change). */
export async function resizeProject(p: Project, nw: number, nh: number): Promise<void> {
  const bitmap = await createImageBitmap(p.bitmap, { resizeWidth: nw, resizeHeight: nh, resizeQuality: 'high' });
  const wc = workingCopy(bitmap);
  const mask = p.mask ? resizeMaskBilinear(p.mask, p.w, p.h, wc.w, wc.h) : null;
  snapshot(p);
  p.bitmap = bitmap; p.w = wc.w; p.h = wc.h; p.rgba = wc.rgba; p.mask = mask;
}

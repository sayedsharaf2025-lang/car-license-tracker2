// Pure geometry for crop / resize. No DOM.
import type { TextLayer } from './scene.ts';

export interface CRect { x0: number; y0: number; x1: number; y1: number }
export type Corner = 'tl' | 'tr' | 'bl' | 'br';
export const MIN_CROP = 24;

export function clampRect(r: CRect, W: number, H: number): CRect {
  const x0 = Math.max(0, Math.min(W - MIN_CROP, Math.min(r.x0, r.x1))), x1 = Math.min(W, Math.max(x0 + MIN_CROP, Math.max(r.x0, r.x1)));
  const y0 = Math.max(0, Math.min(H - MIN_CROP, Math.min(r.y0, r.y1))), y1 = Math.min(H, Math.max(y0 + MIN_CROP, Math.max(r.y0, r.y1)));
  return { x0, y0, x1, y1 };
}

export function moveRect(r: CRect, dx: number, dy: number, W: number, H: number): CRect {
  const w = r.x1 - r.x0, h = r.y1 - r.y0;
  const x0 = Math.max(0, Math.min(W - w, r.x0 + dx)), y0 = Math.max(0, Math.min(H - h, r.y0 + dy));
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

export function nearestCorner(r: CRect, x: number, y: number, tol: number): Corner | null {
  const cs: [Corner, number, number][] = [['tl', r.x0, r.y0], ['tr', r.x1, r.y0], ['bl', r.x0, r.y1], ['br', r.x1, r.y1]];
  let best: Corner | null = null, bd = tol;
  for (const [c, cx, cy] of cs) { const d = Math.hypot(x - cx, y - cy); if (d <= bd) { bd = d; best = c; } }
  return best;
}

/** Drags `corner` to (x, y). With `aspect` (w/h) the box keeps that ratio, anchored at the opposite corner. */
export function dragCorner(r: CRect, corner: Corner, x: number, y: number, aspect: number | null, W: number, H: number): CRect {
  const ax = corner === 'tl' || corner === 'bl' ? r.x1 : r.x0, ay = corner === 'tl' || corner === 'tr' ? r.y1 : r.y0;
  let dx = Math.max(MIN_CROP, Math.abs(x - ax)), dy = Math.max(MIN_CROP, Math.abs(y - ay));
  const sx = x >= ax ? 1 : -1, sy = y >= ay ? 1 : -1;
  const maxX = sx > 0 ? W - ax : ax, maxY = sy > 0 ? H - ay : ay;
  dx = Math.min(dx, maxX); dy = Math.min(dy, maxY);
  if (aspect) {
    if (dx / dy > aspect) dx = dy * aspect; else dy = dx / aspect;
    if (dx > maxX) { dx = maxX; dy = dx / aspect; }
    if (dy > maxY) { dy = maxY; dx = dy * aspect; }
  }
  return clampRect({ x0: ax, y0: ay, x1: ax + sx * dx, y1: ay + sy * dy }, W, H);
}

/** Largest centred box with the given aspect (w/h) inside W x H. */
export function aspectBox(aspect: number, W: number, H: number): CRect {
  let w = W, h = W / aspect;
  if (h > H) { h = H; w = H * aspect; }
  const x0 = (W - w) / 2, y0 = (H - h) / 2;
  return { x0, y0, x1: x0 + w, y1: y0 + h };
}

export function polyBBox(pts: { x: number; y: number }[]): CRect | null {
  if (pts.length < 3) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return x1 - x0 < 2 || y1 - y0 < 2 ? null : { x0, y0, x1, y1 };
}

/** Text layers store position and size as fractions of the canvas; re-express them for a cropped canvas. */
export function remapText(l: TextLayer, W: number, H: number, c: CRect): TextLayer {
  const cw = c.x1 - c.x0, ch = c.y1 - c.y0;
  return { ...l, cx: (l.cx * W - c.x0) / cw, cy: (l.cy * H - c.y0) / ch, size: (l.size * W) / cw };
}

/** New pixel size from the width/height fields. With `lock` the other side follows the original ratio. */
export function resizeDims(ow: number, oh: number, w: number | null, h: number | null, lock: boolean, maxSide = 4096): { w: number; h: number } {
  let nw = w ?? ow, nh = h ?? oh;
  if (lock) { if (w !== null && (h === null || w !== ow)) nh = Math.round((w * oh) / ow); else if (h !== null) nw = Math.round((h * ow) / oh); }
  const s = Math.min(1, maxSide / Math.max(nw, nh));
  return { w: Math.max(1, Math.round(nw * s)), h: Math.max(1, Math.round(nh * s)) };
}

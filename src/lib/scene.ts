import { FONTS, isArabic, fontCss } from './fonts.ts';

// Scene drawing shared by the editor canvas and the exporter. Text sizes and positions are fractions of the canvas, so they scale to any size.
export interface TextLayer { id: string; text: string; font: string; size: number; color: string; cx: number; cy: number }
export type Background = { kind: 'transparent' } | { kind: 'color'; color: string } | { kind: 'image'; bitmap: ImageBitmap };
export interface Box { id: string; x0: number; y0: number; x1: number; y1: number }

export { FONTS, isArabic };

/** Source rectangle that makes an image cover a W x H area (centered crop). */
export function coverRect(iw: number, ih: number, W: number, H: number) {
  const s = Math.max(W / iw, H / ih), sw = W / s, sh = H / s;
  return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh };
}

/** Topmost text box under the point, or null. */
export function hitTest(boxes: Box[], x: number, y: number): string | null {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) return b.id;
  }
  return null;
}

export function drawScene(
  ctx: CanvasRenderingContext2D, W: number, H: number,
  bg: Background, cut: CanvasImageSource | null, texts: TextLayer[],
): Box[] {
  ctx.clearRect(0, 0, W, H);
  if (bg.kind === 'color') { ctx.fillStyle = bg.color; ctx.fillRect(0, 0, W, H); }
  else if (bg.kind === 'image') {
    const r = coverRect(bg.bitmap.width, bg.bitmap.height, W, H);
    ctx.drawImage(bg.bitmap, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
  }
  if (cut) ctx.drawImage(cut, 0, 0, W, H);
  const boxes: Box[] = [];
  for (const t of texts) {
    const px = t.size * W, lh = px * 1.3, lines = t.text.split('\n');
    ctx.font = fontCss(t.font, px);
    ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.direction = isArabic(t.text) ? 'rtl' : 'ltr';
    const top = t.cy * H - ((lines.length - 1) * lh) / 2;
    let maxW = 1;
    lines.forEach((l, i) => { ctx.fillText(l, t.cx * W, top + i * lh); maxW = Math.max(maxW, ctx.measureText(l).width); });
    boxes.push({ id: t.id, x0: t.cx * W - maxW / 2, x1: t.cx * W + maxW / 2, y0: top - lh / 2, y1: top + (lines.length - 1) * lh + lh / 2 });
  }
  return boxes;
}

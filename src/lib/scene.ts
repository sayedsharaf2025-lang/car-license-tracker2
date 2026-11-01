import { FONTS, isArabic, fontCss } from './fonts.ts';

// Scene drawing shared by the editor canvas and the exporter. Text sizes and positions are fractions of the canvas, so they scale to any size.
export interface TextLayer { id: string; text: string; font: string; size: number; color: string; cx: number; cy: number; rotation?: number; visible?: boolean; align?: 'left' | 'center' | 'right'; shadowColor?: string; shadowBlur?: number; strokeColor?: string; strokeWidth?: number }
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
    if (t.visible === false) continue;
    const px = t.size * W, lh = px * 1.3, lines = t.text.split(/\r?\n/);
    ctx.font = fontCss(t.font, px);
    ctx.fillStyle = t.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = t.shadowColor ?? 'transparent'; ctx.shadowBlur = t.shadowBlur ?? 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
    ctx.direction = isArabic(t.text) ? 'rtl' : 'ltr';
    const cx = t.cx * W, cy = t.cy * H, top = -((lines.length - 1) * lh) / 2;
    let maxW = 1;
    lines.forEach((line) => { maxW = Math.max(maxW, ctx.measureText(line).width); });
    const halfW = maxW / 2, halfH = (lines.length * lh) / 2, angle = (t.rotation ?? 0) * Math.PI / 180;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(angle);
    lines.forEach((line, i) => {
      const width = ctx.measureText(line).width;
      const x = t.align === 'left' ? -maxW / 2 + width / 2 : t.align === 'right' ? maxW / 2 - width / 2 : 0;
      if ((t.strokeWidth ?? 0) > 0) { ctx.lineWidth = t.strokeWidth! * Math.max(1, px / 24); ctx.lineJoin = 'round'; ctx.strokeStyle = t.strokeColor ?? '#000000'; ctx.strokeText(line, x, top + i * lh); }
      ctx.fillText(line, x, top + i * lh);
    });
    ctx.restore();
    const corners = [[-halfW,-halfH],[halfW,-halfH],[halfW,halfH],[-halfW,halfH]].map(([x,y]) => ({ x: cx + x*Math.cos(angle)-y*Math.sin(angle), y: cy + x*Math.sin(angle)+y*Math.cos(angle) }));
    boxes.push({ id: t.id, x0: Math.min(...corners.map(q=>q.x)), x1: Math.max(...corners.map(q=>q.x)), y0: Math.min(...corners.map(q=>q.y)), y1: Math.max(...corners.map(q=>q.y)) });
  }
  return boxes;
}

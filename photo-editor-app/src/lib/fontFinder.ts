import { toGray, inkMask, normalizeInk, rankFonts } from './fontMatch.ts';
import { fontsFor, fontCss, isArabic, loadFont } from './fonts.ts';

export interface Sel { x0: number; y0: number; x1: number; y1: number }

function renderShape(font: string, text: string) {
  const px = 90, lh = px * 1.3, lines = text.split('\n');
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = fontCss(font, px);
  const w = Math.ceil(Math.max(...lines.map((l) => probe.measureText(l).width))) + 60, h = Math.ceil(lh * lines.length) + 40;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#000'; ctx.font = fontCss(font, px); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.direction = isArabic(text) ? 'rtl' : 'ltr';
  lines.forEach((l, i) => ctx.fillText(l, w / 2, 20 + lh * i + lh / 2));
  return normalizeInk(inkMask(toGray(ctx.getImageData(0, 0, w, h).data, w * h)), w, h);
}

/** Copies the selected rectangle out of an RGBA image. */
export function cropSel(rgba: Uint8ClampedArray, W: number, sel: Sel) {
  const x0 = Math.floor(Math.min(sel.x0, sel.x1)), y0 = Math.floor(Math.min(sel.y0, sel.y1));
  const w = Math.max(1, Math.ceil(Math.abs(sel.x1 - sel.x0))), h = Math.max(1, Math.ceil(Math.abs(sel.y1 - sel.y0)));
  const crop = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y0 + y) * W + (x0 + x)) * 4, d = (y * w + x) * 4;
    crop[d] = rgba[s]; crop[d + 1] = rgba[s + 1]; crop[d + 2] = rgba[s + 2]; crop[d + 3] = 255;
  }
  return { crop, w, h };
}

/** Returns the bundled fonts ordered by how closely `text` drawn in them matches the selected area. Empty if the area has no readable shape. */
export async function findFonts(rgba: Uint8ClampedArray, W: number, sel: Sel, text: string) {
  const { crop, w, h } = cropSel(rgba, W, sel);
  const query = normalizeInk(inkMask(toGray(crop, w * h)), w, h);
  if (!query) return [];
  const names = fontsFor(text);
  await Promise.all(names.map((f) => loadFont(f)));
  const cands = names.map((font) => ({ font, shape: renderShape(font, text) })).filter((c): c is { font: string; shape: NonNullable<ReturnType<typeof renderShape>> } => !!c.shape);
  return rankFonts(query, cands);
}

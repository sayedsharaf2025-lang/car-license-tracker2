import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inkMask, normalizeInk, rankFonts } from '../src/lib/fontMatch.ts';
import { inpaint } from '../src/lib/inpaint.ts';

function img(w: number, h: number, ink: (x: number, y: number) => boolean, light = false) {
  const g = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = ink(x, y) === light ? 0 : 255;
  return normalizeInk(inkMask(g), w, h)!;
}
test('ranking picks the same shape, also when polarity is inverted and size differs', () => {
  const wide = img(80, 40, (x, y) => x > 10 && x < 70 && y > 15 && y < 25);
  const tall = img(40, 80, (x, y) => x > 15 && x < 25 && y > 10 && y < 70);
  const query = img(160, 80, (x, y) => x > 20 && x < 140 && y > 30 && y < 50, true); // wide shape, light on dark, bigger
  const r = rankFonts(query, [{ font: 'tall', shape: tall }, { font: 'wide', shape: wide }]);
  assert.equal(r[0].font, 'wide'); assert.ok(r[0].score > r[1].score);
});
test('blank area gives no shape', () => { assert.equal(normalizeInk(new Uint8Array(100), 10, 10), null); });
test('inpaint restores a flat colour hole', () => {
  const w = 10, h = 10, px = new Uint8ClampedArray(w * h * 4), hole = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) { px[i * 4] = 100; px[i * 4 + 1] = 150; px[i * 4 + 2] = 200; px[i * 4 + 3] = 255; }
  for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) { hole[y * w + x] = 1; px[(y * w + x) * 4] = 0; }
  inpaint(px, w, h, hole);
  assert.equal(px[(5 * w + 5) * 4], 100); assert.equal(px[(4 * w + 4) * 4 + 2], 200);
});
test('inpaint with no known pixels does not hang', () => { inpaint(new Uint8ClampedArray(16), 2, 2, new Uint8Array(4).fill(1)); assert.ok(true); });

test('normalization preserves glyph proportions instead of stretching tall letters wide', () => {
  const m = new Uint8Array(100 * 100);
  for (let y = 10; y < 90; y++) for (let x = 45; x < 55; x++) m[y * 100 + x] = 1;
  const n = normalizeInk(m, 100, 100)!;
  let x0 = 160, x1 = -1, y0 = 64, y1 = -1;
  for (let y = 0; y < 64; y++) for (let x = 0; x < 160; x++) if (n.ink[y * 160 + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const ratio = (x1 - x0 + 1) / (y1 - y0 + 1);
  assert.ok(ratio < 0.3, 'a narrow vertical glyph remains narrow');
});
test('adaptive threshold detects dark strokes over a brightness gradient', () => {
  const w = 100, h = 40, gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = y >= 18 && y <= 21 ? 20 : Math.round(80 + x * 1.35);
  const m = inkMask(gray, w, h);
  assert.equal(m[20 * w + 5], 1);
  assert.equal(m[20 * w + 95], 1);
});
test('adaptive threshold also detects light strokes on a dark background', () => {
  const w = 100, h = 40, gray = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) gray[y * w + x] = y >= 18 && y <= 21 ? 245 : Math.round(180 - x * 1.1);
  const m = inkMask(gray, w, h);
  assert.equal(m[20 * w + 5], 1);
  assert.equal(m[20 * w + 95], 1);
});

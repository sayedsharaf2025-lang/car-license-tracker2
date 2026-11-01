import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detBoxes, groupLines, ctcDecode, buildChars, fixArabicOrder, recPreprocess, detPreprocess } from '../src/lib/ocrMath.ts';

test('two words on one line become one line box; a lower line stays separate', () => {
  const w = 100, h = 60, p = new Float32Array(w * h);
  const blob = (x0: number, y0: number, x1: number, y1: number) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) p[y * w + x] = 0.9; };
  blob(10, 10, 30, 20); blob(40, 11, 70, 21); blob(10, 40, 50, 50);
  const lines = groupLines(detBoxes(p, w, h));
  assert.equal(lines.length, 2);
  assert.ok(lines[0].x0 < 12 && lines[0].x1 > 68);
});
test('weak or tiny regions are ignored', () => { const p = new Float32Array(400).fill(0.35); assert.equal(detBoxes(p, 20, 20).length, 0); });
test('ctcDecode collapses repeats and blanks', () => {
  const chars = buildChars('a\nb\n'); // ['', a, b, ' ']
  const C = 4, seq = [1, 1, 0, 1, 2, 2, 0]; // a a _ a b b _  -> "aab"
  const l = new Float32Array(seq.length * C); seq.forEach((c, t) => { l[t * C + c] = 5; });
  assert.equal(ctcDecode(l, seq.length, C, chars), 'aab');
});
test('fixArabicOrder reverses Arabic but keeps numbers readable', () => {
  assert.equal(fixArabicOrder('hello 12'), 'hello 12');
  assert.equal(fixArabicOrder('ab 12 \u0628\u0627'), '\u0627\u0628 12 ab'); // Latin and number runs keep their own order
});
test('preprocess shapes', () => {
  const rgba = new Uint8ClampedArray(200 * 100 * 4).fill(128);
  const d = detPreprocess(rgba, 200, 100); assert.equal(d.dw % 32, 0); assert.equal(d.data.length, 3 * d.dw * d.dh);
  const r = recPreprocess(rgba, 200, 100, { x0: 0, y0: 0, x1: 200, y1: 100 }); assert.equal(r.data.length, 3 * 48 * r.rw);
});

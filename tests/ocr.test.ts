import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detBoxes, groupLines, ctcDecode, ctcDecodeScored, buildChars, fixArabicOrder, recPreprocess, detPreprocess } from '../src/lib/ocrMath.ts';

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
test('Arabic combining marks stay attached to letters after order correction', () => {
  assert.equal(fixArabicOrder('َا'), 'اَ');
});
test('preprocess shapes', () => {
  const rgba = new Uint8ClampedArray(200 * 100 * 4).fill(128);
  const d = detPreprocess(rgba, 200, 100); assert.equal(d.dw % 32, 0); assert.equal(d.data.length, 3 * d.dw * d.dh);
  const r = recPreprocess(rgba, 200, 100, { x0: 0, y0: 0, x1: 200, y1: 100 }); assert.equal(r.data.length, 3 * 48 * r.rw);
});

test('scored CTC decoder returns text and a bounded confidence', () => {
  const chars = buildChars('ا\nب\n');
  const seq = [1, 1, 0, 2], C = 4, logits = new Float32Array(seq.length * C);
  seq.forEach((v, i) => { logits[i * C + v] = 8; });
  const out = ctcDecodeScored(logits, seq.length, C, chars);
  assert.equal(out.text, 'اب');
  assert.ok(out.confidence > 0.9 && out.confidence <= 1);
});
test('confident CTC blanks do not hide uncertain character predictions', () => {
  const chars = buildChars('ا\\nب\\n'), C = 3, logits = new Float32Array(4 * C);
  // Three confident blanks and one ambiguous non-blank character.
  logits[0] = 9; logits[C] = 9; logits[2 * C] = 9;
  logits[3 * C + 1] = 1; logits[3 * C + 2] = 0.9;
  const out = ctcDecodeScored(logits, 4, C, chars);
  assert.ok(out.confidence < 0.9);
});
test('recognition preprocessing adds crop margins and creates enhanced contrast variant', () => {
  const w = 200, h = 100, rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { const v = i % w > 80 && i % w < 120 ? 40 : 210; rgba[i * 4] = v; rgba[i * 4 + 1] = v; rgba[i * 4 + 2] = v; rgba[i * 4 + 3] = 255; }
  const rect = { x0: 90, y0: 30, x1: 110, y1: 70 };
  const original = recPreprocess(rgba, w, h, rect, 'original');
  const contrast = recPreprocess(rgba, w, h, rect, 'contrast');
  assert.ok(original.rw > 16);
  assert.equal(contrast.data.length, original.data.length);
  assert.ok(contrast.data.every(Number.isFinite));
});

test('binary OCR preprocessing handles uneven grayscale and stays finite', () => {
  const w = 120, h = 36, rgba = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, paper = 175 + Math.round(x * 0.35), ink = x > 35 && x < 82 && y > 9 && y < 27;
    const v = ink ? 55 : Math.min(245, paper);
    rgba[i] = rgba[i + 1] = rgba[i + 2] = v; rgba[i + 3] = 255;
  }
  const binary = recPreprocess(rgba, w, h, { x0: 0, y0: 0, x1: w, y1: h }, 'binary');
  assert.ok(binary.data.every(v => Number.isFinite(v)));
  assert.ok(binary.data.some(v => v < -0.9));
  assert.ok(binary.data.some(v => v > 0.9));
});

test('fixArabicOrder preserves Arabic-Indic and Persian digit runs in mixed Arabic text', () => {
  assert.equal(fixArabicOrder('ab ١٢ با'), 'اب ١٢ ba');
  assert.equal(fixArabicOrder('ab ۱۲ با'), 'اب ۱۲ ba');
  assert.equal(fixArabicOrder('ab +١٢٫٥ با'), 'اب +١٢٫٥ ba');
});

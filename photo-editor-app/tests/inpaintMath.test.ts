import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  maskBBox, dilate, contextRegion, cropRGBA, cropMask, pasteHole, rgbaToPlanarRGB, planarRGBToRGBA, migMask, padRect, paintRects, inkColor,
} from '../src/lib/inpaintMath.ts';

test('maskBBox: exclusive box around set pixels, null when empty', () => {
  const m = new Uint8Array(5 * 4); m[1 * 5 + 2] = 1; m[2 * 5 + 3] = 1;
  assert.deepEqual(maskBBox(m, 5, 4), { x0: 2, y0: 1, x1: 4, y1: 3 });
  assert.equal(maskBBox(new Uint8Array(20), 5, 4), null);
});

test('dilate grows a single pixel into a (2r+1) square and stays inside the image', () => {
  const w = 9, h = 9, m = new Uint8Array(w * h); m[4 * w + 4] = 1;
  const d = dilate(m, w, h, 2);
  let n = 0; for (const v of d) n += v;
  assert.equal(n, 25);
  assert.equal(d[2 * w + 2], 1); assert.equal(d[1 * w + 1], 0);
  const edge = new Uint8Array(w * h); edge[0] = 1;
  assert.equal(dilate(edge, w, h, 1).reduce((a, b) => a + b, 0), 4);
});

test('contextRegion adds margin and clamps to the image', () => {
  const r = contextRegion({ x0: 10, y0: 10, x1: 30, y1: 20 }, 100, 60);
  assert.deepEqual(r, { x0: 0, y0: 0, x1: 78, y1: 60 });
});

test('crop + paste: only hole pixels change, everything else is untouched', () => {
  const w = 6, h = 6, img = new Uint8ClampedArray(w * h * 4).fill(10);
  const hole = new Uint8Array(w * h); hole[2 * w + 2] = 1; hole[2 * w + 3] = 1;
  const r = { x0: 1, y0: 1, x1: 5, y1: 4 };
  const patch = new Uint8ClampedArray(4 * 3 * 4).fill(200);
  assert.equal(cropRGBA(img, w, r).length, 4 * 3 * 4);
  assert.equal(cropMask(hole, w, r)[1 * 4 + 1], 1);
  const out = img.slice(); pasteHole(out, w, r, patch, hole);
  assert.equal(out[(2 * w + 2) * 4], 200); assert.equal(out[(2 * w + 3) * 4 + 3], 255);
  assert.equal(out[(2 * w + 4) * 4], 10); assert.equal(out[0], 10);
});

test('planar RGB round trip and MI-GAN mask polarity (255 keep, 0 fill)', () => {
  const rgba = new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  const p = rgbaToPlanarRGB(rgba, 2);
  assert.deepEqual([...p], [1, 4, 2, 5, 3, 6]);
  assert.deepEqual([...planarRGBToRGBA(p, 2)], [...rgba]);
  assert.deepEqual([...migMask(new Uint8Array([1, 0]))], [0, 255]);
});

test('padRect / paintRects clamp to the image', () => {
  assert.deepEqual(padRect({ x0: 1, y0: 1, x1: 9.2, y1: 9 }, 3, 10, 10), { x0: 0, y0: 0, x1: 10, y1: 10 });
  const m = new Uint8Array(4 * 3); paintRects(m, 4, 3, [{ x0: 1, y0: 1, x1: 9, y1: 2 }]);
  assert.deepEqual([...m], [0, 0, 0, 0, 0, 255, 255, 255, 0, 0, 0, 0]);
});

test('inkColor averages only ink pixels', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255, 255, 0, 0, 255]);
  assert.equal(inkColor(rgba, new Uint8Array([1, 0, 1])), '#ff0000');
  assert.equal(inkColor(rgba, new Uint8Array([0, 0, 0])), '#000000');
});

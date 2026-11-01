import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fitSize, resizeRGBABilinear, resizeMaskBilinear, toTensorNCHW, postprocessMask,
  compositeCutout, paintBrush, thresholdMask,
} from '../src/lib/maskMath.ts';

test('fitSize keeps aspect ratio and never upscales', () => {
  assert.deepEqual(fitSize(4000, 2000, 1000), { w: 1000, h: 500 });
  assert.deepEqual(fitSize(300, 200, 1000), { w: 300, h: 200 });
});

test('resizeRGBABilinear: flat colour stays flat, size is right', () => {
  const src = new Uint8ClampedArray(4 * 4 * 4).fill(200);
  const out = resizeRGBABilinear(src, 4, 4, 2, 2);
  assert.equal(out.length, 2 * 2 * 4);
  assert.ok(out.every((v) => v === 200));
});

test('resizeMaskBilinear: upsampling a half/half mask keeps both sides', () => {
  const src = new Uint8Array([0, 255, 0, 255]); // 2x2: left 0, right 255
  const out = resizeMaskBilinear(src, 2, 2, 8, 8);
  assert.equal(out.length, 64);
  assert.equal(out[0], 0);
  assert.equal(out[7], 255);
});

test('toTensorNCHW: layout and normalisation', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255, 255, 0, 0, 255]); // 2x2 red
  const t = toTensorNCHW(rgba, 2, 2);
  assert.equal(t.length, 12);
  assert.ok(Math.abs(t[0] - (1 - 0.485) / 0.229) < 1e-5); // R plane
  assert.ok(Math.abs(t[4] - (0 - 0.456) / 0.224) < 1e-5); // G plane
});

test('postprocessMask: min-max to 0..255', () => {
  const m = postprocessMask(new Float32Array([-2, 0, 2]));
  assert.deepEqual(Array.from(m), [0, 128, 255]);
});

test('compositeCutout: alpha follows the mask', () => {
  const rgba = new Uint8ClampedArray([10, 20, 30, 255, 40, 50, 60, 255]);
  const out = new Uint8ClampedArray(8);
  compositeCutout(rgba, new Uint8Array([0, 255]), out);
  assert.deepEqual(Array.from(out), [10, 20, 30, 0, 40, 50, 60, 255]);
});

test('paintBrush erase then restore', () => {
  const w = 20, h = 20;
  const mask = new Uint8Array(w * h).fill(255);
  paintBrush(mask, w, h, 10, 10, 5, 1, 'erase');
  assert.equal(mask[10 * w + 10], 0);
  assert.equal(mask[0], 255); // far corner untouched
  paintBrush(mask, w, h, 10, 10, 5, 1, 'restore');
  assert.equal(mask[10 * w + 10], 255);
});

test('paintBrush soft edge gives partial values', () => {
  const w = 40, h = 40;
  const mask = new Uint8Array(w * h).fill(255);
  paintBrush(mask, w, h, 20, 20, 10, 0, 'erase');
  const edge = mask[20 * w + 28]; // 8px from centre of a 10px radius, hardness 0
  assert.ok(edge > 0 && edge < 255);
});

test('paintBrush at the border does not throw', () => {
  const mask = new Uint8Array(100).fill(255);
  paintBrush(mask, 10, 10, 0, 0, 8, 1, 'erase');
  paintBrush(mask, 10, 10, 9, 9, 8, 0.5, 'restore');
  assert.ok(true);
});

test('thresholdMask converts confidence to a binary selection without changing source', () => {
  const source = new Uint8Array([0, 64, 127, 128, 200, 255]);
  assert.deepEqual([...thresholdMask(source, 128)], [0, 0, 0, 255, 255, 255]);
  assert.deepEqual([...source], [0, 64, 127, 128, 200, 255]);
  assert.deepEqual([...thresholdMask(source, 256)], [0, 0, 0, 0, 0, 0]);
});

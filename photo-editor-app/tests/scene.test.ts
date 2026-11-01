import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverRect, hitTest, isArabic } from '../src/lib/scene.ts';

test('coverRect crops the longer side, centered', () => {
  const r = coverRect(2000, 1000, 100, 100); // wide image into a square
  assert.equal(r.sh, 1000); assert.equal(r.sw, 1000); assert.equal(r.sx, 500); assert.equal(r.sy, 0);
});
test('hitTest returns the topmost box', () => {
  const boxes = [{ id: 'a', x0: 0, y0: 0, x1: 10, y1: 10 }, { id: 'b', x0: 5, y0: 5, x1: 15, y1: 15 }];
  assert.equal(hitTest(boxes, 7, 7), 'b'); assert.equal(hitTest(boxes, 1, 1), 'a'); assert.equal(hitTest(boxes, 50, 50), null);
});
test('isArabic', () => { assert.ok(isArabic('مرحبا abc')); assert.ok(!isArabic('hello')); });

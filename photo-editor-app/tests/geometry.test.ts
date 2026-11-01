import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampRect, moveRect, nearestCorner, dragCorner, aspectBox, polyBBox, remapText, resizeDims, MIN_CROP } from '../src/lib/geometry.ts';

const W = 400, H = 300;

test('clampRect keeps the box inside the image and at least MIN_CROP big', () => {
  const r = clampRect({ x0: -20, y0: 10, x1: 5000, y1: 12 }, W, H);
  assert.equal(r.x0, 0); assert.equal(r.x1, W); assert.ok(r.y1 - r.y0 >= MIN_CROP);
});

test('moveRect cannot leave the image', () => {
  const r = moveRect({ x0: 100, y0: 100, x1: 200, y1: 180 }, 1000, -1000, W, H);
  assert.deepEqual(r, { x0: 300, y0: 0, x1: 400, y1: 80 });
});

test('nearestCorner picks the closest corner within the tolerance', () => {
  const r = { x0: 50, y0: 50, x1: 150, y1: 120 };
  assert.equal(nearestCorner(r, 148, 118, 20), 'br');
  assert.equal(nearestCorner(r, 52, 51, 20), 'tl');
  assert.equal(nearestCorner(r, 100, 80, 20), null);
});

test('dragCorner keeps the opposite corner fixed and honours the aspect ratio', () => {
  const r = { x0: 50, y0: 50, x1: 150, y1: 150 };
  const free = dragCorner(r, 'br', 250, 200, null, W, H);
  assert.deepEqual([free.x0, free.y0, free.x1, free.y1], [50, 50, 250, 200]);
  const sq = dragCorner(r, 'br', 250, 200, 1, W, H);
  assert.equal(sq.x0, 50); assert.equal(sq.y0, 50);
  assert.ok(Math.abs((sq.x1 - sq.x0) - (sq.y1 - sq.y0)) < 1e-6);
  const out = dragCorner(r, 'br', 9999, 9999, 16 / 9, W, H);
  assert.ok(out.x1 <= W && out.y1 <= H);
});

test('aspectBox is centred and has the requested ratio', () => {
  const b = aspectBox(1, W, H);
  assert.deepEqual(b, { x0: 50, y0: 0, x1: 350, y1: 300 });
  const wide = aspectBox(16 / 9, W, H);
  assert.ok(Math.abs((wide.x1 - wide.x0) / (wide.y1 - wide.y0) - 16 / 9) < 1e-9);
});

test('polyBBox needs 3+ points and some area', () => {
  assert.equal(polyBBox([{ x: 0, y: 0 }, { x: 5, y: 5 }]), null);
  assert.deepEqual(polyBBox([{ x: 10, y: 20 }, { x: 60, y: 30 }, { x: 30, y: 90 }]), { x0: 10, y0: 20, x1: 60, y1: 90 });
});

test('remapText keeps a text layer on the same pixels after a crop', () => {
  const l = { id: 'a', text: 'x', font: 'Cairo', size: 0.1, color: '#fff', cx: 0.5, cy: 0.5 };
  const m = remapText(l, 400, 300, { x0: 100, y0: 50, x1: 300, y1: 250 });
  assert.equal(m.cx, 0.5); assert.equal(m.cy, 0.5);
  assert.equal(m.size, 0.2); // 40 px of text on a 200 px wide crop
});

test('resizeDims: lock follows the changed side, and the long side is capped', () => {
  assert.deepEqual(resizeDims(4000, 3000, 2000, null, true), { w: 2000, h: 1500 });
  assert.deepEqual(resizeDims(4000, 3000, null, 600, true), { w: 800, h: 600 });
  assert.deepEqual(resizeDims(1000, 1000, 8192, 4096, false), { w: 4096, h: 2048 });
});

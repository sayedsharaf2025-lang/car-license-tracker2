import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cloneSourcePoint, interpolateCloneStroke } from '../src/lib/cloneMath.ts';

test('clone stroke interpolation fills long pointer gaps and includes endpoint', () => {
  const points = interpolateCloneStroke({ x: 0, y: 0 }, { x: 10, y: 0 }, 2);
  assert.equal(points.length, 5);
  assert.deepEqual(points.at(-1), { x: 10, y: 0 });
  for (let i = 1; i < points.length; i++) assert.ok(points[i].x - points[i - 1].x <= 2);
});

test('clone source mapping respects image scale', () => {
  assert.deepEqual(cloneSourcePoint({ x: 20, y: 30 }, { x: 40, y: -20 }, 2, 4), { x: 40, y: 25 });
});

test('zero-length clone movement safely returns its endpoint', () => {
  assert.deepEqual(interpolateCloneStroke({ x: 4, y: 5 }, { x: 4, y: 5 }, 2), [{ x: 4, y: 5 }]);
});

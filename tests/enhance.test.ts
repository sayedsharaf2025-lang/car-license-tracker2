import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { adjustPixels, autoSettings, enhancePixels, DEFAULT_ENHANCE } from '../src/lib/enhance.ts';

test('neutral enhancement preserves every pixel', () => {
  const input = new Uint8ClampedArray([10, 20, 30, 255, 240, 220, 200, 128]);
  assert.deepEqual(adjustPixels(input, DEFAULT_ENHANCE), input);
});
test('brightness changes RGB but never alpha', () => {
  const input = new Uint8ClampedArray([100, 100, 100, 77]);
  const out = enhancePixels(input, 1, 1, { ...DEFAULT_ENHANCE, brightness: 20 });
  assert.ok(out[0] > input[0]);
  assert.equal(out[3], 77);
});
test('auto correction stays within safe control limits', () => {
  const input = new Uint8ClampedArray(40).fill(80);
  const settings = autoSettings(input);
  assert.ok(settings.brightness >= -18 && settings.brightness <= 18);
  assert.ok(settings.contrast >= -12 && settings.contrast <= 18);
});
test('sharpen and denoise keep output dimensions and channel bounds', () => {
  const input = new Uint8ClampedArray(5 * 5 * 4).fill(120);
  for (let i = 3; i < input.length; i += 4) input[i] = 255;
  const out = enhancePixels(input, 5, 5, { ...DEFAULT_ENHANCE, sharpen: 70, denoise: 60 });
  assert.equal(out.length, input.length);
  assert.ok([...out].every((v) => v >= 0 && v <= 255));
});

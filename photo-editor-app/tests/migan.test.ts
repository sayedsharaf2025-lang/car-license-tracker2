// Checks the main-thread side of MI-GAN (crop around the hole, message protocol, paste back) with a fake worker.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const seen: { w: number; h: number; mask: Uint8Array; rgb: Uint8Array }[] = [];
class FakeWorker {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  postMessage(msg: { id: number; cmd: string; w: number; h: number; mask: Uint8Array; rgb: Uint8Array }) {
    if (msg.cmd === 'run') seen.push(msg);
    setTimeout(() => this.onmessage?.({ data: { id: msg.id, out: new Uint8Array(3 * msg.w * msg.h).fill(77) } }), 0);
  }
  terminate() {}
}
(globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
const { fillHoles } = await import('../src/lib/migan.ts');

test('fillHoles: only the hole changes, the model gets a small crop, mask is 0 on the hole', async () => {
  const w = 600, h = 400, img = new Uint8ClampedArray(w * h * 4).fill(10), hole = new Uint8Array(w * h);
  for (let y = 100; y < 120; y++) for (let x = 200; x < 240; x++) hole[y * w + x] = 1;
  seen.length = 0;
  const out = await fillHoles(img, w, h, hole, () => {}).promise;
  assert.equal(out.length, img.length);
  assert.equal(out[(110 * w + 220) * 4], 77);          // inside the hole: from the model
  assert.equal(out[(10 * w + 10) * 4], 10);            // far away: untouched
  assert.equal(img[(110 * w + 220) * 4], 10);          // the input array is not modified
  const call = seen[0];
  assert.ok(call.w < w && call.h < h);                 // crop, not the whole photo
  assert.equal(call.rgb.length, 3 * call.w * call.h);
  assert.equal(call.mask.length, call.w * call.h);
  assert.ok(call.mask.includes(0) && call.mask.includes(255));
});

test('fillHoles: a huge hole is shrunk for the model and scaled back to full size', async () => {
  const w = 3000, h = 2000, img = new Uint8ClampedArray(w * h * 4).fill(10), hole = new Uint8Array(w * h).fill(1);
  seen.length = 0;
  const out = await fillHoles(img, w, h, hole, () => {}).promise;
  assert.ok(Math.max(seen[0].w, seen[0].h) <= 1536);
  assert.equal(out.length, img.length);
  assert.equal(out[(1000 * w + 1500) * 4], 77);
});

test('fillHoles: empty hole returns the image as is', async () => {
  const img = new Uint8ClampedArray(10 * 10 * 4).fill(5);
  seen.length = 0;
  const out = await fillHoles(img, 10, 10, new Uint8Array(100), () => {}).promise;
  assert.equal(out, img); assert.equal(seen.length, 0);
});

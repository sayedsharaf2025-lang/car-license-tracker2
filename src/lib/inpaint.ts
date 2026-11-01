/** Fills `hole` pixels (1 = hole) from the outside in, averaging known neighbours ring by ring. Edits rgba in place. No model needed. */
export function inpaint(rgba: Uint8ClampedArray, w: number, h: number, hole: Uint8Array): void {
  const known = new Uint8Array(w * h), queued = new Uint8Array(w * h);
  for (let i = 0; i < known.length; i++) known[i] = hole[i] ? 0 : 1;
  const neighbours = (i: number, f: (j: number) => void) => {
    const x = i % w, y = (i / w) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < w && ny < h) f(ny * w + nx);
    }
  };
  let ring: number[] = [];
  for (let i = 0; i < hole.length; i++) {
    if (!hole[i]) continue;
    let touches = false; neighbours(i, (j) => { if (known[j]) touches = true; });
    if (touches) { ring.push(i); queued[i] = 1; }
  }
  while (ring.length) {
    for (const i of ring) {
      let r = 0, g = 0, b = 0, n = 0;
      neighbours(i, (j) => { if (known[j]) { r += rgba[j * 4]; g += rgba[j * 4 + 1]; b += rgba[j * 4 + 2]; n++; } });
      rgba[i * 4] = r / n; rgba[i * 4 + 1] = g / n; rgba[i * 4 + 2] = b / n; rgba[i * 4 + 3] = 255;
    }
    const next: number[] = [];
    for (const i of ring) { known[i] = 1; }
    for (const i of ring) neighbours(i, (j) => { if (hole[j] && !known[j] && !queued[j]) { queued[j] = 1; next.push(j); } });
    ring = next;
  }
}

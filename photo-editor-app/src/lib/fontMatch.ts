// Pure font-matching math: binarize text, normalise its shape, compare shapes. No DOM.
export function toGray(rgba: Uint8ClampedArray, n: number): Uint8Array {
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) g[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
  return g;
}

export function otsu(g: Uint8Array): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of g) hist[v]++;
  let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sB = 0, wB = 0, best = -1, thr = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue;
    const wF = g.length - wB; if (!wF) break;
    sB += t * hist[t];
    const v = wB * wF * (sB / wB - (sum - sB) / wF) ** 2;
    if (v > best) { best = v; thr = t; }
  }
  return thr;
}

/** 1 = ink. Ink is whichever side of the threshold has fewer pixels (works for light-on-dark and dark-on-light). */
export function inkMask(g: Uint8Array): Uint8Array {
  const th = otsu(g), m = new Uint8Array(g.length);
  let dark = 0;
  for (let i = 0; i < g.length; i++) if (g[i] <= th) { m[i] = 1; dark++; }
  if (dark > g.length / 2) for (let i = 0; i < m.length; i++) m[i] ^= 1;
  return m;
}

/** Crops to the ink bounding box and resamples to ow x oh. Returns null when there is no ink. */
export function normalizeInk(m: Uint8Array, w: number, h: number, ow = 160, oh = 48): { ink: Uint8Array; aspect: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ink = new Uint8Array(ow * oh);
  for (let oy = 0; oy < oh; oy++) {
    const ys = y0 + Math.floor((oy * bh) / oh), ye = Math.max(ys + 1, y0 + Math.floor(((oy + 1) * bh) / oh));
    for (let ox = 0; ox < ow; ox++) {
      const xs = x0 + Math.floor((ox * bw) / ow), xe = Math.max(xs + 1, x0 + Math.floor(((ox + 1) * bw) / ow));
      let c = 0, n = 0;
      for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) { c += m[y * w + x]; n++; }
      ink[oy * ow + ox] = c / n >= 0.4 ? 1 : 0;
    }
  }
  return { ink, aspect: bw / bh };
}

/** Overlap of two normalised shapes (IoU), reduced when their width/height ratios differ. 0..1 */
export function similarity(a: { ink: Uint8Array; aspect: number }, b: { ink: Uint8Array; aspect: number }): number {
  let inter = 0, uni = 0;
  for (let i = 0; i < a.ink.length; i++) { inter += a.ink[i] & b.ink[i]; uni += a.ink[i] | b.ink[i]; }
  return (uni ? inter / uni : 0) * Math.exp(-1.5 * Math.abs(Math.log(a.aspect / b.aspect)));
}

export function rankFonts(query: { ink: Uint8Array; aspect: number }, cands: { font: string; shape: { ink: Uint8Array; aspect: number } }[]) {
  return cands.map((c) => ({ font: c.font, score: similarity(query, c.shape) })).sort((a, b) => b.score - a.score);
}

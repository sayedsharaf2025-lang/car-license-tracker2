// Font matching: contrast-normalised ink masks, aspect-preserving normalisation and tolerant shape metrics.
export function toGray(rgba: Uint8ClampedArray, n: number): Uint8Array {
  const g = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const a = (rgba[i * 4 + 3] ?? 255) / 255;
    g[i] = Math.round((0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]) * a + 255 * (1 - a));
  }
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

/** 1 = ink. Handles light-on-dark and dark-on-light, and uneven illumination. */
export function inkMask(g: Uint8Array, w?: number, h?: number): Uint8Array {
  const th = otsu(g), m = new Uint8Array(g.length);
  let dark = 0;
  for (let i = 0; i < g.length; i++) if (g[i] <= th) { m[i] = 1; dark++; }
  if (dark > g.length / 2) for (let i = 0; i < m.length; i++) m[i] ^= 1;
  if (!w || !h || w * h !== g.length || w < 8 || h < 8) return m;

  // Integral-image adaptive threshold recovers strokes in shadows/gradients.
  const stride = w + 1, integral = new Float64Array((w + 1) * (h + 1));
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) { row += g[(y - 1) * w + x - 1]; integral[y * stride + x] = integral[(y - 1) * stride + x] + row; }
  }
  const radius = Math.max(5, Math.round(Math.min(w, h) * 0.12));
  const adaptive = new Uint8Array(g.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const x0 = Math.max(0, x - radius), x1 = Math.min(w, x + radius + 1), y0 = Math.max(0, y - radius), y1 = Math.min(h, y + radius + 1);
    const sum = integral[y1 * stride + x1] - integral[y0 * stride + x1] - integral[y1 * stride + x0] + integral[y0 * stride + x0];
    const mean = sum / ((x1 - x0) * (y1 - y0));
    adaptive[y * w + x] = g[y * w + x] < mean - 9 ? 1 : 0;
  }
  // Prefer adaptive segmentation only when it finds a plausible amount of ink.
  let count = 0; for (const v of adaptive) count += v;
  const ratio = count / adaptive.length;
  if (ratio > 0.002 && ratio < 0.65) return adaptive;
  return m;
}

/** Crops to ink bounds and letterboxes without distorting glyph proportions. */
export function normalizeInk(m: Uint8Array, w: number, h: number, ow = 160, oh = 64): { ink: Uint8Array; aspect: number } | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return null;
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, ink = new Uint8Array(ow * oh);
  const scale = Math.min((ow - 8) / bw, (oh - 8) / bh), dw = Math.max(1, Math.round(bw * scale)), dh = Math.max(1, Math.round(bh * scale));
  const ox0 = Math.floor((ow - dw) / 2), oy0 = Math.floor((oh - dh) / 2);
  for (let oy = 0; oy < dh; oy++) {
    const ys = y0 + Math.floor((oy * bh) / dh), ye = Math.max(ys + 1, y0 + Math.floor(((oy + 1) * bh) / dh));
    for (let ox = 0; ox < dw; ox++) {
      const xs = x0 + Math.floor((ox * bw) / dw), xe = Math.max(xs + 1, x0 + Math.floor(((ox + 1) * bw) / dw));
      let c = 0, n = 0;
      for (let y = ys; y < ye; y++) for (let x = xs; x < xe; x++) { c += m[y * w + x]; n++; }
      ink[(oy0 + oy) * ow + ox0 + ox] = c / n >= 0.35 ? 1 : 0;
    }
  }
  return { ink, aspect: bw / bh };
}

function projections(a: Uint8Array, width: number, height: number) {
  const rows = new Float32Array(height), cols = new Float32Array(width);
  let total = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (a[y * width + x]) { rows[y]++; cols[x]++; total++; }
  if (total) { for (let i = 0; i < rows.length; i++) rows[i] /= total; for (let i = 0; i < cols.length; i++) cols[i] /= total; }
  return { rows, cols, total: total / (width * height) };
}
function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}
function tolerantOverlap(a: Uint8Array, b: Uint8Array, w: number, h: number): number {
  let inter = 0, uni = 0;
  // A 1px tolerance helps scanned, compressed or anti-aliased samples.
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, av = a[i], bv = b[i];
    let nearA = av, nearB = bv;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      nearA ||= a[yy * w + xx]; nearB ||= b[yy * w + xx];
    }
    if (nearA && nearB) inter++;
    if (nearA || nearB) uni++;
  }
  return uni ? inter / uni : 0;
}

/** 0..1 similarity combining tolerant glyph overlap, stroke distribution and proportions. */
export function similarity(a: { ink: Uint8Array; aspect: number }, b: { ink: Uint8Array; aspect: number }): number {
  const width = 160, height = Math.floor(a.ink.length / width);
  if (a.ink.length !== b.ink.length || !height || width * height !== a.ink.length) return 0;
  const pa = projections(a.ink, width, height), pb = projections(b.ink, width, height);
  const overlap = tolerantOverlap(a.ink, b.ink, width, height);
  const projection = (cosine(pa.rows, pb.rows) + cosine(pa.cols, pb.cols)) / 2;
  const density = Math.exp(-3 * Math.abs(Math.log((pa.total + 1e-5) / (pb.total + 1e-5))));
  const aspect = Math.exp(-1.1 * Math.abs(Math.log(a.aspect / b.aspect)));
  return Math.max(0, Math.min(1, 0.52 * overlap + 0.23 * projection + 0.10 * density + 0.15 * aspect));
}

export function rankFonts(query: { ink: Uint8Array; aspect: number }, cands: { font: string; shape: { ink: Uint8Array; aspect: number } }[]) {
  return cands.map((c) => ({ font: c.font, score: similarity(query, c.shape) })).sort((a, b) => b.score - a.score);
}

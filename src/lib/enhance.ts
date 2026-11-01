/** Local photo enhancement filters. All operations are deterministic and run on-device. */
export type EnhanceSettings = {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  warmth: number; // -100..100
  sharpen: number; // 0..100
  denoise: number; // 0..100
};
export const DEFAULT_ENHANCE: EnhanceSettings = {
  brightness: 0, contrast: 0, saturation: 0, warmth: 0, sharpen: 0, denoise: 0,
};
const clamp = (v: number) => Math.max(0, Math.min(255, v));
/** Apply tonal and colour controls to an RGBA buffer without changing alpha. */
export function adjustPixels(src: Uint8ClampedArray, settings: EnhanceSettings): Uint8ClampedArray {
  const out = src.slice();
  const contrast = (259 * (settings.contrast + 255)) / (255 * (259 - settings.contrast));
  const sat = 1 + settings.saturation / 100;
  const warm = settings.warmth * 0.35;
  for (let i = 0; i < out.length; i += 4) {
    const r = (src[i] - 128) * contrast + 128 + settings.brightness * 2.0 + warm;
    const g = (src[i + 1] - 128) * contrast + 128 + settings.brightness * 2.0;
    const b = (src[i + 2] - 128) * contrast + 128 + settings.brightness * 2.0 - warm;
    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    out[i] = clamp(gray + (r - gray) * sat);
    out[i + 1] = clamp(gray + (g - gray) * sat);
    out[i + 2] = clamp(gray + (b - gray) * sat);
  }
  return out;
}
/** Dimension-aware filter entry point for the editor. */
export function enhancePixels(src: Uint8ClampedArray, width: number, height: number, settings: EnhanceSettings): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || src.length !== width * height * 4) throw new RangeError('Image dimensions do not match pixel buffer');
  const out = adjustPixels(src, { ...settings, sharpen: 0, denoise: 0 });
  if (settings.denoise > 0) {
    const amount = Math.min(1, settings.denoise / 100), base = out.slice();
    const sigma = 12 + (1 - amount) * 24;
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4, cr = base[i], cg = base[i + 1], cb = base[i + 2];
      let sr = 0, sg = 0, sb = 0, total = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = ((y + dy) * width + x + dx) * 4;
        const dr = base[j] - cr, dg = base[j + 1] - cg, db = base[j + 2] - cb;
        const distance = (dr * dr + dg * dg + db * db) / 3;
        const spatial = dx === 0 && dy === 0 ? 1 : (dx === 0 || dy === 0 ? 0.72 : 0.5);
        const weight = spatial * Math.exp(-distance / (2 * sigma * sigma));
        total += weight; sr += base[j] * weight; sg += base[j + 1] * weight; sb += base[j + 2] * weight;
      }
      out[i] = clamp(cr * (1 - amount * 0.8) + (sr / total) * amount * 0.8);
      out[i + 1] = clamp(cg * (1 - amount * 0.8) + (sg / total) * amount * 0.8);
      out[i + 2] = clamp(cb * (1 - amount * 0.8) + (sb / total) * amount * 0.8);
    }
  }
  if (settings.sharpen > 0) {
    const base = out.slice(), amount = settings.sharpen / 100;
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) {
        const blur = (base[i - 4 + c] + base[i + 4 + c] + base[i - width * 4 + c] + base[i + width * 4 + c]) / 4;
        out[i + c] = clamp(base[i + c] + (base[i + c] - blur) * amount * 1.5);
      }
    }
  }
  return out;
}
/** Estimate a gentle automatic correction from luminance percentiles. */
export function autoSettings(src: Uint8ClampedArray): Pick<EnhanceSettings, 'brightness' | 'contrast' | 'saturation'> {
  const hist = new Uint32Array(256);
  for (let i = 0; i < src.length; i += 4) hist[Math.round(0.2126 * src[i] + 0.7152 * src[i + 1] + 0.0722 * src[i + 2])]++;
  const count = src.length / 4;
  const percentile = (p: number) => { let n = 0; for (let i = 0; i < 256; i++) { n += hist[i]; if (n >= count * p) return i; } return 255; };
  const low = percentile(0.03), high = percentile(0.97), mid = (low + high) / 2;
  return {
    brightness: Math.max(-18, Math.min(18, Math.round((128 - mid) * 0.22))),
    contrast: Math.max(-12, Math.min(18, Math.round((220 - (high - low)) * 0.12))),
    saturation: 4,
  };
}

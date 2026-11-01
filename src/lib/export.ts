import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { MediaSaver } from './mediaSaver.ts';
import { drawScene } from './scene.ts';
import { loadFont } from './fonts.ts';
import type { Project } from '../data/store.ts';
import { fitSize, resizeMaskBilinear, compositeCutout } from './maskMath.ts';

export const EXPORT_MAX_SIDE = 4096;

export type Format = 'png' | 'jpg' | 'webp';
export const MIME: Record<Format, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

/** The export format that matches the photo that was opened (so a JPG stays a JPG). */
export function formatOfMime(mime: string): Format {
  return mime === 'image/jpeg' || mime === 'image/jpg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png';
}

/** Composes background + cutout + text at (up to) full resolution into a file. */
export async function renderExport(p: Project, format: Format, quality: number): Promise<Blob> {
  const { w, h } = fitSize(p.bitmap.width, p.bitmap.height, EXPORT_MAX_SIDE);
  const cut = document.createElement('canvas');
  cut.width = w; cut.height = h;
  const cctx = cut.getContext('2d', { willReadFrequently: true })!;
  cctx.drawImage(p.bitmap, 0, 0, w, h);
  const img = cctx.getImageData(0, 0, w, h);
  compositeCutout(img.data, resizeMaskBilinear(p.mask ?? new Uint8Array(p.w * p.h).fill(255), p.w, p.h, w, h), img.data);
  cctx.putImageData(img, 0, 0);

  await Promise.all(p.texts.map((t) => loadFont(t.font)));
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const octx = out.getContext('2d')!;
  if (format === 'jpg') { octx.fillStyle = '#ffffff'; octx.fillRect(0, 0, w, h); }
  const layer = document.createElement('canvas');
  layer.width = w; layer.height = h;
  drawScene(layer.getContext('2d')!, w, h, p.bg, cut, p.texts);
  octx.drawImage(layer, 0, 0);
  return new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      MIME[format], format === 'png' ? undefined : quality));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export interface Saved { uri: string; where: 'gallery' | 'documents' | 'cache' | 'download' }

export const ALBUM = 'PhotoEditor';

/** Native: gallery (MediaStore) first, then Documents, then cache. Web dev: normal download. */
export async function saveFile(blob: Blob, name: string): Promise<Saved> {
  if (!Capacitor.isNativePlatform()) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    return { uri: name, where: 'download' };
  }
  const data = await blobToBase64(blob);
  try {
    const r = await MediaSaver.saveImage({ data, name, mime: blob.type || 'image/png', album: ALBUM });
    return { uri: r.uri, where: 'gallery' };
  } catch {
    // Android 9 or older, or the plugin is missing: fall through to the older paths.
  }
  try {
    const r = await Filesystem.writeFile({ path: `${ALBUM}/${name}`, data, directory: Directory.Documents, recursive: true });
    return { uri: r.uri, where: 'documents' };
  } catch {
    const r = await Filesystem.writeFile({ path: name, data, directory: Directory.Cache });
    return { uri: r.uri, where: 'cache' };
  }
}

/** Share needs a real file path, so write a temporary copy to the cache first. */
export async function shareBlob(blob: Blob, name: string): Promise<void> {
  const r = await Filesystem.writeFile({ path: name, data: await blobToBase64(blob), directory: Directory.Cache });
  await Share.share({ files: [r.uri] });
}

import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { MediaSaver } from './mediaSaver.ts';
import { fitSize, resizeMaskBilinear, compositeCutout } from './maskMath.ts';

export const EXPORT_MAX_SIDE = 4096;

export type Format = 'png' | 'jpg';

/** Flattens the original photo + mask at (up to) full resolution into a file. */
export async function renderExport(
  bitmap: ImageBitmap, mask: Uint8Array, mw: number, mh: number, format: Format, quality: number,
): Promise<Blob> {
  const { w, h } = fitSize(bitmap.width, bitmap.height, EXPORT_MAX_SIDE);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const full = resizeMaskBilinear(mask, mw, mh, w, h);
  compositeCutout(img.data, full, img.data); // in place: rgb stays, alpha = mask
  ctx.putImageData(img, 0, 0);

  let target = c;
  if (format === 'jpg') {
    target = document.createElement('canvas');
    target.width = w; target.height = h;
    const t = target.getContext('2d')!;
    t.fillStyle = '#ffffff';
    t.fillRect(0, 0, w, h);
    t.drawImage(c, 0, 0);
  }
  return new Promise((resolve, reject) =>
    target.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      format === 'png' ? 'image/png' : 'image/jpeg', quality));
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

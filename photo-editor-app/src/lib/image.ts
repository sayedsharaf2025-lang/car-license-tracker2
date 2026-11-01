import { fitSize } from './maskMath.ts';

export const WORK_MAX_SIDE = 1600; // working copy for the brush and the model; export uses the original

export async function openPhoto(file: File): Promise<ImageBitmap> {
  // 'from-image' applies EXIF rotation so phone photos are not sideways.
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

export function workingCopy(bitmap: ImageBitmap): { w: number; h: number; rgba: Uint8ClampedArray } {
  const { w, h } = fitSize(bitmap.width, bitmap.height, WORK_MAX_SIDE);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { w, h, rgba: ctx.getImageData(0, 0, w, h).data };
}

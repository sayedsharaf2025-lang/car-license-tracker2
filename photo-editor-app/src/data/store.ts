// Fake (in-memory) data layer with the same shape the SQLite version will have (see replica/schema.sql).
import { openPhoto, workingCopy } from '../lib/image.ts';
import type { Background, TextLayer } from '../lib/scene.ts';

export interface Project {
  id: string;
  title: string;
  bitmap: ImageBitmap;          // original, full size
  w: number; h: number;         // working size
  rgba: Uint8ClampedArray;      // original at working size
  bg: Background;
  texts: TextLayer[];
  mask: Uint8Array | null;      // 0..255 per working pixel, null until background removal runs
  updatedAt: number;
  mime: string;                 // format of the photo that was opened (image/jpeg, image/png, image/webp): export defaults to it
  prev: Snapshot | null;        // state before the last crop/resize, so it can be undone once
}

export interface Snapshot { bitmap: ImageBitmap; w: number; h: number; rgba: Uint8ClampedArray; mask: Uint8Array | null; texts: TextLayer[] }

const all = new Map<string, Project>();
let currentId: string | null = null;

export const projects = {
  async create(file: File): Promise<Project> {
    const bitmap = await openPhoto(file);
    const wc = workingCopy(bitmap);
    const p: Project = {
      id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '') || 'project',
      bitmap, w: wc.w, h: wc.h, rgba: wc.rgba, bg: { kind: 'transparent' }, texts: [], mask: null, updatedAt: Date.now(),
      mime: file.type || 'image/png', prev: null,
    };
    all.set(p.id, p);
    currentId = p.id;
    return p;
  },
  current(): Project | null { return currentId ? all.get(currentId) ?? null : null; },
  list(): Project[] { return [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt); },
  open(id: string): Project | null { if (all.has(id)) currentId = id; return all.get(id) ?? null; },
  touch(p: Project): void { p.updatedAt = Date.now(); },
};

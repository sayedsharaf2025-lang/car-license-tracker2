// Fake (in-memory) data layer with the same shape the SQLite version will have (see replica/schema.sql).
import { openPhoto, workingCopy } from '../lib/image.ts';

export interface Project {
  id: string;
  title: string;
  bitmap: ImageBitmap;          // original, full size
  w: number; h: number;         // working size
  rgba: Uint8ClampedArray;      // original at working size
  mask: Uint8Array | null;      // 0..255 per working pixel, null until background removal runs
  updatedAt: number;
}

const all = new Map<string, Project>();
let currentId: string | null = null;

export const projects = {
  async create(file: File): Promise<Project> {
    const bitmap = await openPhoto(file);
    const wc = workingCopy(bitmap);
    const p: Project = {
      id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '') || 'project',
      bitmap, w: wc.w, h: wc.h, rgba: wc.rgba, mask: null, updatedAt: Date.now(),
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

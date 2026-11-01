// Persistent project store backed by IndexedDB. Image pixels stay on-device.
import { openPhoto, workingCopy } from '../lib/image.ts';
import type { Background, TextLayer } from '../lib/scene.ts';

export interface Project {
  id: string;
  title: string;
  bitmap: ImageBitmap;
  w: number; h: number;
  rgba: Uint8ClampedArray;
  bg: Background;
  texts: TextLayer[];
  mask: Uint8Array | null;
  updatedAt: number;
  mime: string;
  prev: Snapshot | null;
}
export interface Snapshot { bitmap: ImageBitmap; w: number; h: number; rgba: Uint8ClampedArray; mask: Uint8Array | null; texts: TextLayer[] }

type StoredSnapshot = { image: Blob; w: number; h: number; rgba: ArrayBuffer; mask: ArrayBuffer | null; texts: TextLayer[] };
type StoredProject = {
  id: string; title: string; image: Blob; w: number; h: number;
  rgba: ArrayBuffer; bg: { kind: 'transparent' } | { kind: 'color'; color: string } | { kind: 'image'; image: Blob };
  texts: TextLayer[]; mask: ArrayBuffer | null; updatedAt: number; mime: string; prev: StoredSnapshot | null;
};

const DB_NAME = 'photo-editor-arabic';
const DB_VERSION = 1;
const STORE = 'projects';
const all = new Map<string, Project>();
let currentId: string | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB is unavailable')); return; }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open project storage'));
  });
  return dbPromise;
}

function imageBlob(bitmap: ImageBitmap): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Canvas is unavailable'));
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    canvas.width = 0; canvas.height = 0;
    if (blob) resolve(blob); else reject(new Error('Could not save image'));
  }, 'image/png'));
}

async function packSnapshot(s: Snapshot | null): Promise<StoredSnapshot | null> {
  if (!s) return null;
  return { image: await imageBlob(s.bitmap), w: s.w, h: s.h, rgba: s.rgba.slice().buffer,
    mask: s.mask ? s.mask.slice().buffer : null, texts: structuredClone(s.texts) };
}
async function unpackSnapshot(s: StoredSnapshot | null): Promise<Snapshot | null> {
  if (!s) return null;
  return { bitmap: await createImageBitmap(s.image), w: s.w, h: s.h,
    rgba: new Uint8ClampedArray(s.rgba), mask: s.mask ? new Uint8Array(s.mask) : null, texts: s.texts };
}
async function packProject(p: Project): Promise<StoredProject> {
  let bg: StoredProject['bg'];
  if (p.bg.kind === 'image') bg = { kind: 'image', image: await imageBlob(p.bg.bitmap) };
  else if (p.bg.kind === 'color') bg = { kind: 'color', color: p.bg.color };
  else bg = { kind: 'transparent' };
  return { id:p.id, title:p.title, image:await imageBlob(p.bitmap), w:p.w, h:p.h,
    rgba:p.rgba.slice().buffer, bg, texts:structuredClone(p.texts),
    mask:p.mask ? p.mask.slice().buffer : null, updatedAt:p.updatedAt, mime:p.mime,
    prev:await packSnapshot(p.prev) };
}
async function unpackProject(s: StoredProject): Promise<Project> {
  const bg: Background = s.bg.kind === 'image'
    ? { kind:'image', bitmap:await createImageBitmap(s.bg.image) }
    : s.bg.kind === 'color' ? { kind:'color', color:s.bg.color } : { kind:'transparent' };
  return { id:s.id, title:s.title, bitmap:await createImageBitmap(s.image), w:s.w, h:s.h,
    rgba:new Uint8ClampedArray(s.rgba), bg, texts:s.texts,
    mask:s.mask ? new Uint8Array(s.mask) : null, updatedAt:s.updatedAt, mime:s.mime,
    prev:await unpackSnapshot(s.prev) };
}
async function persist(p: Project): Promise<void> {
  const database = await db();
  const record = await packProject(p);
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Could not save project'));
    tx.onabort = () => reject(tx.error ?? new Error('Project save was cancelled'));
  });
}

export const projects = {
  async restore(): Promise<void> {
    try {
      const database = await db();
      const records = await new Promise<StoredProject[]>((resolve, reject) => {
        const request = database.transaction(STORE, 'readonly').objectStore(STORE).getAll();
        request.onsuccess = () => resolve(request.result as StoredProject[]);
        request.onerror = () => reject(request.error ?? new Error('Could not load projects'));
      });
      for (const record of records) {
        try { const p = await unpackProject(record); all.set(p.id, p); }
        catch (error) { console.warn('Skipping unreadable saved project', record.id, error); }
      }
      const newest = projects.list()[0];
      currentId = newest?.id ?? null;
    } catch (error) {
      console.warn('Persistent project storage is unavailable; projects will remain in memory', error);
    }
  },
  async create(file: File): Promise<Project> {
    const bitmap = await openPhoto(file);
    const wc = workingCopy(bitmap);
    const p: Project = {
      id: crypto.randomUUID(), title: file.name.replace(/\.[^.]+$/, '') || 'project',
      bitmap, w: wc.w, h: wc.h, rgba: wc.rgba, bg: { kind: 'transparent' }, texts: [], mask: null,
      updatedAt: Date.now(), mime: file.type || 'image/png', prev: null,
    };
    all.set(p.id, p); currentId = p.id;
    try { await persist(p); } catch (error) { console.warn('Project could not be persisted', error); }
    return p;
  },
  current(): Project | null { return currentId ? all.get(currentId) ?? null : null; },
  list(): Project[] { return [...all.values()].sort((a,b) => b.updatedAt-a.updatedAt); },
  open(id: string): Project | null { if (all.has(id)) currentId=id; return all.get(id) ?? null; },
  touch(p: Project): void {
    p.updatedAt = Date.now();
    void persist(p).catch((error) => console.warn('Project autosave failed', error));
  },
};

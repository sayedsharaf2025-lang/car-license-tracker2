import { h, setChildren, toast } from '../ui.ts';
import { t } from '../copy.ts';
import { go, type Screen } from '../router.ts';
import { projects } from '../data/store.ts';
import { compositeCutout, paintBrush, type BrushMode } from '../lib/maskMath.ts';
import { segment, SegmentError } from '../lib/segment.ts';
import { renderExport, saveFile, shareBlob, type Format, type Saved } from '../lib/export.ts';

const UNDO_LIMIT = 10; // snapshot-based for the first slice; a stroke list replaces this later

// S04 editor + S05 remove background + S16 export.
export function editorScreen(): Screen {
  const p = projects.current();
  if (!p) { queueMicrotask(() => go('/')); return { el: h('div') }; }

  const W = p.w, H = p.h;
  let mode: BrushMode = 'erase';
  let radiusPx = 28;      // screen pixels
  let hardness = 0.7;
  let showOriginal = false;
  let undo: Uint8Array[] = [];
  let redo: Uint8Array[] = [];
  let job: { cancel: () => void } | null = null;
  let raf = 0;

  const canvas = h('canvas', { class: 'stage-canvas', width: W, height: H, 'aria-label': p.title, role: 'img' });
  const ctx = canvas.getContext('2d')!;
  const frame = new ImageData(W, H);

  function draw() {
    raf = 0;
    if (p!.mask && !showOriginal) compositeCutout(p!.rgba, p!.mask, frame.data);
    else frame.data.set(p!.rgba);
    ctx.putImageData(frame, 0, 0);
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  // --- top bar
  const undoBtn = h('button', { class: 'icon-btn', 'aria-label': t.editor.undo, disabled: true, onclick: () => step(undo, redo) }, '↶');
  const redoBtn = h('button', { class: 'icon-btn', 'aria-label': t.editor.redo, disabled: true, onclick: () => step(redo, undo) }, '↷');
  const exportBtn = h('button', { class: 'btn primary small', onclick: () => openExport() }, t.editor.export);
  const syncHistory = () => { undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length; };
  function step(from: Uint8Array[], to: Uint8Array[]) {
    const snap = from.pop();
    if (!snap || !p!.mask) return;
    to.push(p!.mask.slice());
    p!.mask.set(snap);
    syncHistory(); schedule();
  }

  // --- brush panel (S05)
  const modeBtn = (m: BrushMode, label: string): HTMLButtonElement => {
    const b = h('button', { class: 'chip', 'aria-pressed': String(mode === m), onclick: () => {
      mode = m; modeErase.setAttribute('aria-pressed', String(m === 'erase')); modeRestore.setAttribute('aria-pressed', String(m === 'restore'));
    } }, label);
    return b;
  };
  const modeErase: HTMLButtonElement = modeBtn('erase', t.editor.erase);
  const modeRestore: HTMLButtonElement = modeBtn('restore', t.editor.restore);
  const slider = (label: string, min: number, max: number, val: number, on: (v: number) => void) => {
    const id = 's' + Math.random().toString(36).slice(2, 7);
    return h('div', { class: 'row' },
      h('label', { for: id }, label),
      h('input', { id, type: 'range', min, max, value: val, oninput: (e: Event) => on(Number((e.target as HTMLInputElement).value)) }));
  };
  const compareBtn = h('button', { class: 'btn secondary', 'aria-label': t.editor.holdOriginal }, t.editor.holdOriginal);
  const hold = (on: boolean) => () => { showOriginal = on; schedule(); };
  compareBtn.addEventListener('pointerdown', hold(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) compareBtn.addEventListener(ev, hold(false));

  const brushPanel = h('section', { class: 'sheet', hidden: true, 'aria-label': t.editor.removeBg },
    h('div', { class: 'row' }, modeErase, modeRestore),
    slider(t.editor.size, 6, 90, radiusPx, (v) => { radiusPx = v; }),
    slider(t.editor.hardness, 0, 100, Math.round(hardness * 100), (v) => { hardness = v / 100; }),
    compareBtn);

  // --- brush input
  let last: { x: number; y: number } | null = null;
  const toImage = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, k: W / r.width };
  };
  function stamp(x: number, y: number, k: number) {
    paintBrush(p!.mask!, W, H, x, y, radiusPx * k, hardness, mode);
  }
  canvas.addEventListener('pointerdown', (e) => {
    if (!p.mask || job) return;
    canvas.setPointerCapture(e.pointerId);
    undo.push(p.mask.slice()); if (undo.length > UNDO_LIMIT) undo.shift();
    redo = []; syncHistory();
    const pt = toImage(e);
    stamp(pt.x, pt.y, pt.k); last = pt; schedule();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!last || !p.mask) return;
    const pt = toImage(e);
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y);
    const stepPx = Math.max(1, (radiusPx * pt.k) / 3);
    for (let d = stepPx; d <= dist; d += stepPx) stamp(last.x + ((pt.x - last.x) * d) / dist, last.y + ((pt.y - last.y) * d) / dist, pt.k);
    stamp(pt.x, pt.y, pt.k);
    last = pt; schedule();
  });
  for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { last = null; });

  // --- remove background (runs in a worker)
  const overlayText = h('p', {}, t.editor.working);
  const overlay = h('div', { class: 'overlay', hidden: true, role: 'status' },
    overlayText,
    h('button', { class: 'btn secondary', onclick: () => job?.cancel() }, t.editor.cancel));
  const runBtn = h('button', { class: 'btn primary', onclick: () => runRemoveBg() }, t.editor.runRemoveBg);

  async function runRemoveBg() {
    if (job) return;
    overlay.hidden = false; runBtn.disabled = true;
    const j = segment(p!.rgba, W, H, () => {});
    job = j;
    try {
      const mask = await j.promise;
      p!.mask = mask; undo = []; redo = []; syncHistory();
      brushPanel.hidden = false; runBtn.textContent = t.editor.removeBg;
      projects.touch(p!); schedule();
      toast(t.editor.cutoutDone);
    } catch (err) {
      const code = err instanceof SegmentError ? err.code : 'failed';
      if (code === 'model_missing') toast(t.editor.modelMissing, 'error');
      else if (code !== 'cancelled') toast(t.editor.failed, 'error');
    } finally {
      job = null; overlay.hidden = true; runBtn.disabled = false;
    }
  }

  // --- export sheet (S16)
  let format: Format = 'png';
  let quality = 0.92;
  let lastBlob: Blob | null = null;
  let lastName = '';
  const exportSheet = h('section', { class: 'sheet export', hidden: true, 'aria-label': t.export.title });
  function openExport() {
    if (!p!.mask) { toast(t.editor.needCutout); return; }
    exportSheet.hidden = false;
    renderExportSheet();
  }
  function renderExportSheet(state: 'idle' | 'busy' = 'idle', saved?: string, canShare = false) {
    const fmt = (f: Format, label: string): HTMLButtonElement =>
      h('button', { class: 'chip', 'aria-pressed': String(format === f), onclick: () => { format = f; renderExportSheet(); } }, label);
    const q = h('div', { class: 'row', hidden: format !== 'jpg' },
      h('label', { for: 'q' }, t.export.quality),
      h('input', { id: 'q', type: 'range', min: 50, max: 100, value: Math.round(quality * 100),
        oninput: (e: Event) => { quality = Number((e.target as HTMLInputElement).value) / 100; } }));
    // conditional children may be null; setChildren skips them.
    const parts: (Node | null)[] = [
      h('h2', {}, t.export.title),
      h('div', { class: 'row' }, fmt('png', t.export.png), fmt('jpg', t.export.jpg)),
      h('p', { class: 'muted' }, format === 'png' ? t.export.pngNote : t.export.jpgNote),
      q,
      state === 'busy' ? h('p', { 'aria-live': 'polite' }, t.export.rendering) : null,
      saved ? h('p', { class: 'ok', role: 'status' }, saved) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: state === 'busy', onclick: doSave }, t.export.save),
        canShare ? h('button', { class: 'btn secondary', onclick: () => shareBlob(lastBlob!, lastName).catch(() => toast(t.export.saveFailed, 'error')) }, t.export.share) : null,
        h('button', { class: 'btn ghost', onclick: () => { exportSheet.hidden = true; } }, t.editor.cancel)),
    ];
    setChildren(exportSheet, ...parts);
  }
  function savedMessage(s: Saved, name: string): string {
    if (s.where === 'gallery') return t.export.savedGallery;
    if (s.where === 'documents') return `${t.export.savedDocuments}Documents/PhotoEditor/${name}`;
    if (s.where === 'cache') return t.export.savedCache;
    return t.export.savedWeb;
  }
  async function doSave() {
    renderExportSheet('busy');
    try {
      const blob = await renderExport(p!.bitmap, p!.mask!, W, H, format, quality);
      const name = `${p!.title}-${Date.now()}.${format}`;
      const saved = await saveFile(blob, name);
      lastBlob = blob; lastName = name;
      renderExportSheet('idle', savedMessage(saved, name), saved.where !== 'download');
    } catch {
      renderExportSheet();
      toast(t.export.saveFailed, 'error');
    }
  }

  // --- tool strip (only background removal is built in this slice)
  const tool = (label: string, active = false) =>
    h('button', { class: 'tool', 'aria-pressed': String(active), onclick: active ? undefined : () => toast(t.editor.soon) }, label);

  const el = h('main', { class: 'editor' },
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t.editor.back, onclick: () => go('/') }, '→'),
      h('div', { class: 'spacer' }), undoBtn, redoBtn, exportBtn),
    h('div', { class: 'stage checker' }, canvas, overlay),
    h('div', { class: 'actions' }, runBtn),
    brushPanel, exportSheet,
    h('nav', { class: 'toolstrip', 'aria-label': 'tools' },
      tool(t.tools.removeBg, true), tool(t.tools.background), tool(t.tools.removeObject),
      tool(t.tools.text), tool(t.tools.fonts), tool(t.tools.crop)));

  draw();
  return { el, dispose: () => { job?.cancel(); if (raf) cancelAnimationFrame(raf); } };
}

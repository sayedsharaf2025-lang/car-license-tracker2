import { h, setChildren, toast } from '../ui.ts';
import { t } from '../copy.ts';
import { go, reload, type Screen } from '../router.ts';
import { projects } from '../data/store.ts';
import { compositeCutout, paintBrush, resizeMaskBilinear, type BrushMode } from '../lib/maskMath.ts';
import { inpaint } from '../lib/inpaint.ts';
import { fillHoles, prepareMigan, miganStatus, MiganError, type MiganStage } from '../lib/migan.ts';
import { findFonts, cropSel, type Sel } from '../lib/fontFinder.ts';
import { readText, detectText } from '../lib/ocr.ts';
import { workingCopy } from '../lib/image.ts';
import { segment, SegmentError } from '../lib/segment.ts';
import { renderExport, saveFile, shareBlob, formatOfMime, type Format, type Saved } from '../lib/export.ts';
import { drawScene, hitTest, type Box, type Background, type TextLayer } from '../lib/scene.ts';
import { FONTS, fontsFor, loadFont, scriptOf, fontCss } from '../lib/fonts.ts';
import { paintRects, padRect, inkColor } from '../lib/inpaintMath.ts';
import { toGray, inkMask } from '../lib/fontMatch.ts';
import type { Rect } from '../lib/ocrMath.ts';
import { clampRect, moveRect, nearestCorner, dragCorner, aspectBox, polyBBox, type CRect, type Corner } from '../lib/geometry.ts';
import { SHAPES, shapePath, type Shape, type Pt } from '../lib/shapes.ts';
import { cropProject, resizeProject, undoGeometry } from '../lib/transform.ts';
import { DEFAULT_ENHANCE, autoSettings, enhancePixels, type EnhanceSettings } from '../lib/enhance.ts';

const UNDO_LIMIT = 10;
type Tool = 'cut' | 'bg' | 'text' | 'obj' | 'font' | 'edit' | 'crop' | 'clone' | 'enhance';

// S04 editor + S05 remove background + S06 background + S13 text + S16 export.
export function editorScreen(): Screen {
  const p = projects.current();
  if (!p) { queueMicrotask(() => go('/')); return { el: h('div') }; }
  const W = p.w, H = p.h;

  let tool: Tool = 'cut';
  let mode: BrushMode = 'erase';
  let radiusPx = 28, hardness = 0.7;
  let showOriginal = false;
  type HistoryState = { mask: Uint8Array | null; texts: TextLayer[]; bg: Background; rgba?: Uint8ClampedArray; bitmapPixels?: Uint8ClampedArray; bitmapW?: number; bitmapH?: number };
  let undo: HistoryState[] = [], redo: HistoryState[] = [];
  let job: { cancel: () => void } | null = null;
  let raf = 0;
  let boxes: Box[] = [];
  let selected: string | null = null;
  const objMask = new Uint8Array(W * H);
  let sel: Sel | null = null;
  let objMode: 'paint' | 'rub' = 'paint';
  let detected: Rect[] = [], pick = -1;
  let crop: CRect = { x0: 0, y0: 0, x1: W, y1: H };
  let cropShape: Shape = 'rect', cropRound = 0.25, cropAspect: number | null = null;
  let freePts: Pt[] = [];
  let cropDrag: { kind: 'move' | 'corner' | 'free'; corner?: Corner; sx: number; sy: number; start: CRect } | null = null;
  const ovCanvas = document.createElement('canvas'); ovCanvas.width = W; ovCanvas.height = H;
  const ovFrame = new ImageData(W, H);

  const canvas = h('canvas', { class: 'stage-canvas', width: W, height: H, 'aria-label': p.title, role: 'img' });
  const ctx = canvas.getContext('2d')!;
  const cutCanvas = document.createElement('canvas');
  cutCanvas.width = W; cutCanvas.height = H;
  const cutCtx = cutCanvas.getContext('2d')!;
  const frame = new ImageData(W, H);

  function draw() {
    raf = 0;
    if (p!.mask && !showOriginal) compositeCutout(p!.rgba, p!.mask, frame.data); else frame.data.set(p!.rgba);
    cutCtx.putImageData(frame, 0, 0);
    boxes = drawScene(ctx, W, H, showOriginal ? { kind: 'transparent' } : p!.bg, cutCanvas, showOriginal ? [] : p!.texts);
    if (tool === 'obj') {
      for (let i = 0; i < objMask.length; i++) { const a = objMask[i] > 127 ? 150 : 0; ovFrame.data[i * 4] = 255; ovFrame.data[i * 4 + 1] = 60; ovFrame.data[i * 4 + 2] = 60; ovFrame.data[i * 4 + 3] = a; }
      ovCanvas.getContext('2d')!.putImageData(ovFrame, 0, 0); ctx.drawImage(ovCanvas, 0, 0);
    }
    if (tool === 'edit') detected.forEach((r, i) => { ctx.strokeStyle = i === pick ? '#ffd23d' : '#3ddc97'; ctx.lineWidth = Math.max(i === pick ? 4 : 2, W / 400); ctx.strokeRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); });
    if (tool === 'crop') drawCropOverlay();
    if (tool === 'clone') {
      ctx.save();
      if (choosingCloneSource && cloneCursorPos) {
        const x=cloneCursorPos.x, y=cloneCursorPos.y, q=Math.max(9,W/90);
        ctx.strokeStyle='#fff'; ctx.lineWidth=Math.max(1.5,W/500); ctx.beginPath();
        ctx.moveTo(x-q,y); ctx.lineTo(x+q,y); ctx.moveTo(x,y-q); ctx.lineTo(x,y+q); ctx.stroke();
      }
      if (currentSourcePos) {
        ctx.fillStyle='rgba(45,205,120,.22)'; ctx.strokeStyle='rgba(45,205,120,.95)';
        ctx.lineWidth=Math.max(1.5,W/500); ctx.beginPath(); ctx.arc(currentSourcePos.x,currentSourcePos.y,radiusPx,0,Math.PI*2); ctx.fill(); ctx.stroke();
      }
      if (cloneCursorPos) {
        ctx.strokeStyle='rgba(255,255,255,.95)'; ctx.lineWidth=Math.max(1,W/650);
        ctx.beginPath(); ctx.arc(cloneCursorPos.x,cloneCursorPos.y,radiusPx,0,Math.PI*2); ctx.stroke();
      }
      ctx.restore();
    }
    if (tool === 'font' && sel) { ctx.strokeStyle = '#3ddc97'; ctx.lineWidth = Math.max(2, W / 300); ctx.setLineDash([12, 8]); ctx.strokeRect(sel.x0, sel.y0, sel.x1 - sel.x0, sel.y1 - sel.y0); ctx.setLineDash([]); }
    const b = boxes.find((x) => x.id === selected);
    if (b && tool === 'text') { ctx.strokeStyle = '#5b8def'; ctx.lineWidth = Math.max(2, W / 300); ctx.strokeRect(b.x0 - 6, b.y0 - 6, b.x1 - b.x0 + 12, b.y1 - b.y0 + 12); }
  }
  function drawCropOverlay() {
    const c = crop, lw = Math.max(2, W / 300), free = cropShape === 'free';
    const outline = free ? shapePath('free', 0, 0, 0, 0, 0, freePts) : shapePath(cropShape, c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0, cropRound);
    if (!free || freePts.length > 2) {
      const dim = new Path2D(); const full = new Path2D(); full.rect(0, 0, W, H); dim.addPath(full); dim.addPath(outline);
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fill(dim, 'evenodd'); ctx.restore();
    }
    ctx.strokeStyle = '#fff'; ctx.lineWidth = lw; ctx.setLineDash([14, 8]);
    if (free && freePts.length > 1 && freePts.length < 3) { ctx.beginPath(); ctx.moveTo(freePts[0].x, freePts[0].y); ctx.lineTo(freePts[1].x, freePts[1].y); ctx.stroke(); } else ctx.stroke(outline);
    ctx.setLineDash([]);
    if (free && !cropDrag && freePts.length < 3) return;
    ctx.strokeStyle = '#5b8def'; ctx.strokeRect(c.x0, c.y0, c.x1 - c.x0, c.y1 - c.y0);
    if (free) return;
    const hs = Math.max(14, W / 40); ctx.fillStyle = '#5b8def';
    for (const [x, y] of [[c.x0, c.y0], [c.x1, c.y0], [c.x0, c.y1], [c.x1, c.y1]]) ctx.fillRect(x - hs / 2, y - hs / 2, hs, hs);
  }
  const schedule = () => {
    projects.touch(p!);
    if (!raf) raf = requestAnimationFrame(draw);
  };

  // top bar
  const undoBtn = h('button', { class: 'icon-btn', 'aria-label': t.editor.undo, disabled: true, onclick: () => step(undo, redo) }, '↶');
  const redoBtn = h('button', { class: 'icon-btn', 'aria-label': t.editor.redo, disabled: true, onclick: () => step(redo, undo) }, '↷');
  const syncHistory = () => { undoBtn.disabled = !undo.length; redoBtn.disabled = !redo.length; };
  function snapshot(includePixels = false): HistoryState {
    return { mask: p!.mask?.slice() ?? null, texts: structuredClone(p!.texts), bg: p!.bg,
      ...(includePixels ? { rgba: p!.rgba.slice(), ...(() => { const c = document.createElement('canvas'); c.width = p!.bitmap.width; c.height = p!.bitmap.height; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(p!.bitmap, 0, 0); return { bitmapPixels: x.getImageData(0, 0, c.width, c.height).data.slice(), bitmapW: c.width, bitmapH: c.height }; })() } : {}) };
  }
  function captureHistory(includePixels = false) {
    undo.push(snapshot(includePixels));
    if (undo.length > 20) undo.shift();
    redo = []; syncHistory();
  }
  function step(from: HistoryState[], to: HistoryState[]) {
    const snap = from.pop();
    if (!snap) return;
    to.push(snapshot(!!snap.rgba));
    p!.mask = snap.mask?.slice() ?? null;
    p!.texts = structuredClone(snap.texts); p!.bg = snap.bg;
    if (snap.rgba) p!.rgba = snap.rgba.slice();
    if (snap.bitmapPixels && snap.bitmapW && snap.bitmapH) { const c = document.createElement('canvas'); c.width = snap.bitmapW; c.height = snap.bitmapH; const pixels = new Uint8ClampedArray(new ArrayBuffer(snap.bitmapPixels.length)); pixels.set(snap.bitmapPixels); c.getContext('2d')!.putImageData(new ImageData(pixels, snap.bitmapW, snap.bitmapH), 0, 0); void createImageBitmap(c).then((b) => { p!.bitmap = b; projects.touch(p!); }); }
    syncHistory(); renderText(); renderBg(); schedule(); projects.touch(p!);
  }

  const chip = (label: string, pressed: boolean, on: () => void): HTMLButtonElement =>
    h('button', { class: 'chip', 'aria-pressed': String(pressed), onclick: on }, label);
  const slider = (label: string, min: number, max: number, val: number, on: (v: number) => void) => {
    const id = 's' + Math.random().toString(36).slice(2, 7);
    return h('div', { class: 'row' }, h('label', { for: id }, label),
      h('input', { id, type: 'range', min, max, value: val, onpointerdown: () => { if (label === t.text.size || label === 'زاوية الدوران') captureHistory(); }, oninput: (e: Event) => on(Number((e.target as HTMLInputElement).value)) }));
  };

  // --- cut panel (S05)
  const modeErase: HTMLButtonElement = chip(t.editor.erase, true, () => setMode('erase'));
  const modeRestore: HTMLButtonElement = chip(t.editor.restore, false, () => setMode('restore'));
  function setMode(m: BrushMode) { mode = m; modeErase.setAttribute('aria-pressed', String(m === 'erase')); modeRestore.setAttribute('aria-pressed', String(m === 'restore')); }
  const compareBtn = h('button', { class: 'btn secondary' }, t.editor.holdOriginal);
  const hold = (on: boolean) => () => { showOriginal = on; schedule(); };
  compareBtn.addEventListener('pointerdown', hold(true));
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) compareBtn.addEventListener(ev, hold(false));
  const cutPanel = h('section', { class: 'sheet', hidden: true },
    h('div', { class: 'row' }, modeErase, modeRestore),
    slider(t.editor.size, 6, 90, radiusPx, (v) => { radiusPx = v; }),
    slider(t.editor.hardness, 0, 100, 70, (v) => { hardness = v / 100; }), compareBtn);

  // --- background panel (S06)
  const colorInput: HTMLInputElement = h('input', { type: 'color', value: '#ffffff', 'aria-label': t.bg.color, onfocus: () => captureHistory(), oninput: () => { p.bg = { kind: 'color', color: colorInput.value }; renderBg(); schedule(); } });
  const imageInput: HTMLInputElement = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden', id: 'bg-input', onchange: async () => {
    const f = imageInput.files?.[0]; imageInput.value = '';
    if (!f) return;
    try { const bitmap = await createImageBitmap(f, { imageOrientation: 'from-image' }); captureHistory(); p.bg = { kind: 'image', bitmap }; renderBg(); schedule(); }
    catch { toast(t.bg.failed, 'error'); }
  } });
  const bgPanel = h('section', { class: 'sheet', hidden: true });
  function renderBg() {
    setChildren(bgPanel,
      h('div', { class: 'row' },
        chip(t.bg.transparent, p!.bg.kind === 'transparent', () => { captureHistory(); p!.bg = { kind: 'transparent' }; renderBg(); schedule(); }),
        chip(t.bg.color, p!.bg.kind === 'color', () => { captureHistory(); p!.bg = { kind: 'color', color: colorInput.value }; renderBg(); schedule(); }),
        colorInput),
      h('div', { class: 'row' }, h('label', { class: 'btn secondary', for: 'bg-input' }, t.bg.pickImage), imageInput));
  }

  // --- text panel (S13)
  const textArea: HTMLTextAreaElement = h('textarea', { class: 'field', rows: 2, 'aria-label': t.text.input, onfocus: () => captureHistory(), oninput: () => { const l = cur(); if (l) { l.text = textArea.value || ' '; schedule(); } } });
  const textColor: HTMLInputElement = h('input', { type: 'color', value: '#ffffff', 'aria-label': t.text.color, onfocus: () => captureHistory(), oninput: () => { const l = cur(); if (l) { l.color = textColor.value; schedule(); } } });
  const fontRow = h('div', { class: 'row fontrow' });
  const textPanel = h('section', { class: 'sheet', hidden: true });
  const cur = () => p.texts.find((x) => x.id === selected) ?? null;
  function renderText() {
    const l = cur();
    const first = fontsFor(l?.text ?? 'ن');
    fontRow.replaceChildren(...[...first, ...FONTS.filter((f) => !first.includes(f))].map((f) => {
      const b = chip(f, l?.font === f, () => { if (l) { captureHistory(); l.font = f; loadFont(f).then(schedule); renderText(); schedule(); } });
      b.style.fontFamily = `"${f}", sans-serif`; return b;
    }));
    setChildren(textPanel,
      h('button', { class: 'btn primary', onclick: addText }, t.text.add),
      l ? textArea : h('p', { class: 'muted' }, t.text.hint),
      l ? fontRow : null,
      l ? slider(t.text.size, 3, 20, Math.round(l.size * 100), (v) => { l.size = v / 100; schedule(); }) : null,
      l ? slider('زاوية الدوران', 0, 360, Math.round(l.rotation ?? 0), (v) => { l.rotation = v; schedule(); }) : null,
      l ? h('div', { class: 'row' }, h('label', {}, t.text.color), textColor) : null,
      h('h3', {}, 'الطبقات'),
      ...p!.texts.map((layer) => h('div', { class: 'layer-row' },
        h('button', { class: 'chip', 'aria-pressed': String(layer.id === selected), onclick: () => { selected = layer.id; renderText(); schedule(); } }, layer.text.slice(0, 24) || 'نص فارغ'),
        h('button', { class: 'chip', 'aria-label': layer.visible === false ? 'إظهار الطبقة' : 'إخفاء الطبقة', onclick: () => { captureHistory(); layer.visible = layer.visible === false; renderText(); schedule(); } }, layer.visible === false ? 'إظهار' : 'إخفاء'),
        h('button', { class: 'chip', 'aria-label': 'حذف الطبقة', onclick: () => { captureHistory(); p!.texts = p!.texts.filter((x) => x.id !== layer.id); if (selected === layer.id) selected = null; renderText(); schedule(); } }, 'حذف'))),
      l ? h('button', { class: 'btn ghost', onclick: () => { captureHistory(); p!.texts = p!.texts.filter((x) => x.id !== l.id); selected = null; renderText(); schedule(); } }, t.text.del) : null);
    if (l) { textArea.value = l.text; textColor.value = l.color; }
  }
  function addText() {
    const l = { id: crypto.randomUUID(), text: t.text.sample, font: FONTS[0], size: 0.09, color: '#ffffff', cx: 0.5, cy: 0.5 };
    captureHistory(); p!.texts.push(l); selected = l.id;
    loadFont(l.font).then(schedule); renderText(); schedule();
  }

  // --- offline photo enhancement
  let enhanceSettings: EnhanceSettings = { ...DEFAULT_ENHANCE };
  const enhancePanel = h('section', { class: 'sheet', hidden: true });
  async function applyEnhancement() {
    if (job) return;
    overlay.hidden = false; setOverlay('جاري تحسين الصورة...');
    await new Promise((r) => setTimeout(r, 20));
    try {
      const c = document.createElement('canvas'); c.width = p!.bitmap.width; c.height = p!.bitmap.height;
      const x = c.getContext('2d', { willReadFrequently: true })!;
      x.drawImage(p!.bitmap, 0, 0);
      const image = x.getImageData(0, 0, c.width, c.height);
      captureHistory(true);
      image.data.set(enhancePixels(image.data, c.width, c.height, enhanceSettings));
      x.putImageData(image, 0, 0);
      p!.bitmap = await createImageBitmap(c);
      p!.rgba = workingCopy(p!.bitmap).rgba;
      projects.touch(p!); schedule(); toast('تم تطبيق التحسينات');
    } catch { toast('تعذر تحسين الصورة', 'error'); }
    finally { overlay.hidden = true; setOverlay(t.editor.working); }
  }
  function renderEnhance() {
    const set = (key: keyof EnhanceSettings, value: number) => { enhanceSettings = { ...enhanceSettings, [key]: value }; };
    setChildren(enhancePanel,
      h('p', { class: 'muted' }, 'تحسين محلي على الجهاز؛ لا يتم إرسال الصورة إلى الإنترنت.'),
      h('div', { class: 'row' },
        chip('تلقائي', false, () => { enhanceSettings = { ...DEFAULT_ENHANCE, ...autoSettings(p!.rgba), sharpen: 12, denoise: 8 }; renderEnhance(); }),
        chip('إعادة ضبط', false, () => { enhanceSettings = { ...DEFAULT_ENHANCE }; renderEnhance(); })),
      slider('الإضاءة', -50, 50, enhanceSettings.brightness, (v) => set('brightness', v)),
      slider('التباين', -50, 50, enhanceSettings.contrast, (v) => set('contrast', v)),
      slider('تشبع الألوان', -100, 100, enhanceSettings.saturation, (v) => set('saturation', v)),
      slider('دفء الألوان', -100, 100, enhanceSettings.warmth, (v) => set('warmth', v)),
      slider('حدة التفاصيل', 0, 100, enhanceSettings.sharpen, (v) => set('sharpen', v)),
      slider('تقليل التشويش', 0, 100, enhanceSettings.denoise, (v) => set('denoise', v)),
      h('button', { class: 'btn primary', onclick: applyEnhancement }, 'تطبيق التحسين على الصورة'));
  }

  // --- clone stamp: photo texture/background retouching
  let cloneAligned = true;
  let cloneSource: { x: number; y: number } | null = null;
  let cloneOffset: { x: number; y: number } | null = null;
  let currentSourcePos: { x: number; y: number } | null = null;
  let isCloning = false, choosingCloneSource = true, cloneOpacity = 0.85, cloneHardness = 0.75;
  let cloneCursorPos: { x: number; y: number } | null = null;
  let cloneCanvas: HTMLCanvasElement | null = null, cloneCtx: CanvasRenderingContext2D | null = null;
  let cloneSample: HTMLCanvasElement | null = null, cloneSampleCtx: CanvasRenderingContext2D | null = null;
  let cloneStampCanvas: HTMLCanvasElement | null = null, cloneStampCtx: CanvasRenderingContext2D | null = null;
  const cloneSourceBtn = h('button', { class: 'btn primary', onclick: () => {
    cloneSource = null; cloneOffset = null; currentSourcePos = null; isCloning = false;
    choosingCloneSource = true; cloneSourceBtn.textContent = 'حدد المصدر على الصورة';
    cloneClearBtn.hidden = true; canvas.classList.add('clone-pick-source'); toast('اضغط على منطقة نظيفة لتحديد المصدر'); schedule();
  } }, 'حدد المصدر على الصورة');
  const cloneClearBtn = h('button', { class: 'btn ghost', hidden: true, onclick: () => {
    cloneSource = null; cloneOffset = null; currentSourcePos = null; isCloning = false; choosingCloneSource = true;
    cloneSourceBtn.textContent = 'حدد المصدر على الصورة'; cloneClearBtn.hidden = true;
    canvas.classList.add('clone-pick-source'); toast('تم مسح المصدر'); schedule();
  } }, 'مسح المصدر');
  const cloneAlignedBtn: HTMLButtonElement = chip('محاذي (Aligned)', true, () => {
    cloneAligned = !cloneAligned; cloneOffset = null; cloneAlignedBtn.setAttribute('aria-pressed', String(cloneAligned));
    cloneAlignedBtn.textContent = cloneAligned ? 'محاذي (Aligned)' : 'غير محاذي (Free)';
    if (!cloneAligned) cloneOffset = null;
  });
  const clonePanel = h('section', { class: 'sheet', hidden: true },
    h('p', { class: 'muted' }, 'استنساخ نسيج الخلفية أو أجزاء الصورة لترميم العيوب. اختر المصدر أولاً ثم ارسم فوق المنطقة المطلوبة.'),
    h('div', { class: 'row' }, cloneSourceBtn, cloneClearBtn, cloneAlignedBtn),
    slider('حجم الفرشاة', 6, 120, radiusPx, (v) => { radiusPx = v; schedule(); }),
    slider('نعومة الحواف', 0, 100, Math.round(cloneHardness * 100), (v) => { cloneHardness = v / 100; schedule(); }),
    slider('الشفافية', 10, 100, Math.round(cloneOpacity * 100), (v) => { cloneOpacity = v / 100; schedule(); }),
    h('p', { class: 'muted' }, 'في الوضع المحاذي يتبع المصدر الفرشاة مع ثبات الإزاحة بين الضربات. أوقف المحاذاة لإعادة المصدر إلى موضعه الأصلي مع كل ضربة.'));
  function beginCloneStroke(pt: { x: number; y: number }) {
    if (isCloning) return false;
    if (choosingCloneSource || !cloneSource) {
      cloneSource = { x: pt.x, y: pt.y }; cloneOffset = null; currentSourcePos = null;
      choosingCloneSource = false; cloneSourceBtn.textContent = 'تغيير نقطة المصدر';
      cloneClearBtn.hidden = false; canvas.classList.remove('clone-pick-source');
      toast('تم تحديد المصدر. ارسم الآن في المكان المطلوب.'); schedule(); return false;
    }
    const bw = p!.bitmap.width, bh = p!.bitmap.height, sx = bw / W, sy = bh / H;
    if (!cloneAligned || !cloneOffset) cloneOffset = { x: (cloneSource.x - pt.x) * sx, y: (cloneSource.y - pt.y) * sy };
    captureHistory(true);
    cloneCanvas = document.createElement('canvas'); cloneCanvas.width = bw; cloneCanvas.height = bh;
    cloneCtx = cloneCanvas.getContext('2d')!; cloneCtx.drawImage(p!.bitmap, 0, 0);
    cloneSample = document.createElement('canvas'); cloneSample.width = bw; cloneSample.height = bh;
    cloneSampleCtx = cloneSample.getContext('2d')!; cloneSampleCtx.drawImage(p!.bitmap, 0, 0);
    cloneStampCanvas = document.createElement('canvas'); cloneStampCtx = cloneStampCanvas.getContext('2d')!;
    isCloning = true; paintClone(pt.x, pt.y); return true;
  }
  function paintClone(x: number, y: number) {
    if (!isCloning || !cloneCtx || !cloneSample || !cloneOffset) return;
    const sx = p!.bitmap.width / W, sy = p!.bitmap.height / H;
    const cx = x * sx, cy = y * sy, r = radiusPx * (sx + sy) / 2;
    const dx = cloneOffset.x, dy = cloneOffset.y;
    const size = Math.max(2, Math.ceil(2 * r));
    if (!cloneStampCanvas || cloneStampCanvas.width !== size) {
      cloneStampCanvas = document.createElement('canvas'); cloneStampCanvas.width = cloneStampCanvas.height = size;
      cloneStampCtx = cloneStampCanvas.getContext('2d')!;
    }
    if (!cloneStampCtx || !cloneStampCanvas) return;
    cloneStampCtx.clearRect(0, 0, size, size);
    cloneStampCtx.globalCompositeOperation = 'source-over';
    cloneStampCtx.drawImage(cloneSample, cx - r + dx, cy - r + dy, 2 * r, 2 * r, 0, 0, size, size);
    cloneStampCtx.globalCompositeOperation = 'destination-in';
    const inner = size * 0.5 * cloneHardness;
    const grad = cloneStampCtx.createRadialGradient(size / 2, size / 2, inner, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,1)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    cloneStampCtx.fillStyle = grad; cloneStampCtx.fillRect(0, 0, size, size);
    cloneStampCtx.globalCompositeOperation = 'source-over';
    cloneCtx.save(); cloneCtx.globalAlpha = cloneOpacity;
    cloneCtx.drawImage(cloneStampCanvas, cx - r, cy - r, 2 * r, 2 * r); cloneCtx.restore();
    currentSourcePos = { x: x + cloneOffset.x / sx, y: y + cloneOffset.y / sy };
  }
  async function finishCloneStroke() {
    if (!cloneCanvas || !cloneCtx) { isCloning = false; return; }
    const finished = cloneCanvas;
    try {
      p!.bitmap = await createImageBitmap(finished); p!.rgba = workingCopy(p!.bitmap).rgba;
      projects.touch(p!); schedule();
    } catch { toast('تعذر تطبيق الاستنساخ', 'error'); }
    isCloning = false; cloneCanvas = cloneSample = cloneStampCanvas = null;
    cloneCtx = cloneSampleCtx = cloneStampCtx = null; currentSourcePos = null;
  }

  // --- viewport: zoom/pan changes only the preview, never the photo pixels or export dimensions
  let zoom = 1, panX = 0, panY = 0, panMode = false;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { distance: number; zoom: number; midX: number; midY: number; panX: number; panY: number } | null = null;
  const applyView = () => { canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`; zoomLabel.textContent = `${Math.round(zoom * 100)}%`; };
  const zoomLabel = h('span', { class: 'zoom-label', 'aria-live': 'polite' }, '100%');
  const zoomIn = h('button', { class: 'zoom-btn', 'aria-label': 'تكبير', onclick: () => { zoom = Math.min(5, zoom * 1.25); applyView(); } }, '+');
  const zoomOut = h('button', { class: 'zoom-btn', 'aria-label': 'تصغير', onclick: () => { zoom = Math.max(1, zoom / 1.25); if (zoom === 1) panX = panY = 0; applyView(); } }, '−');
  const zoomReset = h('button', { class: 'zoom-btn zoom-reset', onclick: () => { zoom = 1; panX = panY = 0; applyView(); } }, 'ملاءمة');
  const panToggle = h('button', { class: 'zoom-btn', 'aria-pressed': 'false', onclick: () => { panMode = !panMode; panToggle.setAttribute('aria-pressed', String(panMode)); panToggle.textContent = panMode ? 'تحريك: يعمل' : 'تحريك'; } }, 'تحريك');
  const viewControls = h('div', { class: 'view-controls', 'aria-label': 'التحكم في عرض الصورة' }, zoomOut, zoomLabel, zoomIn, zoomReset, panToggle);

  // --- pointer input: brush (cut tool) or move text (text tool)
  let fontDrag = false;
  let last: { x: number; y: number } | null = null, drag: { dx: number; dy: number } | null = null;
  let panPointer: { id: number; x: number; y: number; startX: number; startY: number } | null = null;
  const toImage = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H, k: W / r.width };
  };
  const stamp = (x: number, y: number, k: number) => (tool === 'obj' ? paintBrush(objMask, W, H, x, y, radiusPx * k, hardness, objMode === 'rub' ? 'erase' : 'restore') : paintBrush(p.mask!, W, H, x, y, radiusPx * k, hardness, mode));
  canvas.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const pair = [...pointers.values()], dx = pair[1].x - pair[0].x, dy = pair[1].y - pair[0].y;
      const midX = (pair[0].x + pair[1].x) / 2, midY = (pair[0].y + pair[1].y) / 2;
      pinch = { distance: Math.max(1, Math.hypot(dx, dy)), zoom, midX, midY, panX, panY };
      last = null; drag = null; cropDrag = null; fontDrag = false;
      canvas.setPointerCapture(e.pointerId); return;
    }
    if (panMode) { panPointer = { id: e.pointerId, x: e.clientX, y: e.clientY, startX: panX, startY: panY }; canvas.setPointerCapture(e.pointerId); return; }
    const pt = toImage(e);
    if (tool === 'text') {
      selected = hitTest(boxes, pt.x, pt.y);
      const l = cur();
      if (l) { captureHistory(); canvas.setPointerCapture(e.pointerId); drag = { dx: l.cx - pt.x / W, dy: l.cy - pt.y / H }; }
      renderText(); schedule(); return;
    }
    if (tool === 'font') { canvas.setPointerCapture(e.pointerId); sel = { x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y }; fontDrag = true; schedule(); return; }
    if (tool === 'obj') { canvas.setPointerCapture(e.pointerId); stamp(pt.x, pt.y, pt.k); last = pt; schedule(); return; }
    if (tool === 'clone') { canvas.setPointerCapture(e.pointerId); if (beginCloneStroke(pt)) { last = pt; schedule(); } return; }
    if (tool === 'edit') { const i = detected.findIndex((r) => pt.x >= r.x0 && pt.x <= r.x1 && pt.y >= r.y0 && pt.y <= r.y1); if (i >= 0) void pickLine(i); return; }
    if (tool === 'crop') { cropDown(pt, e); return; }
    if (tool !== 'cut' || !p.mask || job) return;
    canvas.setPointerCapture(e.pointerId);
    captureHistory(); stamp(pt.x, pt.y, pt.k); last = pt; schedule();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size >= 2) {
      const pair = [...pointers.values()], dx = pair[1].x - pair[0].x, dy = pair[1].y - pair[0].y;
      const midX = (pair[0].x + pair[1].x) / 2, midY = (pair[0].y + pair[1].y) / 2;
      zoom = Math.max(1, Math.min(5, pinch.zoom * Math.hypot(dx, dy) / pinch.distance));
      panX = pinch.panX + midX - pinch.midX; panY = pinch.panY + midY - pinch.midY;
      if (zoom === 1) panX = panY = 0;
      applyView(); return;
    }
    if (panPointer?.id === e.pointerId) { panX = panPointer.startX + e.clientX - panPointer.x; panY = panPointer.startY + e.clientY - panPointer.y; applyView(); return; }
    const pt = toImage(e);
    if (tool === 'clone') { cloneCursorPos = { x: pt.x, y: pt.y }; schedule(); }
    const l = cur();
    if (cropDrag) { cropMove(pt); return; }
    if (drag && l) { l.cx = pt.x / W + drag.dx; l.cy = pt.y / H + drag.dy; schedule(); return; }
    if (fontDrag && sel) { sel.x1 = Math.max(0, Math.min(W, pt.x)); sel.y1 = Math.max(0, Math.min(H, pt.y)); schedule(); return; }
    if (tool === 'clone' && last && isCloning) { const dist = Math.hypot(pt.x-last.x, pt.y-last.y), stepPx = Math.max(1, radiusPx/4); for (let d=stepPx; d<=dist; d+=stepPx) paintClone(last.x+(pt.x-last.x)*d/dist,last.y+(pt.y-last.y)*d/dist); paintClone(pt.x,pt.y); last=pt; schedule(); return; }
    if (!last || (tool !== 'obj' && !p.mask)) return;
    const dist = Math.hypot(pt.x - last.x, pt.y - last.y), stepPx = Math.max(1, (radiusPx * pt.k) / 3);
    for (let d = stepPx; d <= dist; d += stepPx) stamp(last.x + ((pt.x - last.x) * d) / dist, last.y + ((pt.y - last.y) * d) / dist, pt.k);
    stamp(pt.x, pt.y, pt.k); last = pt; schedule();
  });
  canvas.addEventListener('pointerleave', () => { if (!isCloning) { cloneCursorPos = null; if (tool === 'clone') schedule(); } });
  for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e: Event) => {
    const pe = e as PointerEvent; pointers.delete(pe.pointerId);
    if (pointers.size < 2) pinch = null;
    if (panPointer?.id === pe.pointerId) panPointer = null;
    last = null; drag = null; fontDrag = false; cropUp(); if (tool === 'clone' && cloneCanvas) void finishCloneStroke();
  });

  // --- remove object (S09): paint (or auto-select text), then fill with the MI-GAN model on the phone
  const setOverlay = (msg: string) => { (overlay.firstChild as HTMLElement).textContent = msg; };
  const stageText = (st: MiganStage) => setOverlay(st.stage === 'download'
    ? `${t.obj.downloading} ${st.total ? Math.round((100 * st.loaded) / st.total) + '%' : Math.round(st.loaded / 1e6) + ' MB'}`
    : st.stage === 'init' ? t.obj.init : t.obj.working);
  const objHint = h('p', { class: 'muted' }, t.obj.hint);
  const objPaint: HTMLButtonElement = chip(t.obj.paint, true, () => setObjMode('paint'));
  const objRub: HTMLButtonElement = chip(t.obj.rub, false, () => setObjMode('rub'));
  function setObjMode(m: 'paint' | 'rub') { objMode = m; objPaint.setAttribute('aria-pressed', String(m === 'paint')); objRub.setAttribute('aria-pressed', String(m === 'rub')); }
  const prefetch = h('button', { class: 'btn secondary', hidden: true, onclick: () => predownload() }, t.obj.predownload);
  void miganStatus().then((st) => { if (st === 'download') { objHint.textContent = t.obj.hintDownload; prefetch.hidden = false; } });
  const objPanel = h('section', { class: 'sheet', hidden: true },
    objHint, prefetch,
    h('div', { class: 'row' }, objPaint, objRub),
    slider(t.editor.size, 6, 90, radiusPx, (v) => { radiusPx = v; }),
    slider(t.editor.hardness, 0, 100, Math.round(hardness * 100), (v) => { hardness = v / 100; }),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => removeObject() }, t.obj.run),
      h('button', { class: 'btn ghost', onclick: () => { objMask.fill(0); schedule(); } }, t.obj.clear)),
    h('button', { class: 'btn secondary', onclick: () => autoSelectText() }, t.obj.autoText));

  async function predownload() {
    overlay.hidden = false; setOverlay(t.obj.downloading);
    const j = prepareMigan(stageText); job = j;
    try { await j.promise; prefetch.hidden = true; objHint.textContent = t.obj.hint; toast(t.obj.ready); }
    catch (err) { if (!(err instanceof MiganError && err.code === 'cancelled')) toast(t.obj.downloadFailed, 'error'); }
    finally { job = null; overlay.hidden = true; setOverlay(t.editor.working); }
  }

  /** AI fill; if the model cannot run (offline on first use, etc.) the old simple fill is used so the tool never dead-ends. */
  async function fillAI(fw: number, fh: number, rgba: Uint8ClampedArray, hole: Uint8Array): Promise<Uint8ClampedArray> {
    const j = fillHoles(rgba, fw, fh, hole, stageText); job = j;
    try { return await j.promise; }
    catch (err) {
      if (err instanceof MiganError && err.code === 'cancelled') throw err;
      toast(err instanceof MiganError && err.code === 'download_failed' ? t.obj.downloadFailed : t.obj.fallback, 'error');
      const copy = rgba.slice(); inpaint(copy, fw, fh, hole); return copy;
    } finally { job = null; }
  }

  /** Runs the fill on the full-size photo. `holeFn` builds the hole mask (1 = fill) at the photo's real size. */
  async function eraseRegion(holeFn: (fw: number, fh: number) => Uint8Array): Promise<boolean> {
    overlay.hidden = false; setOverlay(t.obj.working);
    await new Promise((r) => setTimeout(r, 30));
    try {
      const fw = p!.bitmap.width, fh = p!.bitmap.height;
      const c = document.createElement('canvas'); c.width = fw; c.height = fh;
      const cx = c.getContext('2d', { willReadFrequently: true })!; cx.drawImage(p!.bitmap, 0, 0);
      const img = cx.getImageData(0, 0, fw, fh);
      captureHistory(true);
      img.data.set(await fillAI(fw, fh, img.data, holeFn(fw, fh))); cx.putImageData(img, 0, 0);
      p!.bitmap = await createImageBitmap(c); p!.rgba = workingCopy(p!.bitmap).rgba; projects.touch(p!);
      return true;
    } catch (err) {
      if (!(err instanceof MiganError && err.code === 'cancelled')) toast(t.obj.failed, 'error');
      return false;
    } finally { overlay.hidden = true; setOverlay(t.editor.working); }
  }

  async function removeObject() {
    if (job || !objMask.some((v) => v > 127)) { toast(t.obj.empty); return; }
    const ok = await eraseRegion((fw, fh) => {
      const big = resizeMaskBilinear(objMask, W, H, fw, fh), hole = new Uint8Array(fw * fh);
      for (let i = 0; i < hole.length; i++) hole[i] = big[i] > 40 ? 1 : 0;
      return hole;
    });
    if (ok) { objMask.fill(0); schedule(); }
  }

  async function autoSelectText() {
    if (job) return;
    overlay.hidden = false; setOverlay(t.edit.detecting);
    try {
      const { words } = await detectText(p!.rgba, W, H);
      if (!words.length) { toast(t.obj.noText); return; }
      const pad = Math.max(3, Math.round(W / 300));
      paintRects(objMask, W, H, words.map((r) => padRect(r, pad, W, H)));
      schedule(); toast(t.obj.textMarked);
    } catch (err) { toast((err as { code?: string }).code === 'model_missing' ? t.edit.detMissing : t.obj.failed, 'error'); }
    finally { overlay.hidden = true; setOverlay(t.editor.working); }
  }

  // --- edit text inside the photo (new): detect lines, read one, erase it with the model, put back text in a matching font/colour/size
  const origField: HTMLTextAreaElement = h('textarea', { class: 'field', rows: 2, 'aria-label': t.edit.original, placeholder: t.edit.original });
  const newField: HTMLTextAreaElement = h('textarea', { class: 'field', rows: 2, 'aria-label': t.edit.newText, placeholder: t.edit.newText });
  const editPanel = h('section', { class: 'sheet', hidden: true },
    h('p', { class: 'muted' }, t.edit.hint),
    h('button', { class: 'btn secondary', onclick: () => detectLines() }, t.edit.detect),
    origField, newField,
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', onclick: () => replaceLine(false) }, t.edit.replace),
      h('button', { class: 'btn ghost', onclick: () => replaceLine(true) }, t.edit.removeOnly)));

  async function detectLines() {
    if (job) return;
    overlay.hidden = false; setOverlay(t.edit.detecting);
    try {
      detected = (await detectText(p!.rgba, W, H)).lines; pick = -1; schedule();
      if (!detected.length) toast(t.edit.none); else toast(t.edit.pick);
    } catch (err) { toast((err as { code?: string }).code === 'model_missing' ? t.edit.detMissing : t.obj.failed, 'error'); }
    finally { overlay.hidden = true; setOverlay(t.editor.working); }
  }

  async function pickLine(i: number) {
    pick = i; schedule();
    const r = detected[i];
    overlay.hidden = false; setOverlay(t.font.reading);
    try {
      const c = cropSel(p!.rgba, W, { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 });
      const text = (await readText(c.crop, c.w, c.h)).trim();
      origField.value = text; newField.value = text;
      if (!text) toast(t.font.ocrEmpty);
    } catch (err) { toast((err as { code?: string }).code === 'model_missing' ? t.font.ocrMissing : t.font.ocrEmpty, 'error'); }
    finally { overlay.hidden = true; setOverlay(t.editor.working); }
  }

  async function replaceLine(removeOnly: boolean) {
    if (job) return;
    if (pick < 0) { toast(t.edit.pick); return; }
    const r = detected[pick], orig = origField.value.trim(), next = newField.value.trim();
    if (!removeOnly && !next) { toast(t.edit.needText); return; }
    // 1) read the style from the untouched photo (before the old text is erased)
    const area: Sel = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1 };
    const crop0 = cropSel(p!.rgba, W, area);
    const color = inkColor(crop0.crop, inkMask(toGray(crop0.crop, crop0.w * crop0.h)));
    const sample = orig || next;
    let font = fontsFor(next || orig)[0], px = (r.y1 - r.y0) * 0.9;
    if (!removeOnly) {
      overlay.hidden = false; setOverlay(t.edit.working);
      const ranked = await findFonts(p!.rgba, W, area, sample).catch(() => []);
      if (ranked.length && scriptOf(next) === scriptOf(sample)) font = ranked[0].font;
      await loadFont(font);
      if (orig && scriptOf(next) === scriptOf(orig)) {
        const m = document.createElement('canvas').getContext('2d')!; m.font = fontCss(font, 100);
        const natural = m.measureText(orig).width;
        if (natural > 0) px = Math.max((r.y1 - r.y0) * 0.6, Math.min((r.y1 - r.y0) * 1.6, ((r.x1 - r.x0) / natural) * 100));
      }
    }
    // 2) erase the old line with the model
    const rr = padRect(r, Math.max(3, Math.round(0.12 * (r.y1 - r.y0))), W, H);
    const ok = await eraseRegion((fw, fh) => {
      const hole = new Uint8Array(fw * fh), kx = fw / W, ky = fh / H, x0 = Math.floor(rr.x0 * kx), x1 = Math.min(fw, Math.ceil(rr.x1 * kx));
      for (let y = Math.floor(rr.y0 * ky); y < Math.min(fh, Math.ceil(rr.y1 * ky)); y++) hole.fill(1, y * fw + x0, y * fw + x1);
      return hole;
    });
    if (!ok) return;
    // 3) put the new text in the same place
    if (removeOnly) { detected.splice(pick, 1); pick = -1; schedule(); toast(t.edit.done); return; }
    const layer = { id: crypto.randomUUID(), text: next, font, size: px / W, color, cx: (r.x0 + r.x1) / 2 / W, cy: (r.y0 + r.y1) / 2 / H };
    p!.texts.push(layer); selected = layer.id; detected = []; pick = -1;
    showTool('text'); toast(t.edit.done);
  }

  // --- crop (any shape) + resize
  const cropPanel = h('section', { class: 'sheet', hidden: true });
  const wIn: HTMLInputElement = h('input', { id: 'w-in', type: 'number', class: 'field', min: 1, inputmode: 'numeric', 'aria-label': t.crop.width, oninput: () => syncDim('w') });
  const hIn: HTMLInputElement = h('input', { id: 'h-in', type: 'number', class: 'field', min: 1, inputmode: 'numeric', 'aria-label': t.crop.height, oninput: () => syncDim('h') });
  const lockBox: HTMLInputElement = h('input', { type: 'checkbox', id: 'lock-ratio', checked: true });
  function syncDim(which: 'w' | 'h') {
    if (!lockBox.checked) return;
    const bw = p!.bitmap.width, bh = p!.bitmap.height;
    if (which === 'w') hIn.value = String(Math.max(1, Math.round((Number(wIn.value) * bh) / bw)));
    else wIn.value = String(Math.max(1, Math.round((Number(hIn.value) * bw) / bh)));
  }
  function setCropShape(sh: Shape) {
    cropShape = sh; freePts = [];
    if (sh === 'circle' || sh === 'heart' || sh === 'star' || sh === 'hexagon') setRatio(1, false);
    renderCrop(); schedule();
  }
  function setRatio(r: number | null, redraw = true) {
    cropAspect = r;
    if (r) crop = aspectBox(r, W, H);
    if (redraw) { renderCrop(); schedule(); }
  }
  function renderCrop() {
    const ratio = (label: string, r: number | null) => chip(label, cropAspect === r, () => setRatio(r));
    const shapeRow = h('div', { class: 'row fontrow' }, ...SHAPES.map((sh) => chip(t.crop.shapes[sh], cropShape === sh, () => setCropShape(sh))));
    wIn.value = String(p!.bitmap.width); hIn.value = String(p!.bitmap.height);
    setChildren(cropPanel,
      h('h2', {}, t.crop.cropTitle), shapeRow,
      cropShape === 'round' ? slider(t.crop.round, 0, 100, Math.round(cropRound * 100), (v) => { cropRound = v / 100; schedule(); }) : null,
      cropShape === 'free' ? h('p', { class: 'muted' }, t.crop.free)
        : h('div', { class: 'row' }, ratio(t.crop.ratios.free, null), ratio(t.crop.ratios.square, 1), ratio(t.crop.ratios.r43, 4 / 3), ratio(t.crop.ratios.r169, 16 / 9), ratio(t.crop.ratios.r916, 9 / 16)),
      h('button', { class: 'btn primary', onclick: () => applyCrop() }, t.crop.apply),
      h('h2', {}, t.crop.resizeTitle),
      h('p', { class: 'muted' }, `${t.crop.sizeNow}: ${p!.bitmap.width} × ${p!.bitmap.height} ${t.crop.px}`),
      h('div', { class: 'row' }, h('label', { for: 'w-in' }, t.crop.width), wIn),
      h('div', { class: 'row' }, h('label', { for: 'h-in' }, t.crop.height), hIn),
      h('div', { class: 'row' }, lockBox, h('label', { for: 'lock-ratio' }, t.crop.lock)),
      h('button', { class: 'btn secondary', onclick: () => applyResize() }, t.crop.applyResize),
      p!.prev ? h('button', { class: 'btn ghost', onclick: () => { if (undoGeometry(p!)) { projects.touch(p!); reload(); } } }, t.crop.undo) : null);
  }
  async function geometry(work: () => Promise<void>, done: string) {
    if (job) return;
    overlay.hidden = false; setOverlay(t.editor.working);
    try { await work(); projects.touch(p!); reload(); toast(done); }
    catch { toast(t.crop.failed, 'error'); overlay.hidden = true; }
  }
  async function applyCrop() {
    if (cropShape === 'free' && !polyBBox(freePts)) { toast(t.crop.needShape); return; }
    await geometry(() => cropProject(p!, crop, cropShape, cropRound, freePts), t.crop.done);
  }
  async function applyResize() {
    const nw = Math.round(Number(wIn.value)), nh = Math.round(Number(hIn.value));
    if (!(nw > 0 && nh > 0)) { toast(t.crop.failed, 'error'); return; }
    const s = Math.min(1, 4096 / Math.max(nw, nh));
    await geometry(() => resizeProject(p!, Math.max(1, Math.round(nw * s)), Math.max(1, Math.round(nh * s))), t.crop.resized);
  }
  function cropDown(pt: { x: number; y: number; k: number }, e: PointerEvent) {
    canvas.setPointerCapture(e.pointerId);
    if (cropShape === 'free') { freePts = [{ x: pt.x, y: pt.y }]; cropDrag = { kind: 'free', sx: pt.x, sy: pt.y, start: crop }; schedule(); return; }
    const corner = nearestCorner(crop, pt.x, pt.y, Math.max(32 * pt.k, W / 14));
    if (corner) cropDrag = { kind: 'corner', corner, sx: pt.x, sy: pt.y, start: crop };
    else if (pt.x >= crop.x0 && pt.x <= crop.x1 && pt.y >= crop.y0 && pt.y <= crop.y1) cropDrag = { kind: 'move', sx: pt.x, sy: pt.y, start: crop };
  }
  function cropMove(pt: { x: number; y: number; k: number }) {
    const d = cropDrag!;
    if (d.kind === 'free') { const l = freePts[freePts.length - 1]; if (Math.hypot(pt.x - l.x, pt.y - l.y) > 4 * pt.k) freePts.push({ x: pt.x, y: pt.y }); }
    else if (d.kind === 'corner') crop = dragCorner(d.start, d.corner!, pt.x, pt.y, cropAspect, W, H);
    else crop = moveRect(d.start, pt.x - d.sx, pt.y - d.sy, W, H);
    schedule();
  }
  function cropUp() {
    if (!cropDrag) return;
    if (cropDrag.kind === 'free') { const bb = polyBBox(freePts); if (bb) crop = clampRect(bb, W, H); else freePts = []; }
    cropDrag = null; schedule();
  }

  // --- font finder (S19): select the text area, type what it says, compare with the bundled fonts
  const fontText: HTMLTextAreaElement = h('textarea', { class: 'field', rows: 2, 'aria-label': t.font.input, placeholder: t.font.input });
  const fontResults = h('div', { class: 'results' });
  const fontPanel = h('section', { class: 'sheet', hidden: true },
    h('p', { class: 'muted' }, t.font.hint),
    h('button', { class: 'btn secondary', onclick: () => autoRead() }, t.font.read), fontText,
    h('button', { class: 'btn primary', onclick: () => searchFont() }, t.font.search), fontResults);
  async function autoRead() {
    if (!sel || Math.abs(sel.x1 - sel.x0) < 8 || Math.abs(sel.y1 - sel.y0) < 8) { toast(t.font.none); return; }
    overlay.hidden = false; (overlay.firstChild as HTMLElement).textContent = t.font.reading;
    try {
      const c = cropSel(p!.rgba, W, sel);
      const text = (await readText(c.crop, c.w, c.h)).trim();
      if (!text) { toast(t.font.ocrEmpty); return; }
      fontText.value = text; await searchFont();
    } catch (err) {
      toast((err as { code?: string }).code === 'model_missing' ? t.font.ocrMissing : t.font.ocrEmpty, 'error');
    } finally { overlay.hidden = true; (overlay.firstChild as HTMLElement).textContent = t.editor.working; }
  }
  async function searchFont() {
    const text = fontText.value.trim();
    if (!sel || Math.abs(sel.x1 - sel.x0) < 8 || Math.abs(sel.y1 - sel.y0) < 8) { toast(t.font.none); return; }
    if (!text) { toast(t.font.needText); return; }
    const ranked = await findFonts(p!.rgba, W, sel, text).catch(() => []);
    if (!ranked.length) { toast(t.font.fail, 'error'); return; }
    fontResults.replaceChildren(h('h2', {}, t.font.results), ...ranked.slice(0, 10).map((r) => {
      const b = h('button', { class: 'btn secondary result font-result', 'aria-label': t.font.apply + ' ' + r.font, onclick: () => useFont(r.font, text) },
        h('span', { class: 'font-result-name' }, r.font),
        h('span', { class: 'font-result-preview', dir: /[\\u0600-\\u06FF]/.test(text) ? 'rtl' : 'ltr' }, text),
        h('span', { class: 'font-result-score' }, Math.round(r.score * 100) + '% تشابه'));
      b.style.fontFamily = '"' + r.font + '", sans-serif'; return b;
    }), h('p', { class: 'muted' }, 'النتيجة تقيس تشابه شكل الحروف وليست نسبة تأكد قطعية. ' + t.font.note));
  }
  function useFont(font: string, text: string) {
    const l = { id: crypto.randomUUID(), text, font, size: 0.09, color: '#ffffff', cx: 0.5, cy: 0.5 };
    captureHistory(); p!.texts.push(l); selected = l.id; showTool('text');
  }

  // --- remove background (worker)
  const overlay = h('div', { class: 'overlay', hidden: true, role: 'status' }, h('p', {}, t.editor.working),
    h('button', { class: 'btn secondary', onclick: () => job?.cancel() }, t.editor.cancel));
  const runBtn = h('button', { class: 'btn primary', onclick: () => runRemoveBg() }, t.editor.runRemoveBg);
  async function runRemoveBg() {
    if (job) return;
    overlay.hidden = false; runBtn.disabled = true;
    const j = segment(p!.rgba, W, H, () => {}); job = j;
    try {
      const nextMask = await j.promise; captureHistory(); p!.mask = nextMask;
      runBtn.textContent = t.editor.removeBg; projects.touch(p!); showTool('cut'); toast(t.editor.cutoutDone);
    } catch (err) {
      const code = err instanceof SegmentError ? err.code : 'failed';
      if (code === 'model_missing') toast(t.editor.modelMissing, 'error'); else if (code !== 'cancelled') toast(t.editor.failed, 'error');
    } finally { job = null; overlay.hidden = true; runBtn.disabled = false; }
  }

  // --- export (S16)
  let format: Format = formatOfMime(p.mime), quality = 0.92, lastBlob: Blob | null = null, lastName = '';
  const exportSheet = h('section', { class: 'sheet export', hidden: true });
  function openExport() { exportSheet.hidden = false; renderExportSheet(); }
  function renderExportSheet(state: 'idle' | 'busy' = 'idle', saved?: string, canShare = false) {
    setChildren(exportSheet, h('h2', {}, t.export.title),
      h('div', { class: 'row' }, chip(t.export.png, format === 'png', () => { format = 'png'; renderExportSheet(); }), chip(t.export.jpg, format === 'jpg', () => { format = 'jpg'; renderExportSheet(); }), chip(t.export.webp, format === 'webp', () => { format = 'webp'; renderExportSheet(); })),
      h('p', { class: 'muted' }, `${format === 'png' ? t.export.pngNote : format === 'jpg' ? t.export.jpgNote : t.export.webpNote} ${format === formatOfMime(p!.mime) ? t.export.sameAsOriginal : ''}`),
      format !== 'png' ? slider(t.export.quality, 50, 100, Math.round(quality * 100), (v) => { quality = v / 100; }) : null,
      state === 'busy' ? h('p', { 'aria-live': 'polite' }, t.export.rendering) : null,
      saved ? h('p', { class: 'ok', role: 'status' }, saved) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: state === 'busy', onclick: doSave }, t.export.save),
        canShare ? h('button', { class: 'btn secondary', onclick: () => shareBlob(lastBlob!, lastName).catch(() => toast(t.export.saveFailed, 'error')) }, t.export.share) : null,
        h('button', { class: 'btn ghost', onclick: () => { exportSheet.hidden = true; } }, t.editor.cancel)));
  }
  const savedMessage = (s: Saved, name: string) =>
    s.where === 'gallery' ? t.export.savedGallery : s.where === 'documents' ? `${t.export.savedDocuments}Documents/PhotoEditor/${name}` : s.where === 'cache' ? t.export.savedCache : t.export.savedWeb;
  async function doSave() {
    renderExportSheet('busy');
    try {
      const blob = await renderExport(p!, format, quality);
      const name = `${p!.title}-${Date.now()}.${format}`;
      const saved = await saveFile(blob, name);
      lastBlob = blob; lastName = name;
      renderExportSheet('idle', savedMessage(saved, name), saved.where !== 'download');
    } catch { renderExportSheet(); toast(t.export.saveFailed, 'error'); }
  }

  // --- tools
  function showTool(next: Tool) {
    if (next === 'bg' && !p!.mask) { toast(t.editor.needCutout); return; }
    tool = next; exportSheet.hidden = true;
    cutPanel.hidden = !(next === 'cut' && p!.mask);
    bgPanel.hidden = next !== 'bg'; textPanel.hidden = next !== 'text'; objPanel.hidden = next !== 'obj'; fontPanel.hidden = next !== 'font';
    editPanel.hidden = next !== 'edit'; cropPanel.hidden = next !== 'crop'; clonePanel.hidden = next !== 'clone'; enhancePanel.hidden = next !== 'enhance'; if (next === 'enhance') renderEnhance(); if (next !== 'clone') { cloneCursorPos = null; canvas.classList.remove('clone-pick-source'); } else if (choosingCloneSource) canvas.classList.add('clone-pick-source'); if (next !== 'edit') { pick = -1; }
    if (next === 'bg') renderBg(); if (next === 'text') renderText(); if (next === 'crop') renderCrop();
    strip.forEach(([b, k]) => b.setAttribute('aria-pressed', String(k === next))); schedule();
  }
  const mk = (label: string, k: Tool | null): [HTMLButtonElement, Tool | null] =>
    [h('button', { class: 'tool', 'aria-pressed': String(k === 'cut'), onclick: () => (k ? showTool(k) : toast(t.editor.soon)) }, label), k];
  const strip = [mk(t.tools.removeBg, 'cut'), mk(t.tools.background, 'bg'), mk(t.tools.text, 'text'), mk(t.tools.editText, 'edit'), mk(t.tools.removeObject, 'obj'), mk(t.tools.fonts, 'font'), mk(t.tools.crop, 'crop'), mk('استنساخ', 'clone'), mk('تحسين', 'enhance')];

  const el = h('main', { class: 'editor' },
    h('header', { class: 'topbar' },
      h('button', { class: 'icon-btn', 'aria-label': t.editor.back, onclick: () => go('/') }, '→'),
      h('div', { class: 'spacer' }), undoBtn, redoBtn, h('button', { class: 'btn primary small', onclick: openExport }, t.editor.export)),
    h('div', { class: 'stage checker' }, canvas, viewControls, overlay),
    h('div', { class: 'actions' }, runBtn),
    cutPanel, bgPanel, textPanel, editPanel, objPanel, fontPanel, cropPanel, clonePanel, enhancePanel, exportSheet,
    h('nav', { class: 'toolstrip', 'aria-label': 'tools' }, ...strip.map(([b]) => b)));

  applyView();
  draw();
  return { el, dispose: () => { job?.cancel(); if (raf) cancelAnimationFrame(raf); } };
}

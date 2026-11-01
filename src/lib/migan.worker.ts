import * as ort from 'onnxruntime-web/wasm';

ort.env.wasm.wasmPaths = '/ort/';
ort.env.wasm.numThreads = 1; // multi-thread needs cross-origin isolation, not available in the WebView

const CACHE = 'photo-editor-models-v1';
const MIN_BYTES = 5_000_000; // anything smaller is an error page, not the model
const post = (msg: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer);
let session: ort.InferenceSession | null = null;

/** Model bytes: browser cache first, then a file bundled in public/models, then download (and cache) from the mirrors. */
async function modelBytes(id: number, urls: string[], localUrl: string): Promise<ArrayBuffer> {
  const cache = await caches.open(CACHE).catch(() => null);
  const key = urls[0];
  const hit = await cache?.match(key).catch(() => undefined);
  if (hit) { const b = await hit.arrayBuffer(); if (b.byteLength >= MIN_BYTES) return b; }
  try {
    const r = await fetch(localUrl);
    if (r.ok) { const b = await r.arrayBuffer(); if (b.byteLength >= MIN_BYTES) return b; }
  } catch { /* not bundled: download instead */ }
  let last: unknown = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok || !res.body) throw new Error('HTTP ' + res.status);
      const total = Number(res.headers.get('content-length')) || 0;
      const reader = res.body.getReader(), chunks: Uint8Array[] = [];
      let loaded = 0, lastPost = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value); loaded += value.byteLength;
        const now = Date.now();
        if (now - lastPost > 250) { lastPost = now; post({ id, progress: 'download', loaded, total }); }
      }
      if (loaded < MIN_BYTES) throw new Error('file too small');
      const bytes = new Uint8Array(loaded);
      let o = 0; for (const c of chunks) { bytes.set(c, o); o += c.byteLength; }
      await cache?.put(key, new Response(bytes.slice().buffer)).catch(() => {});
      return bytes.buffer;
    } catch (err) { last = err; }
  }
  throw Object.assign(new Error('download failed: ' + String(last)), { code: 'download_failed' });
}

async function load(id: number, urls: string[], localUrl: string): Promise<ort.InferenceSession> {
  if (session) return session;
  const buf = await modelBytes(id, urls, localUrl);
  post({ id, progress: 'init' });
  session = await ort.InferenceSession.create(new Uint8Array(buf), { executionProviders: ['wasm'] });
  return session;
}

self.onmessage = async (e: MessageEvent) => {
  const d = e.data as { id: number; cmd: 'prepare' | 'run'; urls: string[]; localUrl: string; rgb?: Uint8Array; mask?: Uint8Array; w?: number; h?: number };
  try {
    const s = await load(d.id, d.urls, d.localUrl);
    if (d.cmd === 'prepare') { post({ id: d.id, ready: true }); return; }
    post({ id: d.id, progress: 'run' });
    const names = s.inputNames;
    const imgName = names.find((n) => /image|img/i.test(n)) ?? names[0];
    const maskName = names.find((n) => /mask/i.test(n)) ?? names[1];
    const w = d.w!, h = d.h!;
    const out = await s.run({
      [imgName]: new ort.Tensor('uint8', d.rgb!, [1, 3, h, w]),
      [maskName]: new ort.Tensor('uint8', d.mask!, [1, 1, h, w]),
    });
    const raw = out[s.outputNames[0]].data as ArrayLike<number>;
    const px = raw instanceof Uint8Array ? raw.slice() : Uint8Array.from(raw, (v) => Math.max(0, Math.min(255, Math.round(v))));
    post({ id: d.id, out: px }, [px.buffer]);
  } catch (err) {
    post({ id: d.id, error: String(err), code: (err as { code?: string }).code ?? 'failed' });
  }
};

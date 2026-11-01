// Crop shapes (outline paths) and the alpha mask they produce. Uses Path2D, so DOM only.
export type Shape = 'rect' | 'round' | 'circle' | 'heart' | 'star' | 'hexagon' | 'triangle' | 'free';
export const SHAPES: Shape[] = ['rect', 'round', 'circle', 'heart', 'star', 'hexagon', 'triangle', 'free'];
export interface Pt { x: number; y: number }

function poly(points: Pt[]): Path2D {
  const p = new Path2D();
  points.forEach((q, i) => (i ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)));
  p.closePath();
  return p;
}

/** Outline of `shape` inside the box (x, y, w, h). `round` 0..1 is the corner roundness of the "round" shape. `free` uses `pts` (absolute coordinates). */
export function shapePath(shape: Shape, x: number, y: number, w: number, h: number, round = 0.25, pts: Pt[] = []): Path2D {
  const X = (u: number) => x + u * w, Y = (v: number) => y + v * h, cx = x + w / 2, cy = y + h / 2;
  switch (shape) {
    case 'free': return pts.length > 2 ? poly(pts) : new Path2D();
    case 'circle': { const p = new Path2D(); p.ellipse(cx, cy, w / 2, h / 2, 0, 0, Math.PI * 2); return p; }
    case 'round': {
      const r = Math.max(0, Math.min(1, round)) * Math.min(w, h) / 2, p = new Path2D();
      p.moveTo(x + r, y); p.arcTo(x + w, y, x + w, y + h, r); p.arcTo(x + w, y + h, x, y + h, r);
      p.arcTo(x, y + h, x, y, r); p.arcTo(x, y, x + w, y, r); p.closePath(); return p;
    }
    case 'heart': {
      const p = new Path2D();
      p.moveTo(X(.5), Y(.98));
      p.bezierCurveTo(X(.1), Y(.72), X(0), Y(.45), X(0), Y(.3));
      p.bezierCurveTo(X(0), Y(.1), X(.18), Y(0), X(.32), Y(0));
      p.bezierCurveTo(X(.42), Y(0), X(.5), Y(.08), X(.5), Y(.22));
      p.bezierCurveTo(X(.5), Y(.08), X(.58), Y(0), X(.68), Y(0));
      p.bezierCurveTo(X(.82), Y(0), X(1), Y(.1), X(1), Y(.3));
      p.bezierCurveTo(X(1), Y(.45), X(.9), Y(.72), X(.5), Y(.98));
      p.closePath(); return p;
    }
    case 'star':
      return poly(Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.2 : 0.5;
        return { x: cx + Math.cos(a) * r * w, y: cy + Math.sin(a) * r * h };
      }));
    case 'hexagon': return poly([0, 1, 2, 3, 4, 5].map((i) => ({ x: cx + Math.cos((i * Math.PI) / 3) * (w / 2), y: cy + Math.sin((i * Math.PI) / 3) * (h / 2) })));
    case 'triangle': return poly([{ x: X(.5), y: Y(0) }, { x: X(1), y: Y(1) }, { x: X(0), y: Y(1) }]);
    default: { const p = new Path2D(); p.rect(x, y, w, h); return p; }
  }
}

/** 0..255 coverage of the shape over a w x h canvas that exactly holds its box. */
export function shapeAlpha(shape: Shape, w: number, h: number, round: number, pts: Pt[] = []): Uint8Array {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000'; ctx.fill(shapePath(shape, 0, 0, w, h, round, pts));
  const d = ctx.getImageData(0, 0, w, h).data, out = new Uint8Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4 + 3];
  return out;
}

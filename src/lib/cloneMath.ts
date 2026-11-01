export interface ClonePoint { x: number; y: number }

/** Return evenly spaced points along a pointer segment, including its endpoint. */
export function interpolateCloneStroke(from: ClonePoint, to: ClonePoint, spacing: number): ClonePoint[] {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(0.5, Number.isFinite(spacing) ? spacing : 1);
  if (distance === 0) return [{ x: to.x, y: to.y }];
  const points: ClonePoint[] = [];
  for (let d = step; d < distance; d += step) {
    const t = d / distance;
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  points.push({ x: to.x, y: to.y });
  return points;
}

/** Map a destination point to the corresponding source point in image coordinates. */
export function cloneSourcePoint(destination: ClonePoint, offset: ClonePoint, scaleX: number, scaleY: number): ClonePoint {
  return { x: destination.x + offset.x / scaleX, y: destination.y + offset.y / scaleY };
}

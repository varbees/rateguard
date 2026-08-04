export const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

// Smooth 0→1→0 bump across [start, end], peaking mid-window. No linear
// corners, no bounce — just enough shape to read as a discrete event.
export function bump(p: number, start: number, end: number) {
  const t = (p - start) / (end - start);
  return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI);
}

export function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

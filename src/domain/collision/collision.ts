import type { Polygon } from '../geometry/polygon';
import { type Vec2, cross, dot, length, sub, vec } from '../geometry/vec';

const EPS = 1e-9;

function axes(poly: Polygon): Vec2[] {
  return poly.map((p, i) => {
    const e = sub(poly[(i + 1) % poly.length]!, p);
    const n = vec(-e.y, e.x);
    const l = length(n) || 1;
    return vec(n.x / l, n.y / l);
  });
}

function project(poly: Polygon, axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const d = dot(p, axis);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/**
 * Intersección de dos polígonos CONVEXOS mediante SAT (Separating Axis Theorem).
 * Polígonos que solo se tocan en el borde NO se consideran colisión.
 */
export function polygonsIntersect(a: Polygon, b: Polygon): boolean {
  for (const axis of [...axes(a), ...axes(b)]) {
    const [aMin, aMax] = project(a, axis);
    const [bMin, bMax] = project(b, axis);
    if (aMax <= bMin + EPS || bMax <= aMin + EPS) return false;
  }
  return true;
}

/** Distancia de un punto a un segmento. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return vec(a.x + ab.x * t, a.y + ab.y * t);
}

/** Distancia de un punto a un segmento. */
export function pointSegmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  return length(sub(p, closestPointOnSegment(p, a, b)));
}

function segmentsCross(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/**
 * Distancia mínima entre los bordes de dos polígonos (convexos). 0 si se solapan o tocan.
 */
export function polygonDistance(a: Polygon, b: Polygon): number {
  if (polygonsIntersect(a, b)) return 0;
  let best = Infinity;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const b1 = b[j]!;
      const b2 = b[(j + 1) % b.length]!;
      if (segmentsCross(a1, a2, b1, b2)) return 0;
      best = Math.min(
        best,
        pointSegmentDistance(a1, b1, b2),
        pointSegmentDistance(a2, b1, b2),
        pointSegmentDistance(b1, a1, a2),
        pointSegmentDistance(b2, a1, a2),
      );
    }
  }
  return best;
}

/** Puntos más próximos de dos polígonos convexos no solapados; null si se intersectan. */
export function closestPointsBetweenPolygons(a: Polygon, b: Polygon): { a: Vec2; b: Vec2 } | null {
  if (polygonsIntersect(a, b)) return null;
  let best = Infinity;
  let nearest: { a: Vec2; b: Vec2 } | null = null;
  const consider = (from: Vec2, to: Vec2) => {
    const distance = length(sub(from, to));
    if (distance < best) {
      best = distance;
      nearest = { a: from, b: to };
    }
  };
  for (const point of a) {
    for (let i = 0; i < b.length; i++) {
      consider(point, closestPointOnSegment(point, b[i]!, b[(i + 1) % b.length]!));
    }
  }
  for (const point of b) {
    for (let i = 0; i < a.length; i++) {
      consider(closestPointOnSegment(point, a[i]!, a[(i + 1) % a.length]!), point);
    }
  }
  return nearest;
}

/** `true` si todos los vértices de `inner` están dentro (o en el borde) del polígono convexo `outer` (orden CW o CCW). */
export function polygonContains(outer: Polygon, inner: Polygon): boolean {
  let sign = 0;
  for (let i = 0; i < outer.length; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % outer.length]!;
    for (const p of inner) {
      const c = cross(sub(b, a), sub(p, a));
      if (Math.abs(c) < 1e-7) continue;
      const s = Math.sign(c);
      if (sign === 0) sign = s;
      else if (s !== sign) return false;
    }
  }
  return true;
}

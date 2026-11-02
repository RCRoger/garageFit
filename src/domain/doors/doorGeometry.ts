import { type Polygon } from '../geometry/polygon';
import { add, rotate, vec, type Vec2 } from '../geometry/vec';
import type { Door, Placement, VehicleDimensions } from '@/types/domain';

function convexHull(points: readonly Vec2[]): Polygon {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 1) return sorted;
  const cross = (o: Vec2, a: Vec2, b: Vec2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Vec2[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function transformLocalPoint(point: Vec2, placement: Placement): Vec2 {
  return add(rotate(point, placement.angle), vec(placement.x, placement.y));
}

/** Polygon de la hoja de puerta en una apertura concreta. Bisagra en el extremo delantero del panel. */
export function doorPolygonAt(
  door: Door,
  vehicle: VehicleDimensions,
  placement: Placement,
  angleDeg: number,
): Polygon {
  const hingeX = (door.side === 'right' ? 1 : -1) * vehicle.bodyWidth / 2;
  const hinge = vec(hingeX, door.hingeOffset);
  const sideSign = door.side === 'right' ? 1 : -1;
  const localPanel: Polygon = [
    hinge,
    vec(hinge.x, hinge.y + door.length),
    vec(hinge.x + sideSign * door.thickness, hinge.y + door.length),
    vec(hinge.x + sideSign * door.thickness, hinge.y),
  ];
  const swing = (door.side === 'right' ? -1 : 1) * angleDeg;
  return localPanel.map((point) => transformLocalPoint(rotate(point, swing, hinge), placement));
}

/**
 * Conservador: convex hull de la hoja muestreada a intervalos máximos de 3°.
 * La hull puede advertir una colisión aunque el arco real no toque el obstáculo,
 * pero no subestima el espacio barrido entre muestras.
 */
export function doorSweptArea(door: Door, vehicle: VehicleDimensions, placement: Placement): Polygon {
  const steps = Math.max(1, Math.ceil(door.angleDeg / 3));
  const samples: Vec2[] = [];
  for (let i = 0; i <= steps; i++) {
    samples.push(...doorPolygonAt(door, vehicle, placement, (door.angleDeg * i) / steps));
  }
  return convexHull(samples);
}

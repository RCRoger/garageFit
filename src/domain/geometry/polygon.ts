import { type Vec2, add, rotate, vec } from './vec';

/** Polígono como lista de vértices en orden (sin repetir el primero). */
export type Polygon = readonly Vec2[];

/** Rectángulo orientado (OBB) centrado en `center`, de `width` (X local) × `length` (Y local), rotado `angleDeg`. */
export function orientedRect(center: Vec2, width: number, length: number, angleDeg = 0): Polygon {
  const hw = width / 2;
  const hl = length / 2;
  const corners = [vec(-hw, -hl), vec(hw, -hl), vec(hw, hl), vec(-hw, hl)];
  return corners.map((c) => add(center, rotate(c, angleDeg)));
}

/** Rectángulo alineado a ejes definido por su esquina superior izquierda. */
export function axisRect(x: number, y: number, width: number, height: number): Polygon {
  return [vec(x, y), vec(x + width, y), vec(x + width, y + height), vec(x, y + height)];
}

/** Aproximación poligonal de un círculo (la precisión de distancia es r·(1−cos(π/n))). */
export function circlePolygon(center: Vec2, radius: number, segments = 64): Polygon {
  return Array.from({ length: segments }, (_, i) => {
    const a = (2 * Math.PI * i) / segments;
    return vec(center.x + radius * Math.cos(a), center.y + radius * Math.sin(a));
  });
}

export function transformPolygon(poly: Polygon, deg: number, origin: Vec2, translation: Vec2 = vec(0, 0)): Polygon {
  return poly.map((p) => add(rotate(p, deg, origin), translation));
}

/** Área con signo (shoelace). */
export function polygonArea(poly: Polygon): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

export function boundingBox(poly: Polygon): { minX: number; minY: number; maxX: number; maxY: number } {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/** Geometría vectorial 2D. Unidades: centímetros. Eje X → derecha, eje Y → abajo (convención de pantalla). */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => vec(a.x + b.x, a.y + b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => vec(a.x - b.x, a.y - b.y);
export const scale = (a: Vec2, k: number): Vec2 => vec(a.x * k, a.y * k);
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const length = (a: Vec2): number => Math.hypot(a.x, a.y);

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

/** Rota `p` alrededor de `origin` un ángulo en grados (sentido horario en pantalla, al ser Y hacia abajo). */
export function rotate(p: Vec2, deg: number, origin: Vec2 = vec(0, 0)): Vec2 {
  const r = degToRad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  const d = sub(p, origin);
  return vec(origin.x + d.x * c - d.y * s, origin.y + d.x * s + d.y * c);
}

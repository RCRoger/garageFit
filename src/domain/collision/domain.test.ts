import { describe, expect, it } from 'vitest';
import { closestPointsBetweenPolygons, polygonContains, polygonDistance, polygonsIntersect, pointSegmentDistance } from './collision';
import { analyzeFit, computeMargins } from './analysis';
import { axisRect, circlePolygon, orientedRect, polygonArea } from '../geometry/polygon';
import { doorPolygonAt } from '../doors/doorGeometry';
import { rotate, vec } from '../geometry/vec';
import { VehicleDimensionsSchema, type ParkingSpot, type VehicleDimensions } from '@/types/domain';

const near = (a: number, b: number, d = 1e-6) => expect(Math.abs(a - b)).toBeLessThan(d);

describe('rotación', () => {
  it('90° horario en pantalla: (1,0) → (0,1)', () => {
    const p = rotate(vec(1, 0), 90);
    near(p.x, 0);
    near(p.y, 1);
  });
  it('conserva el área del OBB', () => {
    near(polygonArea(orientedRect(vec(100, 100), 180, 450, 37)), 180 * 450, 1e-6);
  });
});

describe('colisión de rectángulos', () => {
  it('solapados', () => expect(polygonsIntersect(axisRect(0, 0, 10, 10), axisRect(5, 5, 10, 10))).toBe(true));
  it('separados', () => expect(polygonsIntersect(axisRect(0, 0, 10, 10), axisRect(11, 0, 10, 10))).toBe(false));
  it('contacto por el borde no es colisión', () =>
    expect(polygonsIntersect(axisRect(0, 0, 10, 10), axisRect(10, 0, 10, 10))).toBe(false));
  it('uno contenido en otro', () =>
    expect(polygonsIntersect(axisRect(0, 0, 100, 100), axisRect(40, 40, 5, 5))).toBe(true));
});

describe('colisión de polígonos rotados', () => {
  it('rotado 45° esquiva una esquina que un AABB sí tocaría', () => {
    const diamond = orientedRect(vec(0, 0), 100, 100, 45);
    const corner = axisRect(45, 45, 20, 20); // x+y=90 < 100√2/... punto más cercano del rombo: (70.7,0)/(0,70.7)
    expect(polygonsIntersect(diamond, corner)).toBe(false);
    near(polygonDistance(diamond, corner), (45 + 45 - 70.7107) / Math.SQRT2, 1e-3);
  });
  it('rotado 45° colisiona al acercarse', () => {
    const diamond = orientedRect(vec(0, 0), 100, 100, 45);
    expect(polygonsIntersect(diamond, axisRect(40, 0, 20, 20))).toBe(true);
  });
  it('rotación 90° intercambia anchura y longitud', () => {
    const car = orientedRect(vec(0, 0), 100, 400, 90);
    near(car[0]!.x, 200);
    expect(polygonsIntersect(car, axisRect(190, -10, 20, 20))).toBe(true);
  });
});

describe('distancia mínima', () => {
  it('lado a lado', () => near(polygonDistance(axisRect(0, 0, 10, 10), axisRect(25, 0, 10, 10)), 15));
  it('diagonal (esquina a esquina)', () =>
    near(polygonDistance(axisRect(0, 0, 10, 10), axisRect(13, 14, 10, 10)), 5));
  it('devuelve los puntos de la separación mínima', () => {
    const points = closestPointsBetweenPolygons(axisRect(0, 0, 10, 10), axisRect(25, 0, 10, 10));
    expect(points).not.toBeNull();
    near(points!.a.x, 10);
    near(points!.b.x, 25);
    near(points!.a.y, points!.b.y);
  });
  it('0 si se solapan', () => expect(polygonDistance(axisRect(0, 0, 10, 10), axisRect(5, 5, 10, 10))).toBe(0));
  it('círculo poligonal', () => {
    const d = polygonDistance(axisRect(0, 0, 10, 10), circlePolygon(vec(40, 5), 10, 128));
    near(d, 20, 0.05);
  });
  it('punto-segmento fuera del extremo', () => near(pointSegmentDistance(vec(-3, 4), vec(0, 0), vec(10, 0)), 5));
});

describe('contención', () => {
  it('dentro', () => expect(polygonContains(axisRect(0, 0, 100, 100), axisRect(10, 10, 20, 20))).toBe(true));
  it('sobresale', () => expect(polygonContains(axisRect(0, 0, 100, 100), axisRect(90, 10, 20, 20))).toBe(false));
  it('pegado al borde cuenta como dentro', () =>
    expect(polygonContains(axisRect(0, 0, 100, 100), axisRect(0, 0, 100, 100))).toBe(true));
});

const car: VehicleDimensions = {
  length: 450,
  bodyWidth: 180,
  widthMirrorsFolded: 190,
  widthMirrorsExtended: 205,
  height: 150,
  wheelbase: 270,
  turningDiameter: null,
  doors: [],
};
const spot: ParkingSpot = { width: 250, length: 500, kind: 'individual', entrance: 'bottom' };

describe('márgenes y análisis', () => {
  it('coche centrado: márgenes simétricos', () => {
    const r = analyzeFit(spot, car, { x: 125, y: 250, angle: 0 }, []);
    near(r.margins.left, 30);
    near(r.margins.right, 30);
    near(r.margins.top, 25);
    near(r.margins.bottom, 25);
    expect(r.status).toBe('limited'); // 25 cm < 30 cm de comodidad
  });
  it('plaza holgada → ok', () => {
    const r = analyzeFit({ ...spot, width: 300, length: 600 }, car, { x: 150, y: 300, angle: 0 }, []);
    expect(r.status).toBe('ok');
  });
  it('rotado 10° ocupa más ancho: márgenes laterales menores', () => {
    const a = computeMargins(spot, analyzeFit(spot, car, { x: 125, y: 250, angle: 0 }, []).footprint);
    const b = computeMargins(spot, analyzeFit(spot, car, { x: 125, y: 250, angle: 10 }, []).footprint);
    expect(b.left).toBeLessThan(a.left);
  });
  it('sobresale de la plaza → colisión y margen negativo', () => {
    const r = analyzeFit(spot, car, { x: 125, y: 250, angle: 90 }, []);
    expect(r.insideSpot).toBe(false);
    expect(r.margins.left).toBeLessThan(0);
    expect(r.status).toBe('collision');
  });
  it('columna que invade el coche → colisión con su id', () => {
    const r = analyzeFit(spot, car, { x: 125, y: 250, angle: 0 }, [
      { id: 'c1', kind: 'column', shape: 'rect', x: 0, y: 200, width: 40, height: 40 },
    ]);
    expect(r.collidingObstacleIds).toEqual(['c1']);
    expect(r.status).toBe('collision');
  });
  it('distancia mínima a columna circular', () => {
    const r = analyzeFit(spot, car, { x: 125, y: 250, angle: 0 }, [
      { id: 'c2', kind: 'column', shape: 'circle', x: 10, y: 250, radius: 10 },
    ]);
    near(r.minObstacleDistance!, 10, 0.1);
    expect(r.nearestObstacle?.id).toBe('c2');
  });
  it('puertas y maniobra figuran como no verificadas', () => {
    const r = analyzeFit(spot, car, { x: 125, y: 250, angle: 0 }, []);
    expect(r.doorStatus).toBe('not-configured');
    expect(r.maneuver).toBe('not-verified');
  });
});

describe('validación de dimensiones', () => {
  it('acepta datos coherentes', () => expect(VehicleDimensionsSchema.safeParse(car).success).toBe(true));
  it('rechaza espejos plegados < carrocería', () =>
    expect(VehicleDimensionsSchema.safeParse({ ...car, widthMirrorsFolded: 170 }).success).toBe(false));
  it('rechaza desplegados < plegados', () =>
    expect(VehicleDimensionsSchema.safeParse({ ...car, widthMirrorsExtended: 185 }).success).toBe(false));
  it('rechaza batalla ≥ longitud', () =>
    expect(VehicleDimensionsSchema.safeParse({ ...car, wheelbase: 450 }).success).toBe(false));
  it('rechaza NaN e Infinity', () => {
    expect(VehicleDimensionsSchema.safeParse({ ...car, length: NaN }).success).toBe(false);
    expect(VehicleDimensionsSchema.safeParse({ ...car, height: Infinity }).success).toBe(false);
  });
});

describe('puertas articuladas', () => {
  const door = {
    id: 'driver',
    label: 'Conductor',
    side: 'left' as const,
    hingeOffset: -100,
    length: 90,
    thickness: 5,
    angleDeg: 60,
    enabled: true,
    estimated: true,
  };
  const largeSpot: ParkingSpot = { width: 500, length: 600, kind: 'private-garage', entrance: 'bottom' };
  const parked = { x: 250, y: 300, angle: 0 };

  it('cero grados deja la hoja cerrada y el barrido es finito', () => {
    const closed = { ...door, angleDeg: 0 };
    const r = analyzeFit(largeSpot, { ...car, doors: [closed] }, parked, []);
    expect(r.doorStatus).toBe('clear');
    expect(r.doorResults[0]!.sweptArea.length).toBeGreaterThanOrEqual(4);
    expect(r.doorResults[0]!.estimated).toBe(true);
  });
  it('hoja izquierda se articula hacia el exterior', () => {
    const closed = doorPolygonAt(door, car, parked, 0);
    const open = doorPolygonAt(door, car, parked, 60);
    expect(Math.min(...open.map((p) => p.x))).toBeLessThan(Math.min(...closed.map((p) => p.x)));
  });
  it('apertura libre en una plaza holgada', () => {
    const r = analyzeFit(largeSpot, { ...car, doors: [door] }, parked, []);
    expect(r.doorStatus).toBe('clear');
    expect(r.doorResults[0]!.blockedByObstacleIds).toEqual([]);
    expect(r.doorResults[0]!.blockedBySpotBoundary).toBe(false);
  });
  it('detecta obstáculo dentro de la zona barrida', () => {
    const r = analyzeFit(largeSpot, { ...car, doors: [door] }, parked, [
      { id: 'pillar', kind: 'column', shape: 'rect', x: 70, y: 230, width: 25, height: 30 },
    ]);
    expect(r.doorStatus).toBe('collision');
    expect(r.doorResults[0]!.blockedByObstacleIds).toContain('pillar');
  });
  it('detecta salida de la zona disponible y conserva encaje de carrocería como limitado', () => {
    const r = analyzeFit(spot, { ...car, doors: [door] }, { x: 125, y: 250, angle: 0 }, []);
    expect(r.doorResults[0]!.blockedBySpotBoundary).toBe(true);
    expect(r.doorStatus).toBe('collision');
    expect(r.status).toBe('limited');
  });
  it('puerta deshabilitada no se evalúa', () => {
    const r = analyzeFit(largeSpot, { ...car, doors: [{ ...door, enabled: false }] }, parked, []);
    expect(r.doorStatus).toBe('not-configured');
    expect(r.doorResults).toHaveLength(0);
  });
});

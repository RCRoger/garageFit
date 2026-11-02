import { describe, expect, it } from 'vitest';
import { planManeuver, angleDifference, approachCorridor } from './maneuver';
import type { ParkingSpot, VehicleDimensions } from '@/types/domain';

const spot: ParkingSpot = { width: 250, length: 500, kind: 'individual', entrance: 'bottom' };
const vehicle: VehicleDimensions = {
  length: 450,
  bodyWidth: 180,
  widthMirrorsFolded: 190,
  widthMirrorsExtended: 205,
  height: 150,
  wheelbase: 270,
  turningDiameter: 1100,
  doors: [],
};
const settings = { corridorWidth: 350, approachLength: 600 };
const parked = { x: 125, y: 250, angle: 0 };

describe('modelo de maniobra', () => {
  it('no verifica sin diámetro de giro', () => {
    const result = planManeuver(spot, { ...vehicle, turningDiameter: null }, parked, [], settings);
    expect(result.status).toBe('not-verified');
    expect(result.turningRadius).toBeNull();
  });
  it('encuentra entrada recta y ruta de salida reversible', () => {
    const result = planManeuver(spot, vehicle, parked, [], settings);
    expect(result.status).toBe('viable');
    expect(result.entryPath.length).toBeGreaterThan(1);
    expect(result.exitPath[0]).toEqual(result.entryPath[result.entryPath.length - 1]);
    expect(result.exitPath[result.exitPath.length - 1]).toEqual(result.entryPath[0]);
    expect(result.turningRadius).toBe(550);
  });
  it('no confunde el límite de búsqueda con inaccesibilidad', () => {
    const result = planManeuver(spot, vehicle, parked, [], settings, 1);
    expect(result.status).toBe('not-verified');
    expect(result.reason).toContain('Límite de búsqueda');
  });
  it('rechaza una zona de aproximación más estrecha que la huella', () => {
    const result = planManeuver(spot, vehicle, parked, [], { ...settings, corridorWidth: 150 });
    expect(result.status).toBe('not-viable');
    expect(result.reason).toContain('aproximación');
  });
  it('marca como no viable un objetivo que colisiona', () => {
    const result = planManeuver(spot, vehicle, parked, [
      { id: 'target-blocker', kind: 'column', shape: 'rect', x: 20, y: 20, width: 210, height: 460 },
    ], settings);
    expect(result.status).toBe('not-viable');
    expect(result.reason).toContain('posición final');
  });
  it('define las cuatro zonas de acceso en el lado seleccionado', () => {
    expect(Math.min(...approachCorridor(spot, 'left', settings).map((point) => point.x))).toBe(-600);
    expect(Math.max(...approachCorridor(spot, 'right', settings).map((point) => point.x))).toBe(850);
    expect(Math.min(...approachCorridor(spot, 'top', settings).map((point) => point.y))).toBe(-600);
    expect(Math.max(...approachCorridor(spot, 'bottom', settings).map((point) => point.y))).toBe(1100);
  });
  it('normaliza diferencias angulares por el camino corto', () => {
    expect(angleDifference(179, -179)).toBeCloseTo(2);
  });
});

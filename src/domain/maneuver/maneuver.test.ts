import { describe, expect, it } from 'vitest';
import {
  angleDifference,
  approachCorridor,
  createManeuverMotionTimeline,
  interpolateTrajectory,
  planManeuver,
  sampleManeuverMotion,
} from './maneuver';
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
  it('refina la búsqueda para alcanzar una plaza ajustada y descentrada', () => {
    const fiesta: VehicleDimensions = {
      length: 391.7,
      bodyWidth: 168.4,
      widthMirrorsFolded: 168.4,
      widthMirrorsExtended: 175.4,
      height: 143.3,
      wheelbase: 248.7,
      turningDiameter: 980,
      doors: [],
    };
    const tightSpot: ParkingSpot = { width: 250, length: 400, kind: 'individual', entrance: 'bottom' };
    const target = { x: 151.5, y: 198.95, angle: 0 };
    const result = planManeuver(tightSpot, fiesta, target, [], settings);

    expect(result.status).toBe('viable');
    expect(result.reason).toContain('refinar');
    const end = result.entryPath.at(-1)!;
    expect(Math.hypot(end.x - target.x, end.y - target.y)).toBeLessThanOrEqual(5);
    expect(angleDifference(end.angle, target.angle)).toBeLessThanOrEqual(2);
    expect(result.exitPath).toEqual([...result.entryPath].reverse());
  });
  it('modela el giro progresivo de las ruedas y centra la dirección al aparcar', () => {
    const fiesta: VehicleDimensions = {
      length: 391.7,
      bodyWidth: 168.4,
      widthMirrorsFolded: 168.4,
      widthMirrorsExtended: 175.4,
      height: 143.3,
      wheelbase: 248.7,
      turningDiameter: 980,
      doors: [],
    };
    const tightSpot: ParkingSpot = { width: 250, length: 400, kind: 'individual', entrance: 'bottom' };
    const target = { x: 151.5, y: 198.95, angle: 0 };
    const result = planManeuver(tightSpot, fiesta, target, [], settings);
    const maxSteeringAngle = Math.atan(fiesta.wheelbase / (fiesta.turningDiameter! / 2)) * (180 / Math.PI);

    expect(result.status).toBe('viable');
    expect(result.entryMotion.at(-1)!.steeringAngle).toBe(0);
    for (let index = 1; index < result.entryMotion.length; index++) {
      const previous = result.entryMotion[index - 1]!;
      const current = result.entryMotion[index]!;
      if (Math.hypot(current.pose.x - previous.pose.x, current.pose.y - previous.pose.y) > 0) {
        expect(Math.abs(current.steeringAngle - previous.steeringAngle)).toBeLessThanOrEqual(
          maxSteeringAngle * 0.5 + 1e-7,
        );
      }
    }
    expect(result.exitMotion).toEqual([...result.entryMotion].reverse().map((frame) => ({
      ...frame,
      direction: frame.direction === 1 ? -1 : 1,
    })));
  });
  it('pausa la reproducción al invertir el sentido sin desplazar el coche', () => {
    const timeline = createManeuverMotionTimeline([
      { pose: { x: 0, y: 0, angle: 0 }, direction: 1, steeringAngle: 0 },
      { pose: { x: 100, y: 0, angle: 0 }, direction: 1, steeringAngle: 20 },
      { pose: { x: 100, y: 0, angle: 0 }, direction: -1, steeringAngle: 20 },
      { pose: { x: 0, y: 0, angle: 0 }, direction: -1, steeringAngle: 0 },
    ]);
    const pause = timeline.phases.find((phase) => phase.kind === 'pause')!;
    const firstDrive = timeline.phases.find((phase) => phase.kind === 'drive')!;
    const steeringSample = sampleManeuverMotion(
      timeline,
      (firstDrive.startMs + firstDrive.durationMs / 2) / timeline.durationMs,
    )!;
    const sample = sampleManeuverMotion(
      timeline,
      (pause.startMs + pause.durationMs / 2) / timeline.durationMs,
    )!;

    expect(pause.kind).toBe('pause');
    expect(steeringSample.frame.steeringAngle).toBeCloseTo(10);
    expect(sample.frame.pose).toEqual({ x: 100, y: 0, angle: 0 });
    expect(sample.frame.direction).toBe(-1);
    expect(timeline.distanceCm).toBe(200);
  });
  it('conserva el acceso completo y evita buscar cada estado de un pasillo largo', () => {
    const longApproach = { corridorWidth: 1000, approachLength: 3000 };
    const result = planManeuver(spot, vehicle, parked, [], longApproach);

    expect(result.status).toBe('viable');
    expect(result.entryPath[0]).toEqual({
      x: spot.width / 2,
      y: spot.length + longApproach.approachLength - vehicle.length / 2,
      angle: 0,
    });
    const end = result.entryPath.at(-1)!;
    expect(Math.hypot(end.x - parked.x, end.y - parked.y)).toBeLessThanOrEqual(5);
    expect(angleDifference(end.angle, parked.angle)).toBeLessThanOrEqual(2);
    expect(result.exitPath).toEqual([...result.entryPath].reverse());
  });
  it('interpola posición y el ángulo por el arco corto', () => {
    const path = [
      { x: 0, y: 0, angle: 179 },
      { x: 10, y: 20, angle: -179 },
    ];
    expect(interpolateTrajectory(path, 0)).toEqual(path[0]);
    expect(interpolateTrajectory(path, 0.5)).toEqual({ x: 5, y: 10, angle: -180 });
    expect(interpolateTrajectory(path, 1)).toEqual(path[1]);
    expect(interpolateTrajectory([], 0)).toBeNull();
  });
  it('mantiene velocidad visual constante entre segmentos de distinta longitud', () => {
    const path = [
      { x: 0, y: 0, angle: 0 },
      { x: 10, y: 0, angle: 0 },
      { x: 110, y: 0, angle: 0 },
    ];

    expect(interpolateTrajectory(path, 0.5)).toEqual({ x: 55, y: 0, angle: 0 });
  });
  it('no confunde el límite de búsqueda con inaccesibilidad', () => {
    const result = planManeuver(spot, vehicle, { ...parked, x: parked.x + 15 }, [], settings, 1);
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

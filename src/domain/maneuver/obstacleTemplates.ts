import type { Obstacle, ParkingSpot } from '@/types/domain';
import { entranceFrame, localRect, type ManeuverSettings } from './maneuver';

export type ObstacleTemplate = 'opposite-car' | 'aisle-column' | 'curb' | 'back-wall';

export const OBSTACLE_TEMPLATES: ReadonlyArray<{ id: ObstacleTemplate; label: string }> = [
  { id: 'opposite-car', label: '+ Coche aparcado enfrente' },
  { id: 'aisle-column', label: '+ Columna en el pasillo' },
  { id: 'curb', label: '+ Bordillo' },
  { id: 'back-wall', label: '+ Pared de fondo' },
];

const PARKED_CAR = { length: 450, width: 180 };
const COLUMN = 30;
const CURB = 15;
const WALL = 15;

/** Crea un obstáculo rectangular colocado respecto a la plaza y al pasillo configurados. */
export function createObstacleTemplate(
  template: ObstacleTemplate,
  spot: ParkingSpot,
  settings: ManeuverSettings,
  id: string,
): Obstacle {
  const f = entranceFrame(spot);
  const straight = (settings.arrivalSide ?? 'straight') === 'straight';
  const depth = straight ? settings.approachLength : settings.corridorWidth;
  const halfSpan = straight ? settings.corridorWidth / 2 : f.halfEdge + settings.approachLength;
  const spotDepth = spot.entrance === 'top' || spot.entrance === 'bottom' ? spot.length : spot.width;

  const rect = (() => {
    switch (template) {
      case 'opposite-car':
        return { kind: 'custom' as const, ...localRect(f, -PARKED_CAR.length / 2, PARKED_CAR.length / 2, depth - PARKED_CAR.width, depth) };
      case 'aisle-column': {
        const s = Math.min(f.halfEdge + 60, Math.max(COLUMN, halfSpan - COLUMN));
        return { kind: 'column' as const, ...localRect(f, s - COLUMN / 2, s + COLUMN / 2, depth / 2 - COLUMN / 2, depth / 2 + COLUMN / 2) };
      }
      case 'curb':
        return { kind: 'wall' as const, ...localRect(f, -halfSpan, halfSpan, depth - CURB, depth) };
      case 'back-wall':
        return { kind: 'wall' as const, ...localRect(f, -f.halfEdge, f.halfEdge, -spotDepth, -spotDepth + WALL) };
    }
  })();

  return {
    id,
    kind: rect.kind,
    shape: 'rect',
    x: rect.minX,
    y: rect.minY,
    width: rect.maxX - rect.minX,
    height: rect.maxY - rect.minY,
  };
}

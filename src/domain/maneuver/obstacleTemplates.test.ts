import { describe, expect, it } from 'vitest';
import type { ParkingSpot } from '@/types/domain';
import { approachCorridor } from './maneuver';
import { createObstacleTemplate, type ObstacleTemplate } from './obstacleTemplates';

const spot: ParkingSpot = { width: 250, length: 500, kind: 'individual', entrance: 'bottom' };
const rectOf = (o: ReturnType<typeof createObstacleTemplate>) => {
  if (o.shape !== 'rect') throw new Error('rect expected');
  return { minX: o.x, minY: o.y, maxX: o.x + o.width, maxY: o.y + o.height };
};

describe('plantillas de obstáculos', () => {
  const settings = { corridorWidth: 600, approachLength: 700 };

  it('coloca el coche de enfrente en el lado opuesto del pasillo, dentro de él', () => {
    const car = rectOf(createObstacleTemplate('opposite-car', spot, settings, 'a'));
    const corridor = approachCorridor(spot, 'bottom', settings).map((p) => p.y);
    expect(car.maxY).toBeCloseTo(Math.max(...corridor));
    expect(car.minY).toBeGreaterThan(spot.length);
  });

  it('adapta la posición a una llegada lateral y a otra entrada', () => {
    const lateral = { ...settings, arrivalSide: 'left' as const };
    const curb = rectOf(createObstacleTemplate('curb', spot, lateral, 'b'));
    expect(curb.maxY).toBeCloseTo(spot.length + lateral.corridorWidth);
    const side = rectOf(createObstacleTemplate('opposite-car', { ...spot, entrance: 'right' }, settings, 'c'));
    expect(side.minX).toBeGreaterThan(spot.width);
  });

  it('pone la pared de fondo en el extremo opuesto a la entrada', () => {
    const wall = rectOf(createObstacleTemplate('back-wall', spot, settings, 'd'));
    expect(wall.minY).toBeCloseTo(0);
    expect(wall.maxX - wall.minX).toBeCloseTo(spot.width);
  });

  it.each<ObstacleTemplate>(['aisle-column'])('coloca %s dentro del pasillo', (template) => {
    const column = rectOf(createObstacleTemplate(template, spot, settings, 'e'));
    const corridor = approachCorridor(spot, 'bottom', settings).map((p) => p.y);
    expect(column.minY).toBeGreaterThanOrEqual(Math.min(...corridor));
    expect(column.maxY).toBeLessThanOrEqual(Math.max(...corridor));
  });
});

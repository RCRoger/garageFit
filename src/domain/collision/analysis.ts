import { closestPointsBetweenPolygons, polygonContains, polygonsIntersect } from '../collision/collision';
import { axisRect, boundingBox, circlePolygon, orientedRect, type Polygon } from '../geometry/polygon';
import { doorPolygonAt, doorSweptArea } from '../doors/doorGeometry';
import { length, sub, vec, type Vec2 } from '../geometry/vec';
import type { Obstacle, ParkingSpot, Placement, VehicleDimensions } from '@/types/domain';

export type FitStatus = 'ok' | 'limited' | 'collision';
export type CheckState = 'verified' | 'not-verified';
export type DoorStatus = 'clear' | 'collision' | 'not-configured';

export interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface FitAnalysis {
  /** Huella del vehículo (carrocería + espejos plegados) en coordenadas de plaza. */
  footprint: Polygon;
  insideSpot: boolean;
  /** Distancia del vehículo a cada pared de la plaza (negativa si sobresale). */
  margins: Margins;
  collidingObstacleIds: string[];
  /** Distancia mínima a obstáculos (null si no hay). */
  minObstacleDistance: number | null;
  /** Segmento de separación mínima para dibujar en el simulador; null si hay colisión o no hay obstáculos. */
  nearestObstacle: { id: string; start: Vec2; end: Vec2 } | null;
  /** Menor margen de cualquier tipo, en cm. */
  minClearance: number;
  status: FitStatus;
  doorStatus: DoorStatus;
  doorResults: DoorResult[];
  /** La fase 5 no está implementada: se informa explícitamente. */
  maneuver: CheckState;
}

export interface DoorResult {
  id: string;
  label: string;
  estimated: boolean;
  blockedByObstacleIds: string[];
  blockedBySpotBoundary: boolean;
  sweptArea: Polygon;
  finalLeaf: Polygon;
  status: Exclude<DoorStatus, 'not-configured'>;
}

export const DEFAULT_COMFORT_MARGIN_CM = 30;

export function vehicleFootprint(v: VehicleDimensions, p: Placement): Polygon {
  return orientedRect(vec(p.x, p.y), v.widthMirrorsFolded, v.length, p.angle);
}

export function obstaclePolygon(o: Obstacle): Polygon {
  return o.shape === 'rect' ? axisRect(o.x, o.y, o.width, o.height) : circlePolygon(vec(o.x, o.y), o.radius);
}

export function spotPolygon(s: ParkingSpot): Polygon {
  return axisRect(0, 0, s.width, s.length);
}

export function computeMargins(spot: ParkingSpot, footprint: Polygon): Margins {
  const b = boundingBox(footprint);
  return { top: b.minY, bottom: spot.length - b.maxY, left: b.minX, right: spot.width - b.maxX };
}

export function analyzeFit(
  spot: ParkingSpot,
  vehicle: VehicleDimensions,
  placement: Placement,
  obstacles: readonly Obstacle[],
  comfortMargin = DEFAULT_COMFORT_MARGIN_CM,
): FitAnalysis {
  const footprint = vehicleFootprint(vehicle, placement);
  const margins = computeMargins(spot, footprint);
  const insideSpot = polygonContains(spotPolygon(spot), footprint);
  const spotBounds = spotPolygon(spot);

  const colliding: string[] = [];
  let minObstacleDistance: number | null = null;
  let nearestObstacle: FitAnalysis['nearestObstacle'] = null;
  for (const o of obstacles) {
    const poly = obstaclePolygon(o);
    if (polygonsIntersect(footprint, poly)) {
      colliding.push(o.id);
      minObstacleDistance = 0;
      continue;
    }
    const closest = closestPointsBetweenPolygons(footprint, poly);
    const d = closest ? length(sub(closest.a, closest.b)) : 0;
    if (closest && (minObstacleDistance === null || d < minObstacleDistance)) {
      nearestObstacle = { id: o.id, start: closest.a, end: closest.b };
    }
    minObstacleDistance = minObstacleDistance === null ? d : Math.min(minObstacleDistance, d);
  }
  if (colliding.length > 0) nearestObstacle = null;

  const doorResults: DoorResult[] = vehicle.doors
    .filter((door) => door.enabled)
    .map((door) => {
      const sweptArea = doorSweptArea(door, vehicle, placement);
      const blockedByObstacleIds = obstacles
        .filter((obstacle) => polygonsIntersect(sweptArea, obstaclePolygon(obstacle)))
        .map((obstacle) => obstacle.id);
      const blockedBySpotBoundary = !polygonContains(spotBounds, sweptArea);
      return {
        id: door.id,
        label: door.label,
        estimated: door.estimated,
        blockedByObstacleIds,
        blockedBySpotBoundary,
        sweptArea,
        finalLeaf: doorPolygonAt(door, vehicle, placement, door.angleDeg),
        status: blockedByObstacleIds.length > 0 || blockedBySpotBoundary ? 'collision' : 'clear',
      };
    });
  const doorStatus: DoorStatus =
    doorResults.length === 0 ? 'not-configured' : doorResults.some((result) => result.status === 'collision') ? 'collision' : 'clear';

  const minClearance = Math.min(
    ...Object.values(margins),
    ...(minObstacleDistance === null ? [] : [minObstacleDistance]),
  );

  const status: FitStatus =
    !insideSpot || colliding.length > 0
      ? 'collision'
      : minClearance < comfortMargin || doorStatus === 'collision'
        ? 'limited'
        : 'ok';

  return {
    footprint,
    insideSpot,
    margins,
    collidingObstacleIds: colliding,
    minObstacleDistance,
    nearestObstacle,
    minClearance,
    status,
    doorStatus,
    doorResults,
    maneuver: 'not-verified',
  };
}

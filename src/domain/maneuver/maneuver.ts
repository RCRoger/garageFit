import { polygonsIntersect } from '../collision/collision';
import { axisRect, orientedRect, type Polygon } from '../geometry/polygon';
import { degToRad, length, sub, vec } from '../geometry/vec';
import { obstaclePolygon, vehicleWidthForClearance } from '../collision/analysis';
import type { Obstacle, ParkingSpot, Placement, VehicleDimensions } from '@/types/domain';

export type ManeuverStatus = 'viable' | 'not-viable' | 'not-verified';

export interface ManeuverResult {
  status: ManeuverStatus;
  entryPath: Placement[];
  /** Exact reverse of the entry route in the reversible, static-obstacle model. */
  exitPath: Placement[];
  expandedNodes: number;
  reason: string;
  turningRadius: number | null;
}

export interface ManeuverSettings {
  corridorWidth: number;
  approachLength: number;
}

interface Node {
  pose: Placement;
  cost: number;
  parent: number;
}

interface QueueItem {
  index: number;
  priority: number;
}

const COLLISION_STEP_CM = 10;
const STEERING = [-1, 0, 1] as const;
const GEARS = [-1, 1] as const;
const SEARCH_RESOLUTIONS = [
  { stepCm: 20, positionBinCm: 20, angleBinDeg: 10, goalPositionToleranceCm: 25, goalAngleToleranceDeg: 8 },
  { stepCm: 10, positionBinCm: 5, angleBinDeg: 2, goalPositionToleranceCm: 5, goalAngleToleranceDeg: 2 },
] as const;

interface SearchResolution {
  stepCm: number;
  positionBinCm: number;
  angleBinDeg: number;
  goalPositionToleranceCm: number;
  goalAngleToleranceDeg: number;
}

class MinHeap {
  private readonly items: QueueItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: QueueItem): void {
    this.items.push(item);
    let index = this.items.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.items[parent]!.priority <= this.items[index]!.priority) break;
      [this.items[parent], this.items[index]] = [this.items[index]!, this.items[parent]!];
      index = parent;
    }
  }

  pop(): QueueItem | undefined {
    const first = this.items[0];
    const last = this.items.pop();
    if (!first || !last || this.items.length === 0) return first;
    this.items[0] = last;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;
      if (left < this.items.length && this.items[left]!.priority < this.items[smallest]!.priority) smallest = left;
      if (right < this.items.length && this.items[right]!.priority < this.items[smallest]!.priority) smallest = right;
      if (smallest === index) break;
      [this.items[index], this.items[smallest]] = [this.items[smallest]!, this.items[index]!];
      index = smallest;
    }
    return first;
  }
}

export function normalizeAngle(angle: number): number {
  return ((angle + 180) % 360 + 360) % 360 - 180;
}

export function angleDifference(a: number, b: number): number {
  return Math.abs(normalizeAngle(a - b));
}

export function approachCorridor(spot: ParkingSpot, entrance: ParkingSpot['entrance'], settings: ManeuverSettings) {
  const { corridorWidth, approachLength } = settings;
  switch (entrance) {
    case 'bottom':
      return axisRect((spot.width - corridorWidth) / 2, spot.length, corridorWidth, approachLength);
    case 'top':
      return axisRect((spot.width - corridorWidth) / 2, -approachLength, corridorWidth, approachLength);
    case 'left':
      return axisRect(-approachLength, (spot.length - corridorWidth) / 2, approachLength, corridorWidth);
    case 'right':
      return axisRect(spot.width, (spot.length - corridorWidth) / 2, approachLength, corridorWidth);
  }
}

function pointInRect(x: number, y: number, rect: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  return x >= rect.minX - 1e-7 && x <= rect.maxX + 1e-7 && y >= rect.minY - 1e-7 && y <= rect.maxY + 1e-7;
}

function pointOnPathInsideDomain(
  point: { x: number; y: number },
  spot: ParkingSpot,
  corridorBounds: { minX: number; minY: number; maxX: number; maxY: number },
): boolean {
  const inSpot = pointInRect(point.x, point.y, { minX: 0, minY: 0, maxX: spot.width, maxY: spot.length });
  return inSpot || pointInRect(point.x, point.y, corridorBounds);
}

function footprint(v: VehicleDimensions, pose: Placement): Polygon {
  return orientedRect(vec(pose.x, pose.y), vehicleWidthForClearance(v), v.length, pose.angle);
}

function poseAllowed(
  pose: Placement,
  spot: ParkingSpot,
  corridorBounds: { minX: number; minY: number; maxX: number; maxY: number },
  vehicle: VehicleDimensions,
  obstacles: readonly Polygon[],
): boolean {
  const car = footprint(vehicle, pose);
  for (const obstacle of obstacles) {
    if (polygonsIntersect(car, obstacle)) return false;
  }

  // Sample the perimeter so a footprint cannot cross the concave seam of the joined bay and corridor.
  for (let i = 0; i < car.length; i++) {
    const start = car[i]!;
    const end = car[(i + 1) % car.length]!;
    const edgeLength = length(sub(end, start));
    const steps = Math.max(1, Math.ceil(edgeLength / COLLISION_STEP_CM));
    for (let step = 0; step <= steps; step++) {
      const t = step / steps;
      if (!pointOnPathInsideDomain(
        { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t },
        spot,
        corridorBounds,
      )) return false;
    }
  }
  return true;
}

function integrate(
  pose: Placement,
  gear: number,
  steering: number,
  maxSteeringAngle: number,
  wheelbase: number,
  distance: number,
): Placement[] {
  const steps = Math.max(1, Math.ceil(distance / COLLISION_STEP_CM));
  const ds = (distance * gear) / steps;
  let x = pose.x;
  let y = pose.y;
  let angle = pose.angle;
  const trajectory: Placement[] = [];
  for (let step = 0; step < steps; step++) {
    const radians = degToRad(angle);
    x += Math.sin(radians) * ds;
    y -= Math.cos(radians) * ds;
    const curvature = Math.tan(steering * maxSteeringAngle) / wheelbase;
    angle = normalizeAngle(angle + (curvature * ds * 180) / Math.PI);
    trajectory.push({ x, y, angle });
  }
  return trajectory;
}

function poseKey(pose: Placement, resolution: SearchResolution): string {
  return [
    Math.round(pose.x / resolution.positionBinCm),
    Math.round(pose.y / resolution.positionBinCm),
    Math.round(normalizeAngle(pose.angle) / resolution.angleBinDeg),
  ].join(':');
}

function heuristic(pose: Placement, target: Placement, turningRadius: number): number {
  const distance = Math.hypot(pose.x - target.x, pose.y - target.y);
  const turning = (angleDifference(pose.angle, target.angle) * Math.PI * turningRadius) / 180;
  return Math.max(distance, turning);
}

function reachedGoal(pose: Placement, target: Placement, resolution: SearchResolution): boolean {
  return Math.hypot(pose.x - target.x, pose.y - target.y) <= resolution.goalPositionToleranceCm &&
    angleDifference(pose.angle, target.angle) <= resolution.goalAngleToleranceDeg;
}

function startPose(spot: ParkingSpot, entrance: ParkingSpot['entrance'], approachLength: number, vehicleLength: number): Placement {
  switch (entrance) {
    case 'bottom': return { x: spot.width / 2, y: spot.length + approachLength - vehicleLength / 2, angle: 0 };
    case 'top': return { x: spot.width / 2, y: -approachLength + vehicleLength / 2, angle: 180 };
    case 'left': return { x: -approachLength + vehicleLength / 2, y: spot.length / 2, angle: 90 };
    case 'right': return { x: spot.width + approachLength - vehicleLength / 2, y: spot.length / 2, angle: -90 };
  }
}

function straightSegment(
  from: Placement,
  to: Placement,
  spot: ParkingSpot,
  corridorBounds: { minX: number; minY: number; maxX: number; maxY: number },
  vehicle: VehicleDimensions,
  obstacles: readonly Polygon[],
): Placement[] | null {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / COLLISION_STEP_CM));
  const segment: Placement[] = [];
  for (let step = 0; step <= steps; step++) {
    const progress = step / steps;
    const pose = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      angle: from.angle,
    };
    if (!poseAllowed(pose, spot, corridorBounds, vehicle, obstacles)) return null;
    segment.push(pose);
  }
  return segment;
}

function alignedForStraightTravel(from: Placement, to: Placement): boolean {
  const radians = degToRad(from.angle);
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const along = deltaX * Math.sin(radians) - deltaY * Math.cos(radians);
  const lateral = -deltaX * Math.cos(radians) - deltaY * Math.sin(radians);
  return angleDifference(from.angle, to.angle) <= 1e-7 && along >= 0 && Math.abs(lateral) <= 1e-7;
}

function pathTo(nodes: readonly Node[], goalIndex: number): Placement[] {
  const result: Placement[] = [];
  let index = goalIndex;
  while (index >= 0) {
    const node = nodes[index]!;
    result.push(node.pose);
    index = node.parent;
  }
  return result.reverse();
}

function result(
  status: ManeuverStatus,
  reason: string,
  turningRadius: number | null,
  expandedNodes = 0,
  entryPath: Placement[] = [],
): ManeuverResult {
  return {
    status,
    reason,
    turningRadius,
    expandedNodes,
    entryPath,
    exitPath: status === 'viable' ? [...entryPath].reverse() : [],
  };
}

/**
 * Bounded Hybrid-A* search with a coarse pass and a finer retry for missed routes.
 * The reversible, static-obstacle assumption makes the exit path the exact reverse of entry.
 * Search exhaustion is reported as not-verified when the expansion cap is reached.
 */
export function planManeuver(
  spot: ParkingSpot,
  vehicle: VehicleDimensions,
  target: Placement,
  obstacles: readonly Obstacle[],
  settings: ManeuverSettings,
  maxExpanded = 5000,
): ManeuverResult {
  if (vehicle.turningDiameter === null || vehicle.turningDiameter === undefined) {
    return result('not-verified', 'Introduce el diámetro de giro para usar el modelo bicicleta.', null);
  }
  const turningRadius = vehicle.turningDiameter / 2;
  const corridor = approachCorridor(spot, spot.entrance, settings);
  const corridorBounds = {
    minX: Math.min(...corridor.map((p) => p.x)),
    minY: Math.min(...corridor.map((p) => p.y)),
    maxX: Math.max(...corridor.map((p) => p.x)),
    maxY: Math.max(...corridor.map((p) => p.y)),
  };
  const obstaclePolygons = obstacles.map(obstaclePolygon);
  const actualStart = startPose(spot, spot.entrance, settings.approachLength, vehicle.length);

  if (!poseAllowed(actualStart, spot, corridorBounds, vehicle, obstaclePolygons)) {
    return result('not-viable', 'El vehículo no cabe en la zona de aproximación configurada.', turningRadius);
  }
  if (!poseAllowed(target, spot, corridorBounds, vehicle, obstaclePolygons)) {
    return result('not-viable', 'La posición final del vehículo colisiona o sale del área modelada.', turningRadius);
  }

  // Long empty approaches add many equivalent straight-ahead states without helping the turn search.
  const planningApproachLength = Math.min(settings.approachLength, Math.max(vehicle.length, turningRadius * 2));
  const planningStart = startPose(spot, spot.entrance, planningApproachLength, vehicle.length);
  const approachPrefix = straightSegment(
    actualStart,
    planningStart,
    spot,
    corridorBounds,
    vehicle,
    obstaclePolygons,
  );
  const start = approachPrefix ? planningStart : actualStart;
  const prefix = approachPrefix ?? [actualStart];

  if (alignedForStraightTravel(start, target)) {
    const straightPath = straightSegment(start, target, spot, corridorBounds, vehicle, obstaclePolygons);
    if (straightPath) {
      const entryPath = [...prefix.slice(0, -1), ...straightPath];
      return result(
        'viable',
        'Se encontró una trayectoria recta libre hasta la posición final.',
        turningRadius,
        0,
        entryPath,
      );
    }
  }

  const maxSteeringAngle = Math.atan(vehicle.wheelbase / turningRadius);
  let expandedNodes = 0;

  for (const [resolutionIndex, resolution] of SEARCH_RESOLUTIONS.entries()) {
    const remaining = maxExpanded - expandedNodes;
    if (remaining <= 0) break;
    const stageBudget = resolutionIndex === 0
      ? Math.min(remaining, Math.max(1, Math.floor(maxExpanded / 4)))
      : remaining;
    const searchResult = searchManeuver(
      start,
      target,
      spot,
      corridorBounds,
      vehicle,
      obstaclePolygons,
      turningRadius,
      maxSteeringAngle,
      resolution,
      stageBudget,
      expandedNodes,
    );
    expandedNodes = searchResult.expandedNodes;
    if (searchResult.status === 'viable') {
      if (resolutionIndex === 0) continue;
      const completeResult = prefix.length > 1
        ? {
          ...searchResult,
          entryPath: [...prefix.slice(0, -1), ...searchResult.entryPath],
          exitPath: [...searchResult.entryPath].reverse().concat(prefix.slice(0, -1).reverse()),
        }
        : searchResult;
      return resolutionIndex > 0
        ? { ...completeResult, reason: `${completeResult.reason} Se encontró al refinar la resolución de búsqueda.` }
        : completeResult;
    }
  }

  if (expandedNodes >= maxExpanded) {
    return result(
      'not-verified',
      `Límite de búsqueda alcanzado (${maxExpanded} estados); no se puede concluir que sea inaccesible.`,
      turningRadius,
      expandedNodes,
    );
  }

  return result(
    'not-viable',
    `No se encontró una trayectoria tras agotar la búsqueda gruesa y refinada (${SEARCH_RESOLUTIONS[1].stepCm} cm, ${SEARCH_RESOLUTIONS[1].positionBinCm} cm/${SEARCH_RESOLUTIONS[1].angleBinDeg}°).`,
    turningRadius,
    expandedNodes,
  );
}

function searchManeuver(
  start: Placement,
  target: Placement,
  spot: ParkingSpot,
  corridorBounds: { minX: number; minY: number; maxX: number; maxY: number },
  vehicle: VehicleDimensions,
  obstaclePolygons: readonly Polygon[],
  turningRadius: number,
  maxSteeringAngle: number,
  resolution: SearchResolution,
  maxExpanded: number,
  expandedOffset: number,
): ManeuverResult {
  const nodes: Node[] = [{ pose: start, cost: 0, parent: -1 }];
  const open = new MinHeap();
  open.push({ index: 0, priority: heuristic(start, target, turningRadius) });
  const bestCost = new Map<string, number>([[poseKey(start, resolution), 0]]);
  const closed = new Set<string>();
  let expanded = 0;

  while (open.size > 0) {
    const item = open.pop()!;
    const current = nodes[item.index]!;
    const key = poseKey(current.pose, resolution);
    if (closed.has(key)) continue;
    if (reachedGoal(current.pose, target, resolution)) {
      const entryPath = pathTo(nodes, item.index);
      return result(
        'viable',
        `Se encontró una trayectoria de entrada con tolerancia final de ${resolution.goalPositionToleranceCm} cm y ${resolution.goalAngleToleranceDeg}°; la salida es su recorrido inverso.`,
        turningRadius,
        expandedOffset + expanded,
        entryPath,
      );
    }
    if (expanded >= maxExpanded) {
      return result(
        'not-verified',
        `Límite de búsqueda alcanzado (${expandedOffset + maxExpanded} estados); no se puede concluir que sea inaccesible.`,
        turningRadius,
        expandedOffset + maxExpanded,
      );
    }
    closed.add(key);
    expanded++;

    for (const gear of GEARS) {
      for (const steering of STEERING) {
        const trajectory = integrate(current.pose, gear, steering, maxSteeringAngle, vehicle.wheelbase, resolution.stepCm);
        const nextPose = trajectory[trajectory.length - 1]!;
        if (trajectory.some((pose) => !poseAllowed(pose, spot, corridorBounds, vehicle, obstaclePolygons))) continue;
        const nextKey = poseKey(nextPose, resolution);
        if (closed.has(nextKey)) continue;
        const nextCost = current.cost + resolution.stepCm * (gear < 0 ? 1.15 : 1);
        if (nextCost >= (bestCost.get(nextKey) ?? Infinity)) continue;
        bestCost.set(nextKey, nextCost);
        const nextIndex = nodes.push({ pose: nextPose, cost: nextCost, parent: item.index }) - 1;
        const nextHeuristic = heuristic(nextPose, target, turningRadius);
        open.push({ index: nextIndex, priority: nextCost + nextHeuristic });
      }
    }
  }

  return result(
    'not-viable',
    'La búsqueda agotó los estados alcanzables sin encontrar una trayectoria.',
    turningRadius,
    expandedOffset + expanded,
  );
}

export function interpolateTrajectory(path: readonly Placement[], progress: number): Placement | null {
  if (path.length === 0) return null;
  if (path.length === 1) return path[0]!;
  const segmentLengths = path.slice(1).map((pose, index) =>
    Math.hypot(pose.x - path[index]!.x, pose.y - path[index]!.y));
  const totalLength = segmentLengths.reduce((total, segmentLength) => total + segmentLength, 0);
  if (totalLength === 0) return path[0]!;
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  if (normalizedProgress === 0) return path[0]!;
  if (normalizedProgress === 1) return path[path.length - 1]!;
  let remaining = normalizedProgress * totalLength;
  let index = 0;
  while (index < segmentLengths.length - 1 && remaining > segmentLengths[index]!) {
    remaining -= segmentLengths[index]!;
    index++;
  }
  const fraction = segmentLengths[index]! === 0 ? 1 : remaining / segmentLengths[index]!;
  const from = path[index]!;
  const to = path[index + 1]!;
  const angleDelta = normalizeAngle(to.angle - from.angle);
  return {
    x: from.x + (to.x - from.x) * fraction,
    y: from.y + (to.y - from.y) * fraction,
    angle: normalizeAngle(from.angle + angleDelta * fraction),
  };
}

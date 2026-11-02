import { polygonsIntersect } from '../collision/collision';
import { axisRect, orientedRect, type Polygon } from '../geometry/polygon';
import { degToRad, length, sub, vec } from '../geometry/vec';
import { obstaclePolygon } from '../collision/analysis';
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

const STEP_CM = 20;
const COLLISION_STEP_CM = 10;
const POSITION_BIN_CM = 20;
const ANGLE_BIN_DEG = 10;
const GOAL_POSITION_TOLERANCE_CM = 25;
const GOAL_ANGLE_TOLERANCE_DEG = 8;
const STEERING = [-1, 0, 1] as const;
const GEARS = [-1, 1] as const;

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
  return orientedRect(vec(pose.x, pose.y), v.widthMirrorsFolded, v.length, pose.angle);
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

function poseKey(pose: Placement): string {
  return [
    Math.round(pose.x / POSITION_BIN_CM),
    Math.round(pose.y / POSITION_BIN_CM),
    Math.round(normalizeAngle(pose.angle) / ANGLE_BIN_DEG),
  ].join(':');
}

function heuristic(pose: Placement, target: Placement, turningRadius: number): number {
  const distance = Math.hypot(pose.x - target.x, pose.y - target.y);
  const turning = (angleDifference(pose.angle, target.angle) * Math.PI * turningRadius) / 180;
  return Math.max(distance, turning);
}

function reachedGoal(pose: Placement, target: Placement): boolean {
  return Math.hypot(pose.x - target.x, pose.y - target.y) <= GOAL_POSITION_TOLERANCE_CM &&
    angleDifference(pose.angle, target.angle) <= GOAL_ANGLE_TOLERANCE_DEG;
}

function startPose(spot: ParkingSpot, entrance: ParkingSpot['entrance'], approachLength: number, vehicleLength: number): Placement {
  switch (entrance) {
    case 'bottom': return { x: spot.width / 2, y: spot.length + approachLength - vehicleLength / 2, angle: 0 };
    case 'top': return { x: spot.width / 2, y: -approachLength + vehicleLength / 2, angle: 180 };
    case 'left': return { x: -approachLength + vehicleLength / 2, y: spot.length / 2, angle: 90 };
    case 'right': return { x: spot.width + approachLength - vehicleLength / 2, y: spot.length / 2, angle: -90 };
  }
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
 * Bounded Hybrid-A* search using a kinematic bicycle model and 20 cm / 10° state bins.
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
  const start = startPose(spot, spot.entrance, settings.approachLength, vehicle.length);

  if (!poseAllowed(start, spot, corridorBounds, vehicle, obstaclePolygons)) {
    return result('not-viable', 'El vehículo no cabe en la zona de aproximación configurada.', turningRadius);
  }
  if (!poseAllowed(target, spot, corridorBounds, vehicle, obstaclePolygons)) {
    return result('not-viable', 'La posición final del vehículo colisiona o sale del área modelada.', turningRadius);
  }

  const maxSteeringAngle = Math.atan(vehicle.wheelbase / turningRadius);
  const nodes: Node[] = [{ pose: start, cost: 0, parent: -1 }];
  const open = new MinHeap();
  open.push({ index: 0, priority: heuristic(start, target, turningRadius) });
  const bestCost = new Map<string, number>([[poseKey(start), 0]]);
  const closed = new Set<string>();
  let expanded = 0;

  while (open.size > 0) {
    const item = open.pop()!;
    const current = nodes[item.index]!;
    const key = poseKey(current.pose);
    if (closed.has(key)) continue;
    if (reachedGoal(current.pose, target)) {
      const entryPath = pathTo(nodes, item.index);
      return result(
        'viable',
        `Se encontró una trayectoria de entrada con tolerancia final de ${GOAL_POSITION_TOLERANCE_CM} cm y ${GOAL_ANGLE_TOLERANCE_DEG}°; la salida es su recorrido inverso.`,
        turningRadius,
        expanded,
        entryPath,
      );
    }
    if (expanded >= maxExpanded) {
      return result('not-verified', `Límite de búsqueda alcanzado (${maxExpanded} estados); no se puede concluir que sea inaccesible.`, turningRadius, expanded);
    }
    closed.add(key);
    expanded++;

    for (const gear of GEARS) {
      for (const steering of STEERING) {
        const trajectory = integrate(current.pose, gear, steering, maxSteeringAngle, vehicle.wheelbase, STEP_CM);
        const nextPose = trajectory[trajectory.length - 1]!;
        if (trajectory.some((pose) => !poseAllowed(pose, spot, corridorBounds, vehicle, obstaclePolygons))) continue;
        const nextKey = poseKey(nextPose);
        if (closed.has(nextKey)) continue;
        const nextCost = current.cost + STEP_CM * (gear < 0 ? 1.15 : 1);
        if (nextCost >= (bestCost.get(nextKey) ?? Infinity)) continue;
        bestCost.set(nextKey, nextCost);
        const nextIndex = nodes.push({ pose: nextPose, cost: nextCost, parent: item.index }) - 1;
        open.push({ index: nextIndex, priority: nextCost + heuristic(nextPose, target, turningRadius) });
      }
    }
  }

  return result('not-viable', 'La búsqueda agotó los estados alcanzables sin encontrar una trayectoria.', turningRadius, expanded);
}

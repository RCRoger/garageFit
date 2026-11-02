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
  entryMotion: ManeuverMotionFrame[];
  exitMotion: ManeuverMotionFrame[];
  expandedNodes: number;
  reason: string;
  turningRadius: number | null;
}

export interface ManeuverMotionFrame {
  pose: Placement;
  direction: -1 | 1;
  steeringAngle: number;
}

export interface ManeuverMotionTimeline {
  path: readonly ManeuverMotionFrame[];
  phases: Array<
    | { kind: 'drive'; startIndex: number; endIndex: number; startMs: number; durationMs: number; distance: number }
    | { kind: 'pause'; index: number; startMs: number; durationMs: number }
  >;
  durationMs: number;
  distanceCm: number;
}

export interface ManeuverMotionSample {
  frame: ManeuverMotionFrame;
  pathIndex: number;
}

export interface ManeuverSettings {
  corridorWidth: number;
  approachLength: number;
}

interface Node {
  pose: Placement;
  cost: number;
  parent: number;
  direction: -1 | 1;
  steeringIndex: number;
}

interface QueueItem {
  index: number;
  priority: number;
}

const COLLISION_STEP_CM = 10;
const STEERING_LEVELS = [-1, -0.5, 0, 0.5, 1] as const;
const STEERING_SHIFT_PER_PRIMITIVE = 1;
const GEAR_CHANGE_COST_CM = 60;
const MOTION_SPEED_CM_PER_SECOND = 160;
const DIRECTION_CHANGE_PAUSE_MS = 550;
const MIN_DRIVE_PHASE_MS = 800;
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
  direction: number,
  fromSteeringAngle: number,
  toSteeringAngle: number,
  wheelbase: number,
  distance: number,
): Placement[] {
  const steps = Math.max(1, Math.ceil(distance / COLLISION_STEP_CM));
  const ds = (distance * direction) / steps;
  let x = pose.x;
  let y = pose.y;
  let angle = pose.angle;
  const trajectory: Placement[] = [];
  for (let step = 0; step < steps; step++) {
    const steeringProgress = (step + 1) / steps;
    const steeringAngle = fromSteeringAngle + (toSteeringAngle - fromSteeringAngle) * steeringProgress;
    const radians = degToRad(angle);
    x += Math.sin(radians) * ds;
    y -= Math.cos(radians) * ds;
    const curvature = Math.tan(steeringAngle) / wheelbase;
    angle = normalizeAngle(angle + (curvature * ds * 180) / Math.PI);
    trajectory.push({ x, y, angle });
  }
  return trajectory;
}

function poseKey(
  pose: Placement,
  resolution: SearchResolution,
  direction: -1 | 1,
  steeringIndex: number,
): string {
  return [
    Math.round(pose.x / resolution.positionBinCm),
    Math.round(pose.y / resolution.positionBinCm),
    Math.round(normalizeAngle(pose.angle) / resolution.angleBinDeg),
    direction,
    steeringIndex,
  ].join(':');
}

function heuristic(
  pose: Placement,
  target: Placement,
  turningRadius: number,
  steeringIndex: number,
  stepCm: number,
): number {
  const distance = Math.hypot(pose.x - target.x, pose.y - target.y);
  const turning = (angleDifference(pose.angle, target.angle) * Math.PI * turningRadius) / 180;
  const steering = Math.abs(steeringIndex) * stepCm;
  return Math.max(distance, turning, steering);
}

function reachedGoal(
  pose: Placement,
  target: Placement,
  resolution: SearchResolution,
  steeringIndex: number,
): boolean {
  return Math.hypot(pose.x - target.x, pose.y - target.y) <= resolution.goalPositionToleranceCm &&
    angleDifference(pose.angle, target.angle) <= resolution.goalAngleToleranceDeg &&
    steeringIndex === 0;
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
): ManeuverMotionFrame[] | null {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / COLLISION_STEP_CM));
  const segment: ManeuverMotionFrame[] = [];
  for (let step = 0; step <= steps; step++) {
    const progress = step / steps;
    const pose = {
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
      angle: from.angle,
    };
    if (!poseAllowed(pose, spot, corridorBounds, vehicle, obstacles)) return null;
    segment.push({ pose, direction: 1, steeringAngle: 0 });
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

function pathTo(nodes: readonly Node[], goalIndex: number, maxSteeringAngle: number): ManeuverMotionFrame[] {
  const result: ManeuverMotionFrame[] = [];
  let index = goalIndex;
  while (index >= 0) {
    const node = nodes[index]!;
    result.push({
      pose: node.pose,
      direction: node.direction,
      steeringAngle: STEERING_LEVELS[node.steeringIndex + 2]! * maxSteeringAngle,
    });
    index = node.parent;
  }
  return result.reverse();
}

function result(
  status: ManeuverStatus,
  reason: string,
  turningRadius: number | null,
  expandedNodes = 0,
  entryMotion: ManeuverMotionFrame[] = [],
): ManeuverResult {
  const usableMotion = status === 'viable' ? entryMotion : [];
  const exitMotion = usableMotion.slice().reverse().map((frame) => ({
    ...frame,
    direction: frame.direction === 1 ? -1 as const : 1 as const,
  }));
  const entryPath = usableMotion.map((frame) => frame.pose);
  return {
    status,
    reason,
    turningRadius,
    expandedNodes,
    entryPath,
    exitPath: exitMotion.map((frame) => frame.pose),
    entryMotion: usableMotion,
    exitMotion,
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
  maxExpanded = 100000,
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
  const prefix = approachPrefix ?? [{ pose: actualStart, direction: 1 as const, steeringAngle: 0 }];

  if (alignedForStraightTravel(start, target)) {
    const straightPath = straightSegment(start, target, spot, corridorBounds, vehicle, obstaclePolygons);
    if (straightPath) {
      return result(
        'viable',
        'Se encontró una trayectoria recta libre hasta la posición final.',
        turningRadius,
        0,
        [...prefix.slice(0, -1), ...straightPath],
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
      const entryMotion = [...prefix.slice(0, -1), ...searchResult.entryMotion];
      const exitMotion = entryMotion.slice().reverse().map((frame) => ({
        ...frame,
        direction: frame.direction === 1 ? -1 as const : 1 as const,
      }));
      const completeResult = {
        ...searchResult,
        entryMotion,
        exitMotion,
        entryPath: entryMotion.map((frame) => frame.pose),
        exitPath: exitMotion.map((frame) => frame.pose),
      };
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
  const nodes: Node[] = [{ pose: start, cost: 0, parent: -1, direction: 1, steeringIndex: 0 }];
  const open = new MinHeap();
  open.push({ index: 0, priority: heuristic(start, target, turningRadius, 0, resolution.stepCm) });
  const bestCost = new Map<string, number>([[poseKey(start, resolution, 1, 0), 0]]);
  const closed = new Set<string>();
  let expanded = 0;

  while (open.size > 0) {
    const item = open.pop()!;
    const current = nodes[item.index]!;
    const key = poseKey(current.pose, resolution, current.direction, current.steeringIndex);
    if (closed.has(key)) continue;
    if (reachedGoal(current.pose, target, resolution, current.steeringIndex)) {
      const entryMotion = pathTo(nodes, item.index, maxSteeringAngle);
      return result(
        'viable',
        `Se encontró una trayectoria de entrada con tolerancia final de ${resolution.goalPositionToleranceCm} cm y ${resolution.goalAngleToleranceDeg}°; la salida es su recorrido inverso.`,
        turningRadius,
        expandedOffset + expanded,
        entryMotion,
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

    const shiftedDirection = current.direction === 1 ? -1 : 1;
    const shiftedKey = poseKey(current.pose, resolution, shiftedDirection, current.steeringIndex);
    const shiftCost = current.cost + GEAR_CHANGE_COST_CM;
    if (!closed.has(shiftedKey) && shiftCost < (bestCost.get(shiftedKey) ?? Infinity)) {
      bestCost.set(shiftedKey, shiftCost);
      const shiftedIndex = nodes.push({
        pose: current.pose,
        cost: shiftCost,
        parent: item.index,
        direction: shiftedDirection,
        steeringIndex: current.steeringIndex,
      }) - 1;
      open.push({
        index: shiftedIndex,
        priority: shiftCost + heuristic(
          current.pose,
          target,
          turningRadius,
          current.steeringIndex,
          resolution.stepCm,
        ),
      });
    }

    const currentSteeringAngle = STEERING_LEVELS[current.steeringIndex + 2]! * maxSteeringAngle;
    const firstSteeringIndex = Math.max(-2, current.steeringIndex - STEERING_SHIFT_PER_PRIMITIVE);
    const lastSteeringIndex = Math.min(2, current.steeringIndex + STEERING_SHIFT_PER_PRIMITIVE);
    for (const steeringIndex of Array.from({ length: lastSteeringIndex - firstSteeringIndex + 1 }, (_, index) =>
      firstSteeringIndex + index)) {
      const steeringAngle = STEERING_LEVELS[steeringIndex + 2]!;
      const trajectory = integrate(
        current.pose,
        current.direction,
        currentSteeringAngle,
        steeringAngle * maxSteeringAngle,
        vehicle.wheelbase,
        resolution.stepCm,
      );
      const nextPose = trajectory[trajectory.length - 1]!;
      if (trajectory.some((pose) => !poseAllowed(pose, spot, corridorBounds, vehicle, obstaclePolygons))) continue;
      const nextKey = poseKey(nextPose, resolution, current.direction, steeringIndex);
      if (closed.has(nextKey)) continue;
      const nextCost = current.cost + resolution.stepCm * (current.direction < 0 ? 1.15 : 1);
      if (nextCost >= (bestCost.get(nextKey) ?? Infinity)) continue;
      bestCost.set(nextKey, nextCost);
      const nextIndex = nodes.push({
        pose: nextPose,
        cost: nextCost,
        parent: item.index,
        direction: current.direction,
        steeringIndex,
      }) - 1;
      const nextHeuristic = heuristic(nextPose, target, turningRadius, steeringIndex, resolution.stepCm);
      open.push({ index: nextIndex, priority: nextCost + nextHeuristic });
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

export function createManeuverMotionTimeline(path: readonly ManeuverMotionFrame[]): ManeuverMotionTimeline {
  const phases: ManeuverMotionTimeline['phases'] = [];
  let elapsedMs = 0;
  let runStart = 0;
  let runDistance = 0;

  const addDrivePhase = (startIndex: number, endIndex: number, distance: number) => {
    if (distance <= 0) return;
    const durationMs = Math.max(MIN_DRIVE_PHASE_MS, (distance / MOTION_SPEED_CM_PER_SECOND) * 1000);
    phases.push({ kind: 'drive', startIndex, endIndex, startMs: elapsedMs, durationMs, distance });
    elapsedMs += durationMs;
  };

  for (let index = 1; index < path.length; index++) {
    const previous = path[index - 1]!;
    const current = path[index]!;
    const segmentDistance = Math.hypot(
      current.pose.x - previous.pose.x,
      current.pose.y - previous.pose.y,
    );
    if (segmentDistance < 1e-7 && current.direction !== previous.direction) {
      addDrivePhase(runStart, index - 1, runDistance);
      phases.push({ kind: 'pause', index, startMs: elapsedMs, durationMs: DIRECTION_CHANGE_PAUSE_MS });
      elapsedMs += DIRECTION_CHANGE_PAUSE_MS;
      runStart = index;
      runDistance = 0;
      continue;
    }
    runDistance += segmentDistance;
  }
  addDrivePhase(runStart, path.length - 1, runDistance);

  const totalDistance = path.slice(1).reduce((total, frame, index) =>
    total + Math.hypot(frame.pose.x - path[index]!.pose.x, frame.pose.y - path[index]!.pose.y), 0);
  return {
    path,
    phases,
    durationMs: elapsedMs || MIN_DRIVE_PHASE_MS,
    distanceCm: totalDistance,
  };
}

export function sampleManeuverMotion(
  timeline: ManeuverMotionTimeline,
  progress: number,
): ManeuverMotionSample | null {
  const { path, phases } = timeline;
  if (path.length === 0) return null;
  const normalizedProgress = Math.max(0, Math.min(1, progress));
  if (normalizedProgress === 0) return { frame: path[0]!, pathIndex: 0 };
  if (normalizedProgress === 1) return { frame: path[path.length - 1]!, pathIndex: path.length - 1 };
  const elapsedMs = normalizedProgress * timeline.durationMs;
  const phase = phases.find((candidate) => elapsedMs <= candidate.startMs + candidate.durationMs) ?? phases.at(-1);
  if (!phase) return { frame: path[0]!, pathIndex: 0 };
  if (phase.kind === 'pause') return { frame: path[phase.index]!, pathIndex: phase.index };

  const phaseProgress = Math.max(0, Math.min(1, (elapsedMs - phase.startMs) / phase.durationMs));
  const easedProgress = phaseProgress * phaseProgress * (3 - 2 * phaseProgress);
  let distanceRemaining = phase.distance * easedProgress;
  for (let index = phase.startIndex + 1; index <= phase.endIndex; index++) {
    const from = path[index - 1]!;
    const to = path[index]!;
    const segmentDistance = Math.hypot(to.pose.x - from.pose.x, to.pose.y - from.pose.y);
    if (distanceRemaining <= segmentDistance || index === phase.endIndex) {
      const fraction = segmentDistance === 0 ? 1 : Math.min(1, distanceRemaining / segmentDistance);
      const angleDelta = normalizeAngle(to.pose.angle - from.pose.angle);
      return {
        pathIndex: index - 1,
        frame: {
          pose: {
            x: from.pose.x + (to.pose.x - from.pose.x) * fraction,
            y: from.pose.y + (to.pose.y - from.pose.y) * fraction,
            angle: normalizeAngle(from.pose.angle + angleDelta * fraction),
          },
          direction: from.direction,
          steeringAngle: from.steeringAngle + (to.steeringAngle - from.steeringAngle) * fraction,
        },
      };
    }
    distanceRemaining -= segmentDistance;
  }
  const lastIndex = phase.endIndex;
  return { frame: path[lastIndex]!, pathIndex: lastIndex };
}

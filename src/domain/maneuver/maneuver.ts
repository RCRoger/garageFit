import { polygonDistance, polygonsIntersect } from '../collision/collision';
import { axisRect, orientedRect, type Polygon } from '../geometry/polygon';
import { degToRad, vec } from '../geometry/vec';
import { obstaclePolygon, vehicleWidthForClearance } from '../collision/analysis';
import type { Obstacle, ParkingSpot, Placement, VehicleDimensions } from '@/types/domain';

export type ManeuverStatus = 'viable' | 'not-viable' | 'not-verified';

export interface ManeuverResult {
  /** Estado de la entrada. La salida tiene su propio estado en `exitStatus`. */
  status: ManeuverStatus;
  entryPath: Placement[];
  exitPath: Placement[];
  entryMotion: ManeuverMotionFrame[];
  exitMotion: ManeuverMotionFrame[];
  exitStatus: ManeuverStatus;
  exitReason: string;
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
  arrivalSide?: 'straight' | 'left' | 'right';
  startOffset?: number;
  entryMode?: 'nose-in' | 'tail-in';
  exitMode?: 'nose-out' | 'tail-out';
  exitSide?: 'same' | 'left' | 'right';
}

export interface Rect { minX: number; minY: number; maxX: number; maxY: number }

interface SearchGoal {
  pose: Placement;
  reached: (pose: Placement, steeringIndex: number, resolution: SearchResolution) => boolean;
  /** Extra lower-bound hint combined with the default heuristic. */
  estimate?: (pose: Placement) => number;
  /** Larger weights reduce search time but can trade some optimality. */
  weight?: number;
}

interface Node {
  pose: Placement;
  cost: number;
  parent: number;
  direction: -1 | 1;
  steeringIndex: number;
  motionFromParent: ManeuverMotionFrame[];
}

interface QueueItem {
  index: number;
  priority: number;
}

const COLLISION_STEP_CM = 10;
export const MANEUVER_CLEARANCE_CM = 10;
const PREFERRED_OBSTACLE_CLEARANCE_CM = 30;
const CLEARANCE_COST_WEIGHT = 2;
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

export interface EntranceFrame {
  angle: number;
  /** Eje del pasillo: lado derecho del coche al entrar. */
  r: { x: number; y: number };
  /** Normal que sale de la plaza. */
  n: { x: number; y: number };
  /** Centro del borde de entrada. */
  c: { x: number; y: number };
  halfEdge: number;
}

const ENTRANCE_ANGLE: Record<ParkingSpot['entrance'], number> = { bottom: 0, top: 180, left: 90, right: -90 };

export function entranceFrame(spot: ParkingSpot, entrance: ParkingSpot['entrance'] = spot.entrance): EntranceFrame {
  const angle = ENTRANCE_ANGLE[entrance];
  const radians = degToRad(angle);
  const r = { x: Math.round(Math.cos(radians)), y: Math.round(Math.sin(radians)) };
  const n = { x: Math.round(-Math.sin(radians)), y: Math.round(Math.cos(radians)) };
  const horizontalEdge = entrance === 'top' || entrance === 'bottom';
  const halfEdge = (horizontalEdge ? spot.width : spot.length) / 2;
  const halfDepth = (horizontalEdge ? spot.length : spot.width) / 2;
  return {
    angle,
    r,
    n,
    c: { x: spot.width / 2 + n.x * halfDepth, y: spot.length / 2 + n.y * halfDepth },
    halfEdge,
  };
}

export function localRect(f: EntranceFrame, sMin: number, sMax: number, dMin: number, dMax: number): Rect {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const s of [sMin, sMax]) {
    for (const d of [dMin, dMax]) {
      xs.push(f.c.x + f.r.x * s + f.n.x * d);
      ys.push(f.c.y + f.r.y * s + f.n.y * d);
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function domainRects(spot: ParkingSpot, settings: ManeuverSettings, entrance: ParkingSpot['entrance'] = spot.entrance): Rect[] {
  const f = entranceFrame(spot, entrance);
  const { corridorWidth, approachLength } = settings;
  if ((settings.arrivalSide ?? 'straight') === 'straight') {
    return [localRect(f, -corridorWidth / 2, corridorWidth / 2, 0, approachLength)];
  }
  const half = f.halfEdge + approachLength;
  return [localRect(f, -half, half, 0, corridorWidth)];
}

export function approachCorridor(spot: ParkingSpot, entrance: ParkingSpot['entrance'], settings: ManeuverSettings) {
  const [rect] = domainRects(spot, settings, entrance);
  return axisRect(rect!.minX, rect!.minY, rect!.maxX - rect!.minX, rect!.maxY - rect!.minY);
}

/** Ángulo que debe tener el vehículo aparcado según se entre de frente o de culo. */
export function parkedAngle(spot: ParkingSpot, entryMode: 'nose-in' | 'tail-in' = 'nose-in'): number {
  return normalizeAngle(ENTRANCE_ANGLE[spot.entrance] + (entryMode === 'tail-in' ? 180 : 0));
}

function pointInRect(x: number, y: number, rect: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
  return x >= rect.minX - 1e-7 && x <= rect.maxX + 1e-7 && y >= rect.minY - 1e-7 && y <= rect.maxY + 1e-7;
}

function pointOnPathInsideDomain(
  point: { x: number; y: number },
  spot: ParkingSpot,
  corridorBounds: readonly Rect[],
): boolean {
  const inSpot = pointInRect(point.x, point.y, { minX: 0, minY: 0, maxX: spot.width, maxY: spot.length });
  return inSpot || corridorBounds.some((rect) => pointInRect(point.x, point.y, rect));
}

function footprint(v: VehicleDimensions, pose: Placement): Polygon {
  return orientedRect(vec(pose.x, pose.y), vehicleWidthForClearance(v), v.length, pose.angle);
}

function segmentInsideDomain(
  start: { x: number; y: number },
  end: { x: number; y: number },
  spot: ParkingSpot,
  corridorBounds: readonly Rect[],
): boolean {
  const domainRects = [
    { minX: 0, minY: 0, maxX: spot.width, maxY: spot.length },
    ...corridorBounds,
  ];
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const breakpoints = [0, 1];
  for (const rect of domainRects) {
    if (deltaX !== 0) {
      for (const x of [rect.minX, rect.maxX]) {
        const t = (x - start.x) / deltaX;
        if (t > 0 && t < 1) breakpoints.push(t);
      }
    }
    if (deltaY !== 0) {
      for (const y of [rect.minY, rect.maxY]) {
        const t = (y - start.y) / deltaY;
        if (t > 0 && t < 1) breakpoints.push(t);
      }
    }
  }
  breakpoints.sort((a, b) => a - b);
  const inside = (t: number) => pointOnPathInsideDomain(
    { x: start.x + deltaX * t, y: start.y + deltaY * t },
    spot,
    corridorBounds,
  );
  for (let index = 0; index < breakpoints.length; index++) {
    if (!inside(breakpoints[index]!)) return false;
    const next = breakpoints[index + 1];
    if (next !== undefined && !inside((breakpoints[index]! + next) / 2)) return false;
  }
  return true;
}

function poseAllowed(
  pose: Placement,
  spot: ParkingSpot,
  corridorBounds: readonly Rect[],
  vehicle: VehicleDimensions,
  obstacles: readonly Polygon[],
): boolean {
  const car = footprint(vehicle, pose);
  const clearance = MANEUVER_CLEARANCE_CM;
  const clearanceFootprint = orientedRect(
    vec(pose.x, pose.y),
    vehicleWidthForClearance(vehicle) + clearance * 2,
    vehicle.length + clearance * 2,
    pose.angle,
  );
  for (const obstacle of obstacles) {
    if (polygonsIntersect(clearanceFootprint, obstacle)) return false;
  }

  for (let i = 0; i < car.length; i++) {
    const start = car[i]!;
    const end = car[(i + 1) % car.length]!;
    if (!segmentInsideDomain(start, end, spot, corridorBounds)) return false;
  }
  return true;
}

function integrate(
  pose: Placement,
  direction: -1 | 1,
  fromSteeringAngle: number,
  toSteeringAngle: number,
  wheelbase: number,
  distance: number,
  footprintRadius: number,
): ManeuverMotionFrame[] {
  const maxCurvature = Math.max(Math.abs(Math.tan(fromSteeringAngle)), Math.abs(Math.tan(toSteeringAngle))) / wheelbase;
  const steps = Math.max(1, Math.ceil((distance * (1 + footprintRadius * maxCurvature)) / COLLISION_STEP_CM));
  const ds = (distance * direction) / steps;
  let x = pose.x;
  let y = pose.y;
  let angle = pose.angle;
  const trajectory: ManeuverMotionFrame[] = [];
  for (let step = 0; step < steps; step++) {
    const steeringProgress = (step + 1) / steps;
    const steeringAngle = fromSteeringAngle + (toSteeringAngle - fromSteeringAngle) * steeringProgress;
    const radians = degToRad(angle);
    x += Math.sin(radians) * ds;
    y -= Math.cos(radians) * ds;
    const curvature = Math.tan(steeringAngle) / wheelbase;
    angle = normalizeAngle(angle + (curvature * ds * 180) / Math.PI);
    trajectory.push({
      pose: { x, y, angle },
      direction,
      steeringAngle,
    });
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

function clearancePenalty(
  pose: Placement,
  vehicle: VehicleDimensions,
  obstacles: readonly Polygon[],
  distance: number,
): number {
  if (obstacles.length === 0) return 0;
  const car = footprint(vehicle, pose);
  const clearance = Math.min(...obstacles.map((obstacle) => polygonDistance(car, obstacle)));
  const risk = Math.max(0, (PREFERRED_OBSTACLE_CLEARANCE_CM - clearance) / PREFERRED_OBSTACLE_CLEARANCE_CM);
  return distance * risk * CLEARANCE_COST_WEIGHT;
}

function preservesPreferredObstacleClearance(
  path: readonly ManeuverMotionFrame[],
  vehicle: VehicleDimensions,
  obstacles: readonly Polygon[],
): boolean {
  return path.every(({ pose }) => {
    const car = footprint(vehicle, pose);
    return obstacles.every((obstacle) =>
      polygonDistance(car, obstacle) >= PREFERRED_OBSTACLE_CLEARANCE_CM);
  });
}

function startPose(
  spot: ParkingSpot,
  settings: ManeuverSettings,
  approachLength: number,
  vehicleLength: number,
): Placement {
  const f = entranceFrame(spot);
  const side = settings.arrivalSide ?? 'straight';
  const offset = settings.startOffset ?? 0;
  if (side === 'straight') {
    const d = approachLength - vehicleLength / 2;
    return {
      x: f.c.x + f.r.x * offset + f.n.x * d,
      y: f.c.y + f.r.y * offset + f.n.y * d,
      angle: f.angle,
    };
  }
  const s = (side === 'left' ? -1 : 1) *
    (f.halfEdge + approachLength - vehicleLength / 2);
  const d = settings.corridorWidth / 2 + offset;
  return {
    x: f.c.x + f.r.x * s + f.n.x * d,
    y: f.c.y + f.r.y * s + f.n.y * d,
    angle: normalizeAngle(f.angle + (side === 'left' ? 90 : -90)),
  };
}

function entryGoal(target: Placement, weight = 1): SearchGoal {
  return {
    pose: target,
    weight,
    reached: (pose, steeringIndex, resolution) =>
      Math.hypot(pose.x - target.x, pose.y - target.y) <= resolution.goalPositionToleranceCm &&
      angleDifference(pose.angle, target.angle) <= resolution.goalAngleToleranceDeg &&
      steeringIndex === 0,
  };
}

function exitGoal(
  spot: ParkingSpot,
  settings: ManeuverSettings,
  vehicleLength: number,
  exitMode: 'nose-out' | 'tail-out',
): SearchGoal {
  const f = entranceFrame(spot);
  const arrival = settings.arrivalSide ?? 'straight';
  const project = (pose: Placement) => ({
    s: (pose.x - f.c.x) * f.r.x + (pose.y - f.c.y) * f.r.y,
    d: (pose.x - f.c.x) * f.n.x + (pose.y - f.c.y) * f.n.y,
  });
  if (arrival === 'straight') {
    // In a straight lane, backing out leaves the car facing inward and driving out leaves it facing outward.
    const dGoal = Math.min(vehicleLength / 2 + 20, settings.approachLength - vehicleLength / 2);
    const heading = exitMode === 'nose-out' ? normalizeAngle(f.angle + 180) : f.angle;
    return {
      pose: { x: f.c.x + f.n.x * dGoal, y: f.c.y + f.n.y * dGoal, angle: heading },
      reached: (pose, steeringIndex, resolution) =>
        steeringIndex === 0 &&
        project(pose).d >= dGoal - resolution.goalPositionToleranceCm &&
        angleDifference(pose.angle, heading) <= resolution.goalAngleToleranceDeg,
    };
  }
  const requested = settings.exitSide ?? 'same';
  const side = requested === 'same' ? arrival : requested;
  const sign = side === 'left' ? -1 : 1;
  const sGoal = sign * Math.min(f.halfEdge + vehicleLength / 2, f.halfEdge + settings.approachLength - vehicleLength / 2);
  const dGoal = settings.corridorWidth / 2;
  const heading = normalizeAngle(f.angle + sign * 90);
  return {
    weight: 4,
    pose: {
      x: f.c.x + f.r.x * sGoal + f.n.x * dGoal,
      y: f.c.y + f.r.y * sGoal + f.n.y * dGoal,
      angle: heading,
    },
    reached: (pose, steeringIndex, resolution) =>
      steeringIndex === 0 &&
      sign * (project(pose).s - sGoal) >= -resolution.goalPositionToleranceCm &&
      angleDifference(pose.angle, heading) <= resolution.goalAngleToleranceDeg,
  };
}

function straightSegment(
  from: Placement,
  to: Placement,
  spot: ParkingSpot,
  corridorBounds: readonly Rect[],
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
  const transitions: ManeuverMotionFrame[][] = [];
  let index = goalIndex;
  while (nodes[index]!.parent >= 0) {
    const node = nodes[index]!;
    transitions.push(node.motionFromParent);
    index = node.parent;
  }
  const start = nodes[index]!;
  return [{
    pose: start.pose,
    direction: start.direction,
    steeringAngle: STEERING_LEVELS[start.steeringIndex + 2]! * maxSteeringAngle,
  }, ...transitions.reverse().flat()];
}

function result(
  status: ManeuverStatus,
  reason: string,
  turningRadius: number | null,
  expandedNodes = 0,
  entryMotion: ManeuverMotionFrame[] = [],
  exit: { status: ManeuverStatus; reason: string; motion: ManeuverMotionFrame[] } = {
    status: 'not-verified',
    reason: 'La salida no se ha calculado.',
    motion: [],
  },
): ManeuverResult {
  const usableEntry = status === 'viable' ? entryMotion : [];
  const usableExit = exit.status === 'viable' ? exit.motion : [];
  return {
    status,
    reason,
    turningRadius,
    expandedNodes,
    entryPath: usableEntry.map((frame) => frame.pose),
    exitPath: usableExit.map((frame) => frame.pose),
    entryMotion: usableEntry,
    exitMotion: usableExit,
    exitStatus: exit.status,
    exitReason: exit.reason,
  };
}

interface PlanContext {
  spot: ParkingSpot;
  domain: readonly Rect[];
  vehicle: VehicleDimensions;
  obstacles: readonly Polygon[];
  turningRadius: number;
  maxSteeringAngle: number;
}

/** Coarse pass followed by a finer retry; coarse hits are not trusted on their own. */
function searchWithRefinement(
  context: PlanContext,
  start: Placement,
  goal: SearchGoal,
  initialDirection: -1 | 1,
  maxExpanded: number,
): ManeuverResult {
  let expandedNodes = 0;
  for (const [resolutionIndex, resolution] of SEARCH_RESOLUTIONS.entries()) {
    const remaining = maxExpanded - expandedNodes;
    if (remaining <= 0) break;
    const stageBudget = resolutionIndex === 0
      ? Math.min(remaining, Math.max(1, Math.floor(maxExpanded / 4)))
      : remaining;
    const searchResult = searchManeuver(
      start,
      goal,
      context.spot,
      context.domain,
      context.vehicle,
      context.obstacles,
      context.turningRadius,
      context.maxSteeringAngle,
      resolution,
      stageBudget,
      expandedNodes,
      initialDirection,
    );
    expandedNodes = searchResult.expandedNodes;
    if (searchResult.status === 'viable') {
      if (resolutionIndex === 0) continue;
      return { ...searchResult, reason: `${searchResult.reason} Se encontró al refinar la resolución de búsqueda.` };
    }
  }
  if (expandedNodes >= maxExpanded) {
    return result(
      'not-verified',
      `Límite de búsqueda alcanzado (${maxExpanded} estados); no se puede concluir que sea inaccesible.`,
      context.turningRadius,
      expandedNodes,
    );
  }
  return result(
    'not-viable',
    `No se encontró una trayectoria con al menos ${MANEUVER_CLEARANCE_CM} cm de holgura tras agotar la búsqueda gruesa y refinada (${SEARCH_RESOLUTIONS[1].stepCm} cm, ${SEARCH_RESOLUTIONS[1].positionBinCm} cm/${SEARCH_RESOLUTIONS[1].angleBinDeg}°).`,
    context.turningRadius,
    expandedNodes,
  );
}

/**
 * Bounded Hybrid-A* search (coarse pass plus finer retry) for entry and, separately, for exit.
 * Entry and exit have independent gear constraints, so the exit is not the reverse of the entry.
 * Search exhaustion is reported as not-verified when the expansion cap is reached.
 */
export function planManeuver(
  spot: ParkingSpot,
  vehicle: VehicleDimensions,
  placement: Placement,
  obstacles: readonly Obstacle[],
  settings: ManeuverSettings,
  maxExpanded = 100000,
): ManeuverResult {
  if (vehicle.turningDiameter === null || vehicle.turningDiameter === undefined) {
    return result('not-verified', 'Introduce el diámetro de giro para usar el modelo bicicleta.', null);
  }
  const turningRadius = vehicle.turningDiameter / 2;
  const entryMode = settings.entryMode ?? 'nose-in';
  const exitMode = settings.exitMode ?? (entryMode === 'tail-in' ? 'nose-out' : 'tail-out');
  const target: Placement = { x: placement.x, y: placement.y, angle: parkedAngle(spot, entryMode) };
  const corridorBounds = domainRects(spot, settings);
  const obstaclePolygons = obstacles.map(obstaclePolygon);
  const actualStart = startPose(spot, settings, settings.approachLength, vehicle.length);
  const maxSteeringAngle = Math.atan(vehicle.wheelbase / turningRadius);
  const context: PlanContext = {
    spot, domain: corridorBounds, vehicle, obstacles: obstaclePolygons, turningRadius, maxSteeringAngle,
  };

  if (!poseAllowed(actualStart, spot, corridorBounds, vehicle, obstaclePolygons)) {
    return result('not-viable', `El vehículo no cabe con ${MANEUVER_CLEARANCE_CM} cm de holgura en la zona de aproximación configurada.`, turningRadius);
  }
  if (!poseAllowed(target, spot, corridorBounds, vehicle, obstaclePolygons)) {
    return result('not-viable', `La posición final colisiona, no conserva la holgura mínima de ${MANEUVER_CLEARANCE_CM} cm o sale del área modelada.`, turningRadius);
  }

  const entry = planEntry(context, settings, actualStart, target, maxExpanded);

  const exitStart = target;
  const exitInitialDirection = exitMode === 'tail-out' ? -1 : 1;
  const exitSearch = searchWithRefinement(
    context,
    exitStart,
    exitGoal(spot, settings, vehicle.length, exitMode),
    exitInitialDirection,
    maxExpanded,
  );
  const exitLabel = exitMode === 'tail-out' ? 'de culo' : 'de frente';
  const exit = {
    status: exitSearch.status,
    motion: exitSearch.entryMotion,
    reason: exitSearch.status === 'viable'
      ? `Se encontró una salida ${exitLabel}.`
      : exitSearch.status === 'not-viable'
        ? `No hay salida ${exitLabel} en el modelo configurado (el pasillo, los obstáculos o el radio de giro lo impiden).`
        : `Salida ${exitLabel} no verificada: ${exitSearch.reason}`,
  };
  return result(
    entry.status,
    entry.reason,
    turningRadius,
    entry.expandedNodes + exitSearch.expandedNodes,
    entry.entryMotion,
    exit,
  );
}

function planEntry(
  context: PlanContext,
  settings: ManeuverSettings,
  actualStart: Placement,
  target: Placement,
  maxExpanded: number,
): ManeuverResult {
  const { spot, vehicle, turningRadius } = context;
  const corridorBounds = context.domain;
  const obstaclePolygons = context.obstacles;

  // Long empty approaches add many equivalent straight-ahead states without helping the turn search.
  const planningApproachLength = Math.min(settings.approachLength, Math.max(vehicle.length, turningRadius * 2));
  const planningStart = startPose(spot, settings, planningApproachLength, vehicle.length);
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

  if ((settings.entryMode ?? 'nose-in') === 'nose-in' && alignedForStraightTravel(start, target)) {
    const straightPath = straightSegment(start, target, spot, corridorBounds, vehicle, obstaclePolygons);
    if (straightPath && preservesPreferredObstacleClearance(straightPath, vehicle, obstaclePolygons)) {
      return result(
        'viable',
        `Se encontró una trayectoria recta con al menos ${MANEUVER_CLEARANCE_CM} cm de holgura frente a obstáculos.`,
        turningRadius,
        0,
        [...prefix.slice(0, -1), ...straightPath],
      );
    }
  }
  const lateral = (settings.arrivalSide ?? 'straight') !== 'straight';
  if (settings.entryMode === 'tail-in' && lateral) {
    // Pass the spot, stop, then back in with the tail swinging into the bay.
    const f = entranceFrame(spot);
    const dStart = (start.x - f.c.x) * f.n.x + (start.y - f.c.y) * f.n.y;
    const sign = settings.arrivalSide === 'left' ? 1 : -1;
    const passS = sign * Math.min(turningRadius, f.halfEdge + settings.approachLength - vehicle.length / 2);
    const pass: Placement = {
      x: f.c.x + f.r.x * passS + f.n.x * dStart,
      y: f.c.y + f.r.y * passS + f.n.y * dStart,
      angle: start.angle,
    };
    const drive = straightSegment(start, pass, spot, corridorBounds, vehicle, obstaclePolygons);
    if (!drive) {
      return result('not-viable', 'No hay espacio para pasar la plaza antes de dar marcha atrás.', turningRadius);
    }
    const back = searchWithRefinement(context, pass, entryGoal(target, 4), -1, maxExpanded);
    if (back.status !== 'viable') return back;
    return result(
      'viable',
      back.reason,
      turningRadius,
      back.expandedNodes,
      [...prefix.slice(0, -1), ...drive.slice(0, -1), ...back.entryMotion],
    );
  }
  if (settings.entryMode === 'tail-in') {
    // Reversing in is planned in two legs: first face the car outward at the spot mouth, then back straight in.
    const f = entranceFrame(spot);
    const dMouth = Math.max(0, Math.min(
      lateral ? Math.max(vehicle.length / 2 + 20, settings.corridorWidth / 2) : vehicle.length / 2 + 20,
      settings.corridorWidth - vehicle.length / 2,
    ));
    const mouth: Placement = {
      x: f.c.x + f.n.x * dMouth,
      y: f.c.y + f.n.y * dMouth,
      angle: target.angle,
    };
    const legA = searchWithRefinement(context, start, entryGoal(mouth, 4), 1, Math.floor(maxExpanded / 2));
    if (legA.status !== 'viable') return legA;
    const mouthPose = legA.entryMotion.at(-1)!.pose;
    const legB = searchWithRefinement(context, mouthPose, entryGoal(target), -1, Math.floor(maxExpanded / 2));
    if (legB.status !== 'viable') return legB;
    return result(
      'viable',
      legB.reason,
      turningRadius,
      legA.expandedNodes + legB.expandedNodes,
      [...prefix.slice(0, -1), ...legA.entryMotion, ...legB.entryMotion.slice(1)],
    );
  }
  const found = searchWithRefinement(context, start, entryGoal(target, lateral ? 4 : 1), 1, maxExpanded);
  if (found.status !== 'viable') return found;
  return result(
    'viable',
    found.reason,
    turningRadius,
    found.expandedNodes,
    [...prefix.slice(0, -1), ...found.entryMotion],
  );
}

function searchManeuver(
  start: Placement,
  goal: SearchGoal,
  spot: ParkingSpot,
  corridorBounds: readonly Rect[],
  vehicle: VehicleDimensions,
  obstaclePolygons: readonly Polygon[],
  turningRadius: number,
  maxSteeringAngle: number,
  resolution: SearchResolution,
  maxExpanded: number,
  expandedOffset: number,
  initialDirection: -1 | 1,
): ManeuverResult {
  const target = goal.pose;
  const weight = goal.weight ?? 1;
  const estimateFor = (pose: Placement, steeringIndex: number) =>
    weight * Math.max(
      heuristic(pose, target, turningRadius, steeringIndex, resolution.stepCm),
      goal.estimate?.(pose) ?? 0,
    );
  const footprintRadius = Math.hypot(
    vehicleWidthForClearance(vehicle) + MANEUVER_CLEARANCE_CM * 2,
    vehicle.length + MANEUVER_CLEARANCE_CM * 2,
  ) / 2;
  const nodes: Node[] = [{
    pose: start,
    cost: 0,
    parent: -1,
    direction: initialDirection,
    steeringIndex: 0,
    motionFromParent: [],
  }];
  const open = new MinHeap();
  open.push({ index: 0, priority: estimateFor(start, 0) });
  const bestCost = new Map<string, number>([[poseKey(start, resolution, initialDirection, 0), 0]]);
  const closed = new Set<string>();
  let expanded = 0;

  while (open.size > 0) {
    const item = open.pop()!;
    const current = nodes[item.index]!;
    const key = poseKey(current.pose, resolution, current.direction, current.steeringIndex);
    if (closed.has(key)) continue;
    if (goal.reached(current.pose, current.steeringIndex, resolution)) {
      const entryMotion = pathTo(nodes, item.index, maxSteeringAngle);
      return result(
        'viable',
        `Se encontró una trayectoria con holgura mínima de ${MANEUVER_CLEARANCE_CM} cm y tolerancia final de ${resolution.goalPositionToleranceCm} cm y ${resolution.goalAngleToleranceDeg}°.`,
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

    const currentSteeringAngle = STEERING_LEVELS[current.steeringIndex + 2]! * maxSteeringAngle;
    const shiftedDirection = current.direction === 1 ? -1 : 1;
    const shiftedKey = poseKey(current.pose, resolution, shiftedDirection, current.steeringIndex);
    const shiftCost = current.cost + GEAR_CHANGE_COST_CM;
    if (item.index !== 0 && !closed.has(shiftedKey) && shiftCost < (bestCost.get(shiftedKey) ?? Infinity)) {
      bestCost.set(shiftedKey, shiftCost);
      const shiftedIndex = nodes.push({
        pose: current.pose,
        cost: shiftCost,
        parent: item.index,
        direction: shiftedDirection,
        steeringIndex: current.steeringIndex,
        motionFromParent: [{
          pose: current.pose,
          direction: shiftedDirection,
          steeringAngle: currentSteeringAngle,
        }],
      }) - 1;
      open.push({
        index: shiftedIndex,
        priority: shiftCost + estimateFor(current.pose, current.steeringIndex),
      });
    }

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
        footprintRadius,
      );
      const nextPose = trajectory[trajectory.length - 1]!.pose;
      if (trajectory.some((frame) => !poseAllowed(frame.pose, spot, corridorBounds, vehicle, obstaclePolygons))) continue;
      const nextKey = poseKey(nextPose, resolution, current.direction, steeringIndex);
      if (closed.has(nextKey)) continue;
      const sampleDistance = resolution.stepCm / trajectory.length;
      const riskCost = trajectory.reduce(
        (cost, frame) => cost + clearancePenalty(frame.pose, vehicle, obstaclePolygons, sampleDistance),
        0,
      );
      const nextCost = current.cost + resolution.stepCm * (current.direction < 0 ? 1.15 : 1) + riskCost;
      if (nextCost >= (bestCost.get(nextKey) ?? Infinity)) continue;
      bestCost.set(nextKey, nextCost);
      const nextIndex = nodes.push({
        pose: nextPose,
        cost: nextCost,
        parent: item.index,
        direction: current.direction,
        steeringIndex,
        motionFromParent: trajectory,
      }) - 1;
      open.push({ index: nextIndex, priority: nextCost + estimateFor(nextPose, steeringIndex) });
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

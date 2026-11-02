import { create } from 'zustand';
import type { ManeuverSettings, Obstacle, ParkingSpot, Placement, VehicleDimensions } from '@/types/domain';
import type { ManeuverResult } from '@/domain/maneuver/maneuver';
import type { SimulationSnapshot } from '@/types/project';

interface SimulationState {
  spot: ParkingSpot;
  vehicle: VehicleDimensions;
  placement: Placement;
  obstacles: Obstacle[];
  maneuverSettings: ManeuverSettings;
  maneuverResult: ManeuverResult | null;
  showGrid: boolean;
  showDimensions: boolean;
  snapToGrid: boolean;
  gridSize: number;
  setSpot: (patch: Partial<ParkingSpot>) => void;
  setVehicle: (patch: Partial<VehicleDimensions>) => void;
  setPlacement: (patch: Partial<Placement>) => void;
  addObstacle: (obstacle: Obstacle) => void;
  updateObstacle: (id: string, update: (obstacle: Obstacle) => Obstacle) => void;
  removeObstacle: (id: string) => void;
  setManeuverSettings: (patch: Partial<ManeuverSettings>) => void;
  setManeuverResult: (result: ManeuverResult | null) => void;
  loadSnapshot: (snapshot: SimulationSnapshot) => void;
  centerVehicle: () => void;
  setView: (patch: Partial<Pick<SimulationState, 'showGrid' | 'showDimensions' | 'snapToGrid' | 'gridSize'>>) => void;
}

/** Valores iniciales de ejemplo editables; no corresponden a ningún modelo real. */
export const useSimulationStore = create<SimulationState>((set) => ({
  spot: { width: 250, length: 500, kind: 'individual', entrance: 'bottom' },
  vehicle: {
    length: 450,
    bodyWidth: 180,
    widthMirrorsFolded: 190,
    widthMirrorsExtended: 205,
    height: 150,
    wheelbase: 270,
    turningDiameter: null,
    doors: [],
  },
  placement: { x: 125, y: 250, angle: 0 },
  obstacles: [],
  maneuverSettings: { corridorWidth: 350, approachLength: 600 },
  maneuverResult: null,
  showGrid: true,
  showDimensions: true,
  snapToGrid: false,
  gridSize: 10,
  setSpot: (patch) => set((s) => ({ spot: { ...s.spot, ...patch }, maneuverResult: null })),
  setVehicle: (patch) => set((s) => ({ vehicle: { ...s.vehicle, ...patch }, maneuverResult: null })),
  setPlacement: (patch) => set((s) => ({ placement: { ...s.placement, ...patch }, maneuverResult: null })),
  addObstacle: (obstacle) => set((s) => ({ obstacles: [...s.obstacles, obstacle], maneuverResult: null })),
  updateObstacle: (id, update) =>
    set((s) => ({ obstacles: s.obstacles.map((obstacle) => (obstacle.id === id ? update(obstacle) : obstacle)), maneuverResult: null })),
  removeObstacle: (id) => set((s) => ({ obstacles: s.obstacles.filter((obstacle) => obstacle.id !== id), maneuverResult: null })),
  setManeuverSettings: (patch) => set((s) => ({
    maneuverSettings: { ...s.maneuverSettings, ...patch },
    maneuverResult: null,
  })),
  setManeuverResult: (maneuverResult) => set({ maneuverResult }),
  loadSnapshot: (snapshot) => set({
    spot: snapshot.spot,
    vehicle: snapshot.vehicle,
    placement: snapshot.placement,
    obstacles: snapshot.obstacles,
    maneuverSettings: snapshot.maneuverSettings,
    showGrid: snapshot.view.showGrid,
    showDimensions: snapshot.view.showDimensions,
    snapToGrid: snapshot.view.snapToGrid,
    gridSize: snapshot.view.gridSize,
    maneuverResult: null,
  }),
  centerVehicle: () => set((s) => ({ placement: { x: s.spot.width / 2, y: s.spot.length / 2, angle: 0 } })),
  setView: (patch) => set(patch),
}));

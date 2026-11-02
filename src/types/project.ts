import { z } from 'zod';
import {
  ManeuverSettingsSchema,
  ObstacleSchema,
  ParkingSpotSchema,
  PlacementSchema,
  VehicleDimensionsSchema,
} from './domain';

export const SimulationSnapshotSchema = z.object({
  spot: ParkingSpotSchema,
  vehicle: VehicleDimensionsSchema,
  placement: PlacementSchema,
  obstacles: z.array(ObstacleSchema),
  maneuverSettings: ManeuverSettingsSchema,
  view: z.object({
    showGrid: z.boolean(),
    showDimensions: z.boolean(),
    snapToGrid: z.boolean(),
    gridSize: z.number().finite().min(1).max(500),
  }),
});
export type SimulationSnapshot = z.infer<typeof SimulationSnapshotSchema>;

export const ProjectSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1),
  name: z.string().trim().min(1).max(100),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  snapshot: SimulationSnapshotSchema,
});
export type Project = z.infer<typeof ProjectSchema>;

export function parseProjectJson(contents: string): Project {
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new Error('El archivo no contiene JSON válido.');
  }
  const parsed = ProjectSchema.safeParse(value);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const location = first?.path.length ? ` (${first.path.join('.')})` : '';
    throw new Error(`El proyecto no cumple el formato esperado${location}: ${first?.message ?? 'datos no válidos'}.`);
  }
  return parsed.data;
}

export function exportProjectJson(project: Project): string {
  return JSON.stringify(ProjectSchema.parse(project), null, 2);
}

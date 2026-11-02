import { z } from 'zod';

const cm = (min: number, max: number) => z.number().finite().min(min).max(max);

/** Plaza rectangular. Origen (0,0) en la esquina superior izquierda; X = anchura, Y = longitud. */
export const ParkingSpotSchema = z.object({
  width: cm(100, 2000),
  length: cm(100, 3000),
  kind: z.enum(['individual', 'double', 'private-garage']),
  /** Lado por el que se accede a la plaza. */
  entrance: z.enum(['top', 'bottom', 'left', 'right']),
});
export type ParkingSpot = z.infer<typeof ParkingSpotSchema>;

export const ObstacleSchema = z.discriminatedUnion('shape', [
  z.object({
    id: z.string(),
    kind: z.enum(['column', 'wall', 'custom']),
    shape: z.literal('rect'),
    x: z.number().finite(),
    y: z.number().finite(),
    width: cm(1, 5000),
    height: cm(1, 5000),
  }),
  z.object({
    id: z.string(),
    kind: z.enum(['column', 'custom']),
    shape: z.literal('circle'),
    x: z.number().finite(),
    y: z.number().finite(),
    radius: cm(1, 1000),
  }),
]);
export type Obstacle = z.infer<typeof ObstacleSchema>;

export const DoorSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  side: z.enum(['left', 'right']),
  /** Coordenada Y local de la bisagra relativa al centro del vehículo; el frontal está en Y negativo. */
  hingeOffset: z.number().finite(),
  length: cm(20, 250),
  thickness: cm(1, 20),
  angleDeg: z.number().finite().min(0).max(120),
  enabled: z.boolean(),
  estimated: z.boolean(),
});
export type Door = z.infer<typeof DoorSchema>;

/** Dimensiones del vehículo (cm). Solo datos introducidos por el usuario o verificables. */
export const VehicleDimensionsSchema = z
  .object({
    length: cm(100, 800),
    bodyWidth: cm(100, 300),
    widthMirrorsFolded: cm(100, 320).nullable().default(null),
    widthMirrorsExtended: cm(100, 340).nullable().default(null),
    height: cm(80, 400),
    wheelbase: cm(100, 500),
    turningDiameter: cm(300, 3000).nullable().default(null),
    doors: z.array(DoorSchema).default([]),
  })
  .refine((v) => v.widthMirrorsFolded === null || v.widthMirrorsFolded >= v.bodyWidth, {
    message: 'La anchura con espejos plegados no puede ser menor que la de la carrocería.',
    path: ['widthMirrorsFolded'],
  })
  .refine((v) => v.widthMirrorsExtended === null || (
    v.widthMirrorsExtended >= v.bodyWidth &&
    (v.widthMirrorsFolded === null || v.widthMirrorsExtended >= v.widthMirrorsFolded)
  ), {
    message: 'La anchura con espejos desplegados no puede ser menor que la carrocería ni que con espejos plegados.',
    path: ['widthMirrorsExtended'],
  })
  .refine((v) => v.wheelbase < v.length, {
    message: 'La distancia entre ejes debe ser menor que la longitud.',
    path: ['wheelbase'],
  })
  .refine((v) => v.doors.every((door) => door.hingeOffset >= -v.length / 2 && door.hingeOffset + door.length <= v.length / 2), {
    message: 'La bisagra y la longitud de cada puerta deben quedar dentro de la longitud del vehículo.',
    path: ['doors'],
  });
export type VehicleDimensions = z.infer<typeof VehicleDimensionsSchema>;

const VehicleIdentitySchema = z.object({
  id: z.string().min(1),
  manufacturer: z.string().trim().min(1, 'Introduce el fabricante.'),
  model: z.string().trim().min(1, 'Introduce el modelo.'),
  generation: z.string().trim(),
  trim: z.string().trim(),
  yearStart: z.number().int().min(1886).max(2200).nullable(),
  yearEnd: z.number().int().min(1886).max(2200).nullable(),
});

export const PersonalVehicleSchema = VehicleIdentitySchema.extend({
  dimensions: VehicleDimensionsSchema,
}).refine(
  (vehicle) => vehicle.yearStart === null || vehicle.yearEnd === null || vehicle.yearEnd >= vehicle.yearStart,
  { message: 'El año final debe ser igual o posterior al año inicial.', path: ['yearEnd'] },
);
export type PersonalVehicle = z.infer<typeof PersonalVehicleSchema>;

/** Registro de catálogo; sus dimensiones parciales conservan como nulos los datos ausentes. */
export const CatalogVehicleDimensionsSchema = z.object({
  length: cm(100, 800).nullable(),
  bodyWidth: cm(100, 300).nullable(),
  height: cm(80, 400).nullable(),
  wheelbase: cm(100, 500).nullable(),
});
export type CatalogVehicleDimensions = z.infer<typeof CatalogVehicleDimensionsSchema>;

export const CatalogVehicleSchema = VehicleIdentitySchema.extend({
  dimensions: CatalogVehicleDimensionsSchema,
  sourceUrl: z.string().url(),
});
export type CatalogVehicle = z.infer<typeof CatalogVehicleSchema>;

export const ManeuverSettingsSchema = z.object({
  corridorWidth: cm(150, 2000),
  approachLength: cm(100, 3000),
  /** Lado del pasillo desde el que llega el coche; `straight` = acceso recto frente a la entrada. */
  arrivalSide: z.enum(['straight', 'left', 'right']).default('straight'),
  /** Desplazamiento inicial a lo largo del pasillo (cm, + = alejarse del eje de la plaza). */
  startOffset: cm(-2000, 2000).default(0),
  entryMode: z.enum(['nose-in', 'tail-in']).default('nose-in'),
  exitMode: z.enum(['nose-out', 'tail-out']).default('tail-out'),
  exitSide: z.enum(['same', 'left', 'right']).default('same'),
});
export type ManeuverSettings = z.infer<typeof ManeuverSettingsSchema>;

/** Posición del centro del vehículo y ángulo (grados; 0 = morro hacia arriba (-Y), positivo = horario). */
export const PlacementSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  angle: z.number().finite(),
});
export type Placement = z.infer<typeof PlacementSchema>;

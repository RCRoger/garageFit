import { describe, expect, it } from 'vitest';
import { vehicleCatalog } from '@/infrastructure/vehicle-database/catalog';
import { PersonalVehicleSchema } from '@/types/domain';

const dimensions = {
  length: 450,
  bodyWidth: 180,
  widthMirrorsFolded: 190,
  widthMirrorsExtended: 205,
  height: 150,
  wheelbase: 270,
  turningDiameter: null,
  doors: [],
};

describe('catálogo local de vehículos', () => {
  it('no inventa modelos ni dimensiones de fábrica', () => {
    expect(vehicleCatalog).toEqual([]);
  });
  it('acepta un vehículo personalizado con años desconocidos', () => {
    expect(PersonalVehicleSchema.safeParse({
      id: 'personal-1',
      manufacturer: 'Fabricante de prueba',
      model: 'Modelo de prueba',
      generation: '',
      trim: '',
      yearStart: null,
      yearEnd: null,
      dimensions,
    }).success).toBe(true);
  });
  it('rechaza un intervalo de años incoherente', () => {
    expect(PersonalVehicleSchema.safeParse({
      id: 'personal-2',
      manufacturer: 'Fabricante de prueba',
      model: 'Modelo de prueba',
      generation: '',
      trim: '',
      yearStart: 2020,
      yearEnd: 2019,
      dimensions,
    }).success).toBe(false);
  });
});

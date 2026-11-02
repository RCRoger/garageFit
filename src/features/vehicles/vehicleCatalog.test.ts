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
  it('incluye un catálogo amplio de modelos y generaciones con fuente', () => {
    expect(vehicleCatalog.length).toBeGreaterThan(7000);
    expect(vehicleCatalog.every((vehicle) => vehicle.sourceUrl.includes('ee99776470a45214bf524cdfe22e5dbf4bd67f93'))).toBe(true);
    expect(vehicleCatalog.some((vehicle) => vehicle.manufacturer === 'SEAT' && vehicle.model === 'Ibiza')).toBe(true);
    expect(vehicleCatalog.some((vehicle) => Object.values(vehicle.dimensions).every((value) => value === null))).toBe(true);
  });
  it('conserva las dimensiones ausentes como desconocidas', () => {
    const vehicle = vehicleCatalog.find((item) => item.manufacturer === 'SEAT' && item.model === 'Ibiza' && item.dimensions.length !== null);
    expect(vehicle).toBeDefined();
    expect(vehicle?.dimensions.length).toBeGreaterThan(100);
    expect(vehicle?.dimensions.bodyWidth).toBeGreaterThan(100);
    expect(vehicle?.dimensions.height).toBeGreaterThan(80);
    expect(vehicle?.dimensions.wheelbase).toBeGreaterThan(100);
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

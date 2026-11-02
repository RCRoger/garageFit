import { describe, expect, it } from 'vitest';
import { filterVehicles } from './searchVehicles';

const records = [
  { manufacturer: 'Acme', model: 'North', generation: 'Generation Two', trim: 'E' },
  { manufacturer: 'Acme', model: 'South', generation: 'Generation One', trim: 'GT' },
  { manufacturer: 'Example Motors', model: 'Northstar', generation: 'Generation Three', trim: 'Base' },
];

describe('búsqueda de vehículos', () => {
  it('busca sin distinguir mayúsculas y minúsculas', () => {
    expect(filterVehicles(records, 'north')).toHaveLength(2);
  });
  it('busca en generación y versión', () => {
    expect(filterVehicles(records, 'gt').map((item) => item.model)).toEqual(['South']);
    expect(filterVehicles(records, 'generation two').map((item) => item.model)).toEqual(['North']);
  });
  it('filtra por fabricante exacto sin distinguir mayúsculas', () => {
    expect(filterVehicles(records, '', 'acme').map((item) => item.model)).toEqual(['North', 'South']);
  });
  it('combina búsqueda y fabricante', () => {
    expect(filterVehicles(records, 'north', 'acme').map((item) => item.model)).toEqual(['North']);
  });
  it('acepta consulta vacía y fabricante vacío', () => {
    expect(filterVehicles(records, '  ')).toEqual(records);
  });
});

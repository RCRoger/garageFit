import type { PersonalVehicle } from '@/types/domain';

export function filterVehicles<T extends Pick<PersonalVehicle, 'manufacturer' | 'model' | 'generation' | 'trim'>>(
  vehicles: readonly T[],
  query: string,
  manufacturer = '',
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  const brand = manufacturer.toLocaleLowerCase();
  return vehicles.filter((vehicle) => {
    if (brand && vehicle.manufacturer.toLocaleLowerCase() !== brand) return false;
    if (!needle) return true;
    return [vehicle.manufacturer, vehicle.model, vehicle.generation, vehicle.trim]
      .some((value) => value.toLocaleLowerCase().includes(needle));
  });
}

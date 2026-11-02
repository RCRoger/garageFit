import rawCatalog from './vehicles.json';
import { CatalogVehicleSchema } from '@/types/domain';

/** Los valores ausentes permanecen nulos; no se completan mediante estimaciones. */
export const vehicleCatalog = CatalogVehicleSchema.array().parse(rawCatalog);

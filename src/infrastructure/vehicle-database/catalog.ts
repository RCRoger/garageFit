import rawCatalog from './vehicles.json';
import { CatalogVehicleSchema } from '@/types/domain';

/** Un array vacío es intencional: no se incluyen dimensiones sin una fuente verificable. */
export const vehicleCatalog = CatalogVehicleSchema.array().parse(rawCatalog);

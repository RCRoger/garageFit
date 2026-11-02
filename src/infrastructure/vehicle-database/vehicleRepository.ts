import { PersonalVehicleSchema, type PersonalVehicle } from '@/types/domain';
import { runTransaction } from '@/infrastructure/persistence/localDatabase';

const CUSTOM_VEHICLES = 'customVehicles';
const FAVORITES = 'vehicleFavorites';

function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return runTransaction(storeName, mode, (tx) => run(tx.objectStore(storeName)));
}

export async function listCustomVehicles(): Promise<PersonalVehicle[]> {
  const rows = await transaction<unknown[]>(CUSTOM_VEHICLES, 'readonly', (store) => store.getAll());
  return rows.map((row) => PersonalVehicleSchema.parse(row));
}

export async function saveCustomVehicle(vehicle: PersonalVehicle): Promise<void> {
  const valid = PersonalVehicleSchema.parse(vehicle);
  await transaction<IDBValidKey>(CUSTOM_VEHICLES, 'readwrite', (store) => store.put(valid));
}

export async function deleteCustomVehicle(id: string): Promise<void> {
  await runTransaction([CUSTOM_VEHICLES, FAVORITES], 'readwrite', (tx) => {
    tx.objectStore(CUSTOM_VEHICLES).delete(id);
    return tx.objectStore(FAVORITES).delete(id);
  });
}

export async function listFavoriteIds(): Promise<string[]> {
  const rows = await transaction<{ id: string }[]>(FAVORITES, 'readonly', (store) => store.getAll());
  return rows.map(({ id }) => id);
}

export async function setVehicleFavorite(id: string, favorite: boolean): Promise<void> {
  if (favorite) {
    await transaction<IDBValidKey>(FAVORITES, 'readwrite', (store) => store.put({ id }));
  } else {
    await transaction<undefined>(FAVORITES, 'readwrite', (store) => store.delete(id));
  }
}

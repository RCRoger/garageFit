const DATABASE_NAME = 'parking-fit-simulator';
const DATABASE_VERSION = 2;
const STORES = ['customVehicles', 'vehicleFavorites', 'projects'] as const;

let databasePromise: Promise<IDBDatabase> | undefined;

export function openLocalDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('IndexedDB no está disponible en este navegador.'));
  }
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const name of STORES) {
        if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = undefined;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error('No se pudo abrir la base de datos local.'));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('La base de datos local está bloqueada por otra pestaña.'));
    };
  });
  return databasePromise;
}

export function runTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  run: (transaction: IDBTransaction) => IDBRequest<T>,
): Promise<T> {
  return openLocalDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const tx = database.transaction(storeNames, mode);
    const request = run(tx);
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error ?? new Error('Error al consultar datos locales.'));
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error ?? new Error('La transacción local no pudo completarse.'));
    tx.onabort = () => reject(tx.error ?? new Error('La transacción local fue cancelada.'));
  }));
}

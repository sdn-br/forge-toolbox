import type { Table } from 'dexie';

/** settles with the result of an IndexedDB request */
export const done = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** the rows of `world` in a table whose rows carry `world`, for tables without an index to range over */
export const rowsOfWorld = <T extends { world: string }, K>(table: Table<T, K>, world: string) =>
  table.filter((row) => row.world === world);

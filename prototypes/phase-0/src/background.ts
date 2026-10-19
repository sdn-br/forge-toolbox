// Service worker: IndexedDB in the extension origin, reached by messaging.
import type { StorageRequest } from './protocol';

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const open = indexedDB.open('forge-toolbox-proto', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('kv');
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  return dbPromise;
}

async function run(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest | void): Promise<unknown> {
  const tx = (await db()).transaction('kv', mode);
  const request = work(tx.objectStore('kv'));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(request ? request.result : undefined);
    tx.onerror = () => reject(tx.error);
  });
}

function handle(req: StorageRequest): Promise<unknown> {
  switch (req.op) {
    case 'put': return run('readwrite', s => s.put(req.value, req.key));
    case 'get': return run('readonly', s => s.get(req.key));
    case 'bulkPut': return run('readwrite', s => { for (const row of req.rows) s.put(row.value, row.key); });
    case 'getAll': return run('readonly', s => s.getAll());
    case 'clear': return run('readwrite', s => s.clear());
  }
}

chrome.runtime.onMessage.addListener((req: StorageRequest, _sender, sendResponse) => {
  handle(req).then(
    data => sendResponse({ ok: true, data }),
    error => sendResponse({ ok: false, error: String(error) }),
  );
  return true;
});
